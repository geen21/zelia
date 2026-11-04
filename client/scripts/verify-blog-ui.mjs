import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { blogPosts } from '../src/pages/blog/posts.js'
import { editorialPosts } from '../src/pages/blog/editorialPosts.js'
import { blogPageTitle, buildBlogSchema } from '../src/pages/blog/blogSeo.js'
import { assertSharedUX } from './fixtures/assert-shared-ux.mjs'

const base = process.env.BLOG_TEST_URL || 'http://127.0.0.1:5187'
const staticBuild = process.env.BLOG_TEST_STATIC === '1'
const pageUrl = (path) => `${base}${path}${staticBuild ? '/' : ''}`
const browser = await chromium.launch({ headless: true })
const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

async function prepare(viewport, javaScriptEnabled = true) {
  const context = await browser.newContext({ viewport, javaScriptEnabled, reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const scriptErrors = []
  page.on('pageerror', (error) => scriptErrors.push(error.message))
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === 'cdn.tailwindcss.com') {
      return route.fulfill({ contentType: 'application/javascript', body: 'window.tailwind = {}' })
    }
    if (url.origin === new URL(base).origin && !url.pathname.startsWith('/api/')) return route.continue()
    return route.abort()
  })
  return { context, page, scriptErrors }
}

async function assertLayout(page) {
  await page.evaluate(() => document.fonts.ready)
  await assertSharedUX(page)
  const issues = await page.evaluate(() => {
    const problems = []
    if (document.documentElement.scrollWidth > innerWidth + 1) problems.push('Document overflow')
    for (const element of document.querySelectorAll('.blog-article__main, .blog-article__title, .editorial-chart, .editorial-table, .editorial-related__grid, .blog-featured, .blog-card')) {
      const rect = element.getBoundingClientRect()
      if (rect.left < -1 || rect.right > innerWidth + 1) problems.push(element.className)
    }
    for (const heading of document.querySelectorAll('.blog-article h1, .blog-article h2, .blog-article h3, .blog-article h4, .blog-page h1, .blog-page h2')) {
      if (getComputedStyle(heading).textTransform !== 'none') problems.push(`Heading case: ${heading.textContent}`)
    }
    return problems
  })
  assert.deepEqual(issues, [])
}

try {
  for (const width of [1440, 390, 320]) {
    const { context, page, scriptErrors } = await prepare({ width, height: 1000 })
    try {
      await page.goto(pageUrl('/blog'), { waitUntil: 'domcontentloaded' })
      await expect(page.locator('.blog-featured__title')).toHaveText(editorialPosts[0].title)
      await expect(page.locator('.blog-page__content h2 a')).toHaveCount(blogPosts.length)
      await expect(page.locator('.blog-featured')).toHaveCSS('display', 'grid')
      await assertLayout(page)
      await page.getByRole('button', { name: 'Vie au lycée', exact: true }).click()
      await expect(page.locator('.blog-page__content h2 a')).toHaveCount(2)
      await page.getByRole('button', { name: 'Tous', exact: true }).click()
      await expect(page.locator('.blog-page__content h2 a')).toHaveCount(blogPosts.length)

      for (const post of editorialPosts) {
        await page.goto(pageUrl(`/blog/${post.slug}`), { waitUntil: 'domcontentloaded' })
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(post.title)
        await expect(page).toHaveTitle(blogPageTitle(post))
        await expect(page.locator('meta[name="description"]')).toHaveCount(1)
        await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', post.description)
        await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://zelia.io/blog/${post.slug}`)
        await expect(page.locator('meta[property="article:modified_time"]')).toHaveAttribute('content', post.updatedIso)
        await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1)
        const schema = await page.locator('script[type="application/ld+json"]').textContent()
        assert.deepEqual(JSON.parse(schema), buildBlogSchema(post))
        await expect(page.locator('.editorial-summary')).toContainText(post.summary)
        await expect(page.locator('table caption')).toHaveCount(1)
        await expect(page.locator('.editorial-chart')).toHaveCount(1)
        await expect(page.locator('.editorial-chart')).toHaveCSS('background-color', 'rgb(248, 250, 252)')
        await expect(page.locator('.editorial-sources li')).toHaveCount(post.sources.length)
        await expect(page.locator('.editorial-video')).toHaveCount(post.videoUrl ? 1 : 0)
        await assertLayout(page)

        const chart = post.sections.find((section) => section.chart).chart
        const bars = await page.locator('.editorial-chart__bar').evaluateAll((elements) => elements.map((element) => ({
          width: parseFloat(element.style.width), left: parseFloat(element.style.left)
        })))
        for (const [index, row] of chart.rows.entries()) {
          const expectedWidth = Math.abs(row.value) / chart.max * (chart.diverging ? 50 : 100)
          assert.ok(Math.abs(bars[index].width - expectedWidth) < 0.001)
          assert.ok(Math.abs(bars[index].left - (chart.diverging ? (row.value < 0 ? 50 - expectedWidth : 50) : 0)) < 0.001)
          const value = `${chart.diverging && row.value > 0 ? '+' : ''}${number.format(row.value)} ${chart.unit}`
          await expect(page.locator('.editorial-chart__label strong').nth(index)).toHaveText(value)
        }

        const toc = page.getByRole('navigation', { name: 'Sommaire de l’article' })
        await expect(toc.locator('a')).toHaveCount(post.sections.length + 2)
        await toc.getByRole('link', { name: post.sections[0].heading, exact: true }).click()
        await expect(page).toHaveURL(new RegExp(`#${post.sections[0].id}$`))
        for (const { question, answer } of post.faq) {
          const summary = page.locator('.editorial-faq summary').filter({ hasText: question })
          await summary.click()
          await expect(page.locator('.editorial-faq details[open]').filter({ hasText: question }).locator('p')).toHaveText(answer)
        }
        await assertLayout(page)
        const internalLinks = await page.locator('.blog-article__main a[href^="/blog/"]').evaluateAll((links) => links.map((link) => link.getAttribute('href')))
        for (const href of internalLinks) assert.ok(blogPosts.some((candidate) => href === `/blog/${candidate.slug}`), `Unknown link: ${href}`)
        console.log(`OK ${width}px ${post.slug}`)
      }

      await page.goto(pageUrl(`/blog/${editorialPosts[0].slug}`), { waitUntil: 'domcontentloaded' })
      await page.locator('.editorial-related__grid > a').first().click()
      const relatedPost = blogPosts.find((post) => post.slug === editorialPosts[0].related[0])
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(relatedPost.title)
      await expect(page).toHaveTitle(blogPageTitle(relatedPost))
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
      await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1)

      await page.goto(pageUrl('/blog/choisir-ses-etudes-sans-pression'), { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Choisir ses études : comment décider sans pression')
      await assertLayout(page)
      assert.deepEqual(scriptErrors, [])
    } finally {
      await context.close()
    }
  }

  if (staticBuild) {
    const { context, page } = await prepare({ width: 390, height: 844 }, false)
    try {
      await page.goto(pageUrl('/blog'), { waitUntil: 'domcontentloaded' })
      await expect(page.locator('.blog-page__content h2 a')).toHaveCount(blogPosts.length)
      for (const post of editorialPosts) {
        await page.goto(pageUrl(`/blog/${post.slug}`), { waitUntil: 'domcontentloaded' })
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(post.title)
        await expect(page.locator('.editorial-summary')).toContainText(post.summary)
        await expect(page.locator('.editorial-chart')).toBeVisible()
        await page.locator('.editorial-faq summary').first().click()
        await expect(page.locator('.editorial-faq details[open] p')).toHaveText(post.faq[0].answer)
      }
      console.log('OK full article content and native FAQ without JavaScript')
    } finally {
      await context.close()
    }
  }
  console.log('Blog UI verified at 1440, 390 and 320 px.')
} finally {
  await browser.close()
}
