/**
 * Post-build SEO pre-rendering script
 * 
 * Generates individual HTML files for blog routes with correct
 * <title>, <meta>, Open Graph, Twitter Card, and JSON-LD tags
 * baked into the static HTML so that search engine crawlers and
 * social media scrapers see the right metadata without executing JS.
 *
 * Runs automatically after `vite build`.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'vite'
import { blogPosts } from '../src/pages/blog/posts.js'
import { blogImageUrl, blogPageTitle, buildBlogSchema, buildBlogIndexSchema } from '../src/pages/blog/blogSeo.js'
import { prerenderMetiers } from './prerender-metiers.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DIST = resolve(__dirname, '..', 'dist')
const ORIGIN = 'https://zelia.io'
const SITE_NAME = 'Zelia'
const LOCALE = 'fr_FR'
const DEFAULT_IMAGE = `${ORIGIN}/assets/images/logo-dark.png`

// Blog index page
const blogIndex = {
  title: 'Blog Zelia - Conseils et actualités sur l\'orientation',
  description: 'Retrouvez nos analyses, astuces et retours d\'expérience pour accompagner les jeunes dans leur quête d\'orientation scolaire et professionnelle.',
  url: `${ORIGIN}/blog`
}

// ── Helpers ─────────────────────────────────────────────────────────

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function injectSeo(html, { title, description, url, type, image, imageAlt, schema, publishedTime, modifiedTime, noindex }) {
  let out = html

  // Replace <title>
  out = out.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escHtml(title)}</title>`
  )

  // Replace meta description (insert before </head> if not already present,
  // since index.html no longer hardcodes a static description tag)
  const descriptionTag = `<meta name="description" content="${escHtml(description)}" data-rh="true" />`
  if (/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/.test(out)) {
    out = out.replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
      descriptionTag
    )
  } else {
    out = out.replace('</head>', `    ${descriptionTag}\n  </head>`)
  }

  // Replace OG tags
  const ogReplacements = {
    'og:type': type || 'website',
    'og:title': title,
    'og:description': description,
    'og:url': url,
    'og:image': image || DEFAULT_IMAGE,
    'og:image:secure_url': image || DEFAULT_IMAGE,
    'og:image:alt': imageAlt || SITE_NAME,
    'og:site_name': SITE_NAME,
    'og:locale': LOCALE
  }
  for (const [prop, val] of Object.entries(ogReplacements)) {
    const regex = new RegExp(`<meta\\s+property="${prop}"\\s+content="[^"]*"\\s*/?>`)
    const tag = `<meta property="${prop}" content="${escHtml(val)}" data-rh="true" />`
    if (regex.test(out)) {
      out = out.replace(regex, tag)
    } else {
      // Insert before </head>
      out = out.replace('</head>', `    ${tag}\n  </head>`)
    }
  }

  // Replace Twitter tags
  const twitterReplacements = {
    'twitter:card': 'summary_large_image',
    'twitter:title': title,
    'twitter:description': description,
    'twitter:url': url,
    'twitter:image': image || DEFAULT_IMAGE,
    'twitter:image:alt': imageAlt || SITE_NAME
  }
  for (const [name, val] of Object.entries(twitterReplacements)) {
    const regex = new RegExp(`<meta\\s+name="${name}"\\s+content="[^"]*"\\s*/?>`)
    const tag = `<meta name="${name}" content="${escHtml(val)}" data-rh="true" />`
    if (regex.test(out)) {
      out = out.replace(regex, tag)
    } else {
      out = out.replace('</head>', `    ${tag}\n  </head>`)
    }
  }

  // Add canonical link
  if (url) {
    const canonicalTag = `<link rel="canonical" href="${escHtml(url)}" data-rh="true" />`
    if (/<link\s+rel="canonical"/.test(out)) {
      out = out.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/, canonicalTag)
    } else {
      out = out.replace('</head>', `    ${canonicalTag}\n  </head>`)
    }
  }

  // Add article:published_time for articles
  if (publishedTime) {
    const timeTag = `<meta property="article:published_time" content="${escHtml(publishedTime)}" data-rh="true" />`
    if (/<meta\s+property="article:published_time"/.test(out)) {
      out = out.replace(/<meta\s+property="article:published_time"\s+content="[^"]*"\s*\/?>/, timeTag)
    } else {
      out = out.replace('</head>', `    ${timeTag}\n  </head>`)
    }
  }

  if (modifiedTime) {
    out = out.replace('</head>', `    <meta property="article:modified_time" content="${escHtml(modifiedTime)}" data-rh="true" />\n  </head>`)
  }

  // Add JSON-LD schema
  if (noindex) {
    out = out.replace('</head>', '    <meta name="robots" content="noindex, follow" data-rh="true" />\n  </head>')
  }
  if (schema) {
    const scriptTag = `<script type="application/ld+json" data-rh="true">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`
    out = out.replace('</head>', `    ${scriptTag}\n  </head>`)
  }

  return out
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const indexHtml = resolve(DIST, 'index.html')
  if (!existsSync(indexHtml)) {
    console.error('❌ dist/index.html not found. Run "vite build" first.')
    process.exit(1)
  }

  const template = readFileSync(indexHtml, 'utf-8')
  let count = 0

  const vite = await createServer({
    root: resolve(__dirname, '..'),
    server: { middlewareMode: true, hmr: false },
    ssr: { noExternal: ['react-helmet-async'] },
    appType: 'custom'
  })
  try {
    const { renderBlogPage } = await vite.ssrLoadModule('/src/pages/blog/BlogPrerender.jsx')

    // Blog index page
    {
      const html = injectSeo(template, {
        title: blogIndex.title,
        description: blogIndex.description,
        url: blogIndex.url,
        type: 'website',
        image: DEFAULT_IMAGE,
        imageAlt: 'Zelia blog',
        schema: buildBlogIndexSchema(blogPosts)
      })
      const dir = resolve(DIST, 'blog')
      mkdirSync(dir, { recursive: true })
      writeFileSync(resolve(dir, 'index.html'), html.replace('<div id="root"></div>', () => `<div id="root" data-prerendered="true">${renderBlogPage()}</div>`), 'utf-8')
      count++
      console.log(`  ✓ /blog`)
    }

    // Individual articles
    for (const post of blogPosts) {
      const html = injectSeo(template, {
        title: blogPageTitle(post),
        description: post.description,
        url: `${ORIGIN}/blog/${post.slug}`,
        type: 'article',
        image: blogImageUrl(post),
        imageAlt: post.title,
        schema: buildBlogSchema(post),
        publishedTime: post.dateIso,
        modifiedTime: post.updatedIso || post.dateIso
      })

      const dir = resolve(DIST, 'blog', post.slug)
      mkdirSync(dir, { recursive: true })
      const content = post.sections ? renderBlogPage(post.slug) : ''
      writeFileSync(resolve(dir, 'index.html'), html.replace('<div id="root"></div>', () => `<div id="root"${content ? ' data-prerendered="true"' : ''}>${content}</div>`), 'utf-8')
      count++
      console.log(`  ✓ /blog/${post.slug}`)
    }

    console.log(`\n✅ Pre-rendered ${count} blog pages with SEO meta tags and five full-text articles.`)
    if (process.env.METIER_SNAPSHOT_PATH) {
      await prerenderMetiers({ vite, template, dist: DIST, injectSeo, snapshotPath: process.env.METIER_SNAPSHOT_PATH })
    } else if (process.env.METIER_PAGES_REQUIRED === 'true' || process.env.VITE_METIER_PAGES_ENABLED === 'true') {
      throw new Error('Instantané métiers obligatoire : utiliser npm run build:metiers')
    }
  } finally {
    await vite.close()
  }
}

main().catch((error) => {
  console.error('Blog pre-rendering failed:', error)
  process.exitCode = 1
})
