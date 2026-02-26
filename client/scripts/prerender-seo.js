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

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DIST = resolve(__dirname, '..', 'dist')
const ORIGIN = 'https://zelia.io'
const SITE_NAME = 'Zelia'
const LOCALE = 'fr_FR'
const DEFAULT_IMAGE = `${ORIGIN}/assets/images/logo-dark.png`

// ── Blog posts data (mirrors src/pages/blog/posts.js) ──────────────
const blogPosts = [
  {
    slug: 'etude-salaire-bon-salaire-ados',
    title: 'Étude sur le salaire : ce qu\'en disent 50 jeunes de 15 à 18 ans',
    description: 'Chiffres clés (moyenne, médiane, mode), valeurs extrêmes, et répartition par tranches avec graphiques simples.',
    dateIso: '2025-12-10T10:00:00+01:00',
    image: null
  },
  {
    slug: 'choisir-ses-etudes-sans-pression',
    title: 'Choisir ses études : comment décider sans pression',
    description: 'Questions simples pour choisir ta formation, droit à l\'erreur, plan B, et comment Zelia peut t\'aider (avec une FAQ).',
    dateIso: '2025-12-05T10:00:00+01:00',
    image: null
  },
  {
    slug: 'metier-bien-fait-pour-soi-mode-emploi',
    title: 'S\'assurer qu\'un métier est bien fait pour soi, mode d\'emploi',
    description: 'Méthode simple pour savoir si un métier est fait pour toi : quotidien réel, valeurs, projection, parcours, et droit de changer d\'avis (avec une FAQ).',
    dateIso: '2025-12-01T10:00:00+01:00',
    image: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=1200&h=630&fit=crop'
  },
  {
    slug: 'ia-remplacer-futur-metier',
    title: 'L\'intelligence artificielle va-t-elle remplacer ton futur métier ?',
    description: 'L\'IA inquiète, mais elle crée aussi des opportunités. Découvre quels métiers vont évoluer et comment te préparer à ce changement inévitable.',
    dateIso: '2025-11-20T10:00:00+01:00',
    image: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1200&h=630&fit=crop'
  },
  {
    slug: 'pourquoi-ecole-ne-t-aide-pas',
    title: 'Pourquoi l\'école ne t\'aide pas à te connaître (et ce qu\'on te cache sur l\'orientation)',
    description: 'L\'école t\'apprend à résoudre des équations, mais pas à savoir qui tu es. Découvre pourquoi le système actuel ne t\'aide pas à trouver ta voie.',
    dateIso: '2025-11-15T10:00:00+01:00',
    image: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=1200&h=630&fit=crop'
  },
  {
    slug: 'accompagner-parents',
    title: 'Accompagner ses parents dans le choix d\'orientation',
    description: 'Transformer la discussion familiale sur l\'orientation en moment constructif et apaisé.',
    dateIso: '2025-08-01T10:00:00+01:00',
    image: null
  }
]

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

function buildArticleSchema(post) {
  const imageUrl = post.image || DEFAULT_IMAGE
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.title,
    "description": post.description,
    "image": imageUrl,
    "datePublished": post.dateIso,
    "author": { "@type": "Organization", "name": "Zelia", "url": ORIGIN },
    "publisher": {
      "@type": "Organization",
      "name": "Zelia",
      "logo": { "@type": "ImageObject", "url": DEFAULT_IMAGE }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `${ORIGIN}/blog/${post.slug}`
    }
  })
}

function injectSeo(html, { title, description, url, type, image, imageAlt, schema, publishedTime }) {
  let out = html

  // Replace <title>
  out = out.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escHtml(title)}</title>`
  )

  // Replace meta description
  out = out.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${escHtml(description)}" />`
  )

  // Replace OG tags
  const ogReplacements = {
    'og:type': type || 'website',
    'og:title': title,
    'og:description': description,
    'og:url': url,
    'og:image': image || DEFAULT_IMAGE,
    'og:site_name': SITE_NAME,
    'og:locale': LOCALE
  }
  for (const [prop, val] of Object.entries(ogReplacements)) {
    const regex = new RegExp(`<meta\\s+property="${prop}"\\s+content="[^"]*"\\s*/?>`)
    const tag = `<meta property="${prop}" content="${escHtml(val)}" />`
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
    'twitter:image': image || DEFAULT_IMAGE
  }
  for (const [name, val] of Object.entries(twitterReplacements)) {
    const regex = new RegExp(`<meta\\s+name="${name}"\\s+content="[^"]*"\\s*/?>`)
    const tag = `<meta name="${name}" content="${escHtml(val)}" />`
    if (regex.test(out)) {
      out = out.replace(regex, tag)
    } else {
      out = out.replace('</head>', `    ${tag}\n  </head>`)
    }
  }

  // Add canonical link
  if (url) {
    const canonicalTag = `<link rel="canonical" href="${escHtml(url)}" />`
    if (/<link\s+rel="canonical"/.test(out)) {
      out = out.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/, canonicalTag)
    } else {
      out = out.replace('</head>', `    ${canonicalTag}\n  </head>`)
    }
  }

  // Add article:published_time for articles
  if (publishedTime) {
    const timeTag = `<meta property="article:published_time" content="${escHtml(publishedTime)}" />`
    if (/<meta\s+property="article:published_time"/.test(out)) {
      out = out.replace(/<meta\s+property="article:published_time"\s+content="[^"]*"\s*\/?>/, timeTag)
    } else {
      out = out.replace('</head>', `    ${timeTag}\n  </head>`)
    }
  }

  // Add JSON-LD schema
  if (schema) {
    const scriptTag = `<script type="application/ld+json">${schema}</script>`
    out = out.replace('</head>', `    ${scriptTag}\n  </head>`)
  }

  return out
}

// ── Main ────────────────────────────────────────────────────────────

function main() {
  const indexHtml = resolve(DIST, 'index.html')
  if (!existsSync(indexHtml)) {
    console.error('❌ dist/index.html not found. Run "vite build" first.')
    process.exit(1)
  }

  const template = readFileSync(indexHtml, 'utf-8')
  let count = 0

  // Blog index page
  {
    const html = injectSeo(template, {
      title: blogIndex.title,
      description: blogIndex.description,
      url: blogIndex.url,
      type: 'website',
      image: DEFAULT_IMAGE,
      imageAlt: 'Zelia blog'
    })
    const dir = resolve(DIST, 'blog')
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolve(dir, 'index.html'), html, 'utf-8')
    count++
    console.log(`  ✓ /blog`)
  }

  // Individual articles
  for (const post of blogPosts) {
    const pageTitle = `${post.title} - Blog Zelia`
    const pageUrl = `${ORIGIN}/blog/${post.slug}`
    const pageImage = post.image || DEFAULT_IMAGE
    const schema = buildArticleSchema(post)

    const html = injectSeo(template, {
      title: pageTitle,
      description: post.description,
      url: pageUrl,
      type: 'article',
      image: pageImage,
      imageAlt: post.title,
      schema,
      publishedTime: post.dateIso
    })

    const dir = resolve(DIST, 'blog', post.slug)
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolve(dir, 'index.html'), html, 'utf-8')
    count++
    console.log(`  ✓ /blog/${post.slug}`)
  }

  console.log(`\n✅ Pre-rendered ${count} blog pages with SEO meta tags.`)
}

main()
