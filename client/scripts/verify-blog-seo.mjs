import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { blogPosts } from '../src/pages/blog/posts.js'
import { editorialPosts } from '../src/pages/blog/editorialPosts.js'
import { articleText, blogPageTitle, buildBlogSchema } from '../src/pages/blog/blogSeo.js'

const client = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const origin = 'https://zelia.io'
const expectedCharts = {
  'parcoursup-2027-dates-nouveautes': [66.5, 91.4],
  'nombre-eleves-par-classe-lycee': [25.3, 30.5, 18.7],
  'blocus-lycee-legal-risques': [356, 45],
  'prepa-cpge-c-est-quoi': [1.5, -1.2, -3.4],
  'bac-5-premier-emploi-insertion': [72, 59]
}
const escapeHtml = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const readPage = (slug) => readFileSync(resolve(client, 'dist', 'blog', ...(slug ? [slug] : []), 'index.html'), 'utf8')
const schemas = (html) => [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]))
const sitemap = readFileSync(resolve(client, 'public', 'sitemap.xml'), 'utf8')
const builtSitemap = readFileSync(resolve(client, 'dist', 'sitemap.xml'), 'utf8')

assert.deepEqual(editorialPosts.map((post) => post.slug), Object.keys(expectedCharts))
assert.equal(new Set(blogPosts.map((post) => post.slug)).size, blogPosts.length)

for (const post of blogPosts) {
  const html = readPage(post.slug)
  const canonical = `${origin}/blog/${post.slug}`
  assert.ok(html.includes(`<title>${escapeHtml(blogPageTitle(post))}</title>`), `${post.slug}: title`)
  assert.ok(html.includes(`<meta name="description" content="${escapeHtml(post.description)}" data-rh="true"`))
  assert.ok(html.includes(`<link rel="canonical" href="${canonical}" data-rh="true"`))
  assert.ok(html.includes(`<meta property="og:url" content="${canonical}"`))
  assert.ok(html.includes(`<meta property="article:modified_time" content="${post.updatedIso || post.dateIso}"`))
  assert.equal((html.match(/<link rel="canonical"/g) || []).length, 1)
  assert.deepEqual(schemas(html), [buildBlogSchema(post)])
  assert.ok(sitemap.includes(`<loc>${canonical}</loc>`), `${post.slug}: sitemap entry`)
  assert.ok(builtSitemap.includes(`<loc>${canonical}</loc>`), `${post.slug}: built sitemap entry`)

  if (!post.sections) continue
  const words = articleText(post).split(/\s+/u).length
  assert.ok(words >= 650 && words <= 800, `${post.slug}: ${words} words, expected 650–800`)
  assert.ok(post.metaTitle.length <= 60, `${post.slug}: meta title too long`)
  assert.ok(post.description.length <= 160, `${post.slug}: description too long`)
  assert.equal((html.match(/<h1\b/g) || []).length, 1)
  assert.ok(html.includes(post.summary), `${post.slug}: summary must be in static HTML`)
  assert.ok(html.includes('<table>') && html.includes('scope="row"') && html.includes('<caption>'))
  assert.ok(html.includes('<figure class="editorial-chart"'))
  assert.ok(!html.includes('Compléter la rédaction définitive'))
  assert.ok(!/\[lien interne|href="#"|href="undefined"/u.test(html))
  assert.deepEqual(post.sections.flatMap((section) => section.chart?.rows.map((row) => row.value) || []), expectedCharts[post.slug])

  for (const section of post.sections) {
    assert.ok(section.heading.endsWith('?'), `${post.slug}: H2 must be a question`)
    assert.ok(html.includes(`id="${section.id}"`))
    for (const link of section.links || []) assert.ok(blogPosts.some((candidate) => candidate.slug === link.slug))
  }
  for (const slug of post.related) {
    assert.ok(blogPosts.some((candidate) => candidate.slug === slug), `${post.slug}: missing related post ${slug}`)
    assert.ok(html.includes(`href="/blog/${slug}"`))
  }
  for (const source of post.sources) {
    assert.equal(new URL(source.url).protocol, 'https:')
    assert.ok(html.includes(`href="${escapeHtml(source.url)}"`))
  }
  for (const { question, answer } of post.faq) {
    assert.ok(html.includes(`<summary>${escapeHtml(question)}</summary>`), `${post.slug}: FAQ question`)
    assert.ok(html.includes(escapeHtml(answer)), `${post.slug}: FAQ answer`)
  }
  console.log(`OK ${post.slug}: ${words} words, full HTML, chart, FAQ and SEO`)
}

const index = readPage()
assert.ok(index.includes('blog-featured'))
assert.equal(schemas(index)[0].mainEntity.itemListElement.length, blogPosts.length)
for (const post of blogPosts) assert.ok(index.includes(`href="/blog/${post.slug}"`), `Index: missing ${post.slug}`)
console.log(`Blog SEO verified: ${blogPosts.length} articles, including all five new full-text pages.`)
