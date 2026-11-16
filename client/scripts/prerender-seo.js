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

const staticPublicPages = [
  {
    outputFile: ['home.html'],
    title: 'Zelia - Trouve ton orientation scolaire et professionnelle',
    description: 'Zélia accompagne les 15-20 ans pour apprendre à mieux se connaître et préparer sereinement leur futur.',
    url: `${ORIGIN}/`,
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          name: 'Zélia',
          url: `${ORIGIN}/`,
          logo: DEFAULT_IMAGE
        },
        {
          '@type': 'WebSite',
          name: 'Zélia',
          url: `${ORIGIN}/`
        }
      ]
    }
  },
  {
    outputFile: ['orientation', 'index.html'],
    title: "Test d'orientation gratuit en ligne (5 min) - Zélia",
    description: "Fais le test d'orientation gratuit Zélia en 20 questions rapides : découvre ton profil, les métiers et les formations post-bac qui te correspondent.",
    url: `${ORIGIN}/orientation`
  },
  {
    outputFile: ['parents', 'index.html'],
    title: 'Retrouvez le dialogue avec votre enfant | Formation parents Zélia',
    description: "Une formation d'une heure pour les parents de lycéens : devenez un allié orientation, retrouvez le dialogue et accompagnez votre ado sans conflit. Satisfait ou remboursé sous 14 jours.",
    url: `${ORIGIN}/parents`
  },
  {
    outputFile: ['formations', 'index.html'],
    title: 'Formations en France - Toutes les formations post-bac | Zelia',
    description: "Explore des dizaines de milliers de formations en France : BTS, BUT, licences, écoles d'ingénieurs et plus. Trouve la formation qui te correspond avec Zelia.",
    url: `${ORIGIN}/formations`
  },
  {
    outputFile: ['login', 'index.html'],
    title: 'Connexion à ton espace orientation - Zélia',
    description: "Connecte-toi à ton espace Zélia pour retrouver ton bilan d'orientation, tes idées de métiers et tes formations favorites.",
    url: `${ORIGIN}/login`
  },
  {
    outputFile: ['register', 'index.html'],
    title: 'Inscription gratuite - Crée ton espace Zélia',
    description: "Crée gratuitement ton compte Zélia pour sauvegarder ton test d'orientation, découvrir ton profil complet et explorer tes formations.",
    url: `${ORIGIN}/register`
  },
  {
    outputFile: ['legal', 'mentions-legales', 'index.html'],
    title: 'Mentions légales - Zélia',
    description: "Mentions légales de la plateforme d'orientation scolaire et professionnelle Zélia : éditeur, hébergeur, contact et propriété intellectuelle.",
    url: `${ORIGIN}/legal/mentions-legales`
  },
  {
    outputFile: ['legal', 'conditions', 'index.html'],
    title: 'CGU, CGV & Politique de confidentialité - Zélia',
    description: 'Conditions générales d\'utilisation, conditions générales de vente et politique de confidentialité RGPD de la plateforme Zélia.',
    url: `${ORIGIN}/legal/conditions`
  }
]

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

    // Static public pages (head metadata + canonical + JSON-LD)
    for (const pageMeta of staticPublicPages) {
      const html = injectSeo(template, {
        title: pageMeta.title,
        description: pageMeta.description,
        url: pageMeta.url,
        type: 'website',
        image: DEFAULT_IMAGE,
        imageAlt: SITE_NAME,
        schema: pageMeta.schema
      })
      const outPath = resolve(DIST, ...pageMeta.outputFile)
      mkdirSync(dirname(outPath), { recursive: true })
      writeFileSync(outPath, html, 'utf-8')
      console.log(`  ✓ ${pageMeta.url.replace(ORIGIN, '')}`)
    }

    // Genuine static 404 document served by Nginx with HTTP 404 status
    const notFoundHtml = injectSeo(template, {
      title: 'Page introuvable - Zélia',
      description: "Cette page n'existe pas ou a été déplacée.",
      url: '',
      type: 'website',
      image: DEFAULT_IMAGE,
      imageAlt: SITE_NAME,
      noindex: true
    }).replace(
      '<div id="root"></div>',
      () => '<div id="root"><main style="max-width:36rem;margin:5rem auto;padding:0 1.5rem;text-align:center"><h1 style="font-size:1.875rem;font-weight:600;margin-bottom:0.75rem">Page introuvable</h1><p style="color:#4b5563;margin-bottom:1.5rem">L&#39;adresse demandée n&#39;existe pas ou a été déplacée.</p><a href="/" style="display:inline-block;padding:0.625rem 1.25rem;background:#111827;color:#fff;border-radius:0.5rem;text-decoration:none">Retour à l&#39;accueil</a></main></div>'
    )
    writeFileSync(resolve(DIST, '404.html'), notFoundHtml, 'utf-8')

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
