import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import {
  buildFormationEditorialSummary,
  buildMapsSearchUrl,
  cleanBraceNote,
  getDiplomaFamily,
  getFormationSlug,
  getFormationTitle,
  getInitials,
  getStatusLabel,
  isApprentissage,
  parseFormationIdFromParam
} from '../../client/src/lib/formationDisplay.js'
import { normalizeExternalHttpUrl, withZeliaUtm } from '../../client/src/lib/outboundUrl.js'
import { canonicalFormationColumns, canonicalUrlsEnabled } from './formationCanonical.js'
import { deduplicateFormationRows } from './formationSeoIndex.js'
import { withFormationDisplayFields } from './slug.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_DIST_DIR = resolve(__dirname, '..', '..', 'client', 'dist')
const ORIGIN = 'https://zelia.io'
const SITE_NAME = 'Zelia'
const LOCALE = 'fr_FR'
const DEFAULT_IMAGE = `${ORIGIN}/assets/images/logo-dark.png`
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATA_CACHE_TTL_MS = 15 * 60 * 1000
const DATA_CACHE_MAX_ENTRIES = 2000

const PUBLIC_FORMATION_COLUMNS = `id,
  nm,
  nmc,
  fl,
  etab_nom,
  etab_uai,
  region,
  departement,
  commune,
  tc,
  tf,
  fiche,
  etab_url,
  annee,
  dataviz,
  gti,
  gta,
  code_formation,
  image,
  email,
  telephone,
  facebook,
  linkedin,
  youtube,
  app,
  "int",
  aut`

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function isStatementTimeout(error) {
  const message = error?.message || ''
  return error?.code === '57014' || message.includes('statement timeout') || message.includes('canceling statement')
}

function isRowNotFound(error) {
  return error?.code === 'PGRST116'
}

async function queryWithRetry(queryFn) {
  const first = await queryFn()
  if (first.error && isStatementTimeout(first.error)) {
    return queryFn()
  }
  return first
}

export function injectFormationHead(templateHtml, {
  title,
  description,
  canonicalUrl,
  type = 'article',
  image,
  imageAlt,
  schema,
  noindex = false
}) {
  let out = templateHtml
  const resolvedImage = normalizeExternalHttpUrl(image) || DEFAULT_IMAGE

  out = out.replace(/<title>[^<]*<\/title>/, `<title>${escHtml(title)}</title>`)

  const descTag = `<meta name="description" content="${escHtml(description)}" data-rh="true" />`
  if (/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/.test(out)) {
    out = out.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/, descTag)
  } else {
    out = out.replace('</head>', `    ${descTag}\n  </head>`)
  }

  if (canonicalUrl) {
    const canonicalTag = `<link rel="canonical" href="${escHtml(canonicalUrl)}" data-rh="true" />`
    if (/<link\s+rel="canonical"/.test(out)) {
      out = out.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/, canonicalTag)
    } else {
      out = out.replace('</head>', `    ${canonicalTag}\n  </head>`)
    }
  }

  if (noindex) {
    out = out.replace('</head>', '    <meta name="robots" content="noindex, nofollow" data-rh="true" />\n  </head>')
  }

  const ogTags = {
    'og:type': type,
    'og:title': title,
    'og:description': description,
    ...(canonicalUrl ? { 'og:url': canonicalUrl } : {}),
    'og:image': resolvedImage,
    'og:image:secure_url': resolvedImage,
    'og:image:alt': imageAlt || SITE_NAME,
    'og:site_name': SITE_NAME,
    'og:locale': LOCALE
  }
  for (const [prop, val] of Object.entries(ogTags)) {
    const tag = `<meta property="${prop}" content="${escHtml(val)}" data-rh="true" />`
    out = out.replace('</head>', `    ${tag}\n  </head>`)
  }

  const twitterTags = {
    'twitter:card': 'summary_large_image',
    'twitter:title': title,
    'twitter:description': description,
    ...(canonicalUrl ? { 'twitter:url': canonicalUrl } : {}),
    'twitter:image': resolvedImage,
    'twitter:image:alt': imageAlt || SITE_NAME
  }
  for (const [name, val] of Object.entries(twitterTags)) {
    const tag = `<meta name="${name}" content="${escHtml(val)}" data-rh="true" />`
    out = out.replace('</head>', `    ${tag}\n  </head>`)
  }

  if (schema) {
    const scriptTag = `<script type="application/ld+json" data-rh="true">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`
    out = out.replace('</head>', `    ${scriptTag}\n  </head>`)
  }

  return out
}

export function renderFormationBodyHtml(formation, related = []) {
  const title = getFormationTitle(formation)
  const initials = getInitials(formation.etab_nom || title)
  const statusLabel = getStatusLabel(formation.tc)
  const diplomaFamily = getDiplomaFamily(formation)
  const location = [formation.commune, formation.departement].filter(Boolean).join(', ')
  const apprentissage = isApprentissage(formation.app)
  const internat = cleanBraceNote(formation.int)
  const selection = cleanBraceNote(formation.aut)
  const filiere = Array.isArray(formation.fl) ? formation.fl.find(Boolean) : ''
  const modalites = Array.isArray(formation.tf) ? formation.tf.filter(Boolean) : []
  const summaryParagraphs = buildFormationEditorialSummary(formation)

  const etabUrl = normalizeExternalHttpUrl(formation.etab_url)
  const ficheUrl = normalizeExternalHttpUrl(formation.fiche)
  const datavizUrl = normalizeExternalHttpUrl(formation.dataviz)
  const facebookUrl = normalizeExternalHttpUrl(formation.facebook)
  const linkedinUrl = normalizeExternalHttpUrl(formation.linkedin)
  const youtubeUrl = normalizeExternalHttpUrl(formation.youtube)
  const imageUrl = normalizeExternalHttpUrl(formation.image)
  const mapsUrl = buildMapsSearchUrl(formation)
  const validEmail = formation.email && EMAIL_PATTERN.test(formation.email) ? formation.email : ''

  const badges = [
    statusLabel ? `<span class="fp-badge">${escHtml(statusLabel)}</span>` : '',
    diplomaFamily ? `<span class="fp-badge fp-badge--dark">${escHtml(diplomaFamily)}</span>` : '',
    apprentissage ? '<span class="fp-badge">Alternance possible</span>' : '',
    formation.commune ? `<span class="fp-badge">${escHtml(formation.commune)}</span>` : ''
  ].filter(Boolean).join('')

  const externalLinks = [
    etabUrl ? `<a href="${escHtml(withZeliaUtm(etabUrl))}" target="_blank" rel="noopener noreferrer" class="fp-link-row">Site de l&#39;établissement</a>` : '',
    ficheUrl ? `<a href="${escHtml(withZeliaUtm(ficheUrl))}" target="_blank" rel="noopener noreferrer" class="fp-link-row">Fiche officielle Parcoursup</a>` : '',
    datavizUrl ? `<a href="${escHtml(withZeliaUtm(datavizUrl))}" target="_blank" rel="noopener noreferrer" class="fp-link-row">Statistiques d&#39;admission</a>` : '',
    mapsUrl ? `<a href="${escHtml(withZeliaUtm(mapsUrl))}" target="_blank" rel="noopener noreferrer" class="fp-link-row">Voir sur la carte</a>` : ''
  ].filter(Boolean).join('')

  const relatedCards = related.map((item) => {
    const itemTitle = getFormationTitle(item)
    const itemSlug = getFormationSlug(item)
    const itemMeta = [item.etab_nom, item.commune].filter(Boolean).join(' · ')
    return `<a href="/formations/${escHtml(itemSlug)}" class="fp-mini-card"><div class="fp-mini-monogram">${escHtml(getInitials(item.etab_nom || itemTitle))}</div><div class="fp-mini-title">${escHtml(itemTitle)}</div><div class="fp-mini-meta">${escHtml(itemMeta)}</div></a>`
  }).join('')

  const hasContactCard = Boolean(imageUrl || formation.telephone || validEmail || facebookUrl || linkedinUrl || youtubeUrl)

  return `<div class="fp-page">
  <header class="fp-hero">
    <div class="container">
      <nav class="fp-breadcrumb" aria-label="Fil d'Ariane">
        <a href="/">Accueil</a><span class="sep">/</span><a href="/formations">Formations</a><span class="sep">/</span><span class="current">${escHtml(title)}</span>
      </nav>
      <div class="fp-hero-top">
        <div class="fp-monogram" style="width:76px;height:76px;font-size:25.84px">${escHtml(initials)}</div>
        <div class="fp-hero-badges">${badges}</div>
      </div>
      <h1>${escHtml(title)}</h1>
      <p class="fp-hero-school">${escHtml(formation.etab_nom || 'Établissement à préciser')}${location ? `<span class="dot">·</span>${escHtml(location)}` : ''}</p>
      <div class="fp-hero-actions">
        ${ficheUrl ? `<a href="${escHtml(withZeliaUtm(ficheUrl))}" target="_blank" rel="noopener noreferrer" class="fp-btn fp-btn--primary">Voir la fiche Parcoursup</a>` : ''}
        <a href="/orientation" class="fp-btn fp-btn--ghost">Est-ce fait pour moi ?</a>
      </div>
    </div>
  </header>
  <main class="fp-body">
    <div class="container">
      <div class="fp-grid">
        <div class="fp-main">
          <section class="fp-card">
            <h2>Présentation de la formation</h2>
            ${summaryParagraphs.map((p) => `<p>${escHtml(p)}</p>`).join('')}
          </section>
          <section class="fp-card">
            <h2>Informations clés</h2>
            <div class="fp-kv-grid">
              ${statusLabel ? `<div class="fp-kv"><div class="fp-kv-label">Statut</div><div class="fp-kv-value">${escHtml(statusLabel)}</div></div>` : ''}
              ${filiere ? `<div class="fp-kv"><div class="fp-kv-label">Filière</div><div class="fp-kv-value">${escHtml(filiere)}</div></div>` : ''}
              <div class="fp-kv"><div class="fp-kv-label">Alternance</div><div class="fp-kv-value">${apprentissage ? 'Possible' : 'Non renseignée'}</div></div>
              ${formation.code_formation ? `<div class="fp-kv"><div class="fp-kv-label">Code formation</div><div class="fp-kv-value">${escHtml(formation.code_formation)}</div></div>` : ''}
              ${formation.annee ? `<div class="fp-kv"><div class="fp-kv-label">Données</div><div class="fp-kv-value">Rentrée ${escHtml(formation.annee)}</div></div>` : ''}
            </div>
            ${modalites.length > 0 ? `<div class="fp-tag-row">${modalites.map((tag) => `<span class="fp-tag">${escHtml(tag)}</span>`).join('')}</div>` : ''}
            ${internat ? `<div class="fp-note" style="margin-top:16px"><span>${escHtml(internat)}</span></div>` : ''}
            ${selection ? `<div class="fp-note" style="margin-top:${internat ? 12 : 16}px"><span>${escHtml(selection)}</span></div>` : ''}
          </section>
          <section class="fp-card">
            <h2>Établissement</h2>
            <p><strong>${escHtml(formation.etab_nom || 'Établissement à préciser')}</strong>${location ? ` — ${escHtml(location)}${formation.region ? `, ${escHtml(formation.region)}` : ''}` : ''}</p>
            <div class="fp-links-list">${externalLinks}</div>
          </section>
        </div>
        <aside class="fp-aside">
          <div class="fp-card fp-cta-card">
            <h3>Pas sûr(e) que ce soit fait pour toi ?</h3>
            <p>Fais le test d&#39;orientation gratuit de Zélia et découvre les formations qui te correspondent vraiment.</p>
            <a href="/orientation" class="fp-btn fp-btn--primary">Lancer le test gratuit</a>
          </div>
          ${hasContactCard ? `<div class="fp-card"><h2>Contact</h2><div class="fp-links-list">${formation.telephone ? `<a href="tel:${escHtml(formation.telephone)}" class="fp-link-row">${escHtml(formation.telephone)}</a>` : ''}${validEmail ? `<a href="mailto:${escHtml(validEmail)}" class="fp-link-row">Contacter par email</a>` : ''}</div></div>` : ''}
          <div class="fp-card">
            <h2>Localisation</h2>
            <p>${escHtml([formation.commune, formation.departement, formation.region].filter(Boolean).join(' · '))}</p>
          </div>
        </aside>
      </div>
      ${related.length > 0 ? `<section class="fp-related"><h2>Autres formations à ${escHtml(formation.etab_nom || '')}</h2><div class="fp-related-grid">${relatedCards}</div></section>` : ''}
    </div>
  </main>
</div>`
}

function renderNotFoundBodyHtml() {
  return `<div class="fp-page"><div class="fp-empty"><h1>Formation introuvable</h1><p>Cette formation n&#39;existe pas ou a été retirée. Explore les autres formations disponibles.</p><a href="/formations" class="fp-btn fp-btn--primary">Voir toutes les formations</a></div></div>`
}

export function createFormationSsrRouter({
  db,
  seoIndex = null,
  distDir = DEFAULT_DIST_DIR,
  templateHtml: fixedTemplateHtml = null,
  now = Date.now
}) {
  const router = express.Router()
  let templateCache = { html: null, mtimeMs: 0 }
  const dataCache = new Map()

  function getTemplateHtml() {
    if (fixedTemplateHtml) return fixedTemplateHtml
    const indexPath = resolve(distDir, 'index.html')
    if (!existsSync(indexPath)) {
      return '<!doctype html><html lang="fr"><head><meta charset="UTF-8" /><title>Zelia</title></head><body><div id="root"></div></body></html>'
    }
    const stat = statSync(indexPath)
    if (!templateCache.html || templateCache.mtimeMs !== stat.mtimeMs) {
      templateCache = { html: readFileSync(indexPath, 'utf8'), mtimeMs: stat.mtimeMs }
    }
    return templateCache.html
  }

  async function fetchFormationRow(id) {
    return queryWithRetry(() => db
      .from('formation_france')
      .select(canonicalFormationColumns(PUBLIC_FORMATION_COLUMNS))
      .eq('id', id)
      .single()
    )
  }

  async function fetchRelatedFormations(schoolName, excludeId) {
    if (!schoolName) return []
    const { data, error } = await queryWithRetry(() => db
      .from('formation_france')
      .select(canonicalFormationColumns(PUBLIC_FORMATION_COLUMNS))
      .eq('etab_nom', schoolName)
      .order('annee', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })
      .limit(40)
    )
    if (error || !data?.length) return []
    const warm = seoIndex?.peekSnapshot()
    let candidates = deduplicateFormationRows(data)
    if (warm) {
      const onlyCanonical = candidates.filter((item) => warm.canonicalIdSet.has(String(item.id)))
      if (onlyCanonical.length > 0) candidates = onlyCanonical
    }
    return candidates
      .filter((item) => String(item.id) !== String(excludeId))
      .slice(0, 6)
      .map(withFormationDisplayFields)
  }

  function sendHtml(res, status, html, cacheControl) {
    res.removeHeader('Content-Security-Policy')
    res.status(status)
    res.set('Content-Type', 'text/html; charset=UTF-8')
    if (cacheControl) res.set('Cache-Control', cacheControl)
    res.send(html)
  }

  router.get('/formations/:slug', async (req, res) => {
    try {
      const requestedSlug = String(req.params.slug || '').trim()
      const id = parseFormationIdFromParam(requestedSlug)
      const template = getTemplateHtml()

      if (!id) {
        const html = injectFormationHead(template, {
          title: 'Formation introuvable - Zelia',
          description: "Cette formation n'est plus disponible sur Zelia.",
          canonicalUrl: '',
          noindex: true
        }).replace('<div id="root"></div>', () => `<div id="root">${renderNotFoundBodyHtml()}</div>`)
        return sendHtml(res, 404, html, 'no-store')
      }

      const cached = dataCache.get(String(id))
      let resolvedPayload = cached && now() - cached.at < DATA_CACHE_TTL_MS ? cached.payload : null

      if (!resolvedPayload) {
        const { data: rawRow, error: rowError } = await fetchFormationRow(id)
        if (rowError) {
          if (isRowNotFound(rowError)) {
            const html = injectFormationHead(template, {
              title: 'Formation introuvable - Zelia',
              description: "Cette formation n'est plus disponible sur Zelia.",
              canonicalUrl: '',
              noindex: true
            }).replace('<div id="root"></div>', () => `<div id="root">${renderNotFoundBodyHtml()}</div>`)
            return sendHtml(res, 404, html, 'no-store')
          }
          res.set('Retry-After', '60')
          return sendHtml(res, 503, '<!doctype html><html lang="fr"><head><meta charset="UTF-8" /><title>Service temporairement indisponible - Zelia</title></head><body><p>Service temporairement indisponible. Merci de réessayer dans quelques instants.</p></body></html>', 'no-store')
        }

        let targetRow = rawRow
        if (seoIndex) {
          const canonicalId = await seoIndex.resolveCanonicalIdForRow(rawRow)
          if (canonicalId && String(canonicalId) !== String(rawRow.id)) {
            const { data: winnerRow, error: winnerError } = await fetchFormationRow(canonicalId)
            if (winnerError && !isRowNotFound(winnerError)) {
              res.set('Retry-After', '60')
              return sendHtml(res, 503, '<!doctype html><html lang="fr"><head><meta charset="UTF-8" /><title>Service temporairement indisponible - Zelia</title></head><body><p>Service temporairement indisponible.</p></body></html>', 'no-store')
            }
            if (winnerRow) targetRow = winnerRow
          }
        }

        const formation = withFormationDisplayFields(targetRow)
        const related = String(targetRow.id) === String(rawRow.id)
          ? await fetchRelatedFormations(formation.etab_nom, formation.id)
          : []

        resolvedPayload = {
          requestedId: String(rawRow.id),
          canonicalId: String(formation.id),
          formation,
          related
        }

        if (dataCache.size >= DATA_CACHE_MAX_ENTRIES) {
          const oldestKey = dataCache.keys().next().value
          if (oldestKey !== undefined) dataCache.delete(oldestKey)
        }
        dataCache.set(String(id), { payload: resolvedPayload, at: now() })
      }

      const { formation, related, canonicalId, requestedId } = resolvedPayload
      const canonicalSlug = getFormationSlug(formation)
      const canonicalUrl = `${ORIGIN}/formations/${canonicalSlug}`

      if (canonicalId !== requestedId || (!canonicalUrlsEnabled() && requestedSlug !== canonicalSlug)) {
        res.set('Cache-Control', 'public, max-age=3600')
        return res.redirect(301, canonicalUrl)
      }

      const title = getFormationTitle(formation)
      const location = [formation.commune, formation.departement].filter(Boolean).join(', ')
      const description = [
        title,
        formation.etab_nom ? `proposé par ${formation.etab_nom}` : '',
        location ? `à ${location}` : ''
      ].filter(Boolean).join(' ').slice(0, 155)
      const cleanEtabUrl = normalizeExternalHttpUrl(formation.etab_url)

      const schema = {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Course',
            name: title,
            description: description || title,
            url: canonicalUrl,
            provider: {
              '@type': 'EducationalOrganization',
              name: formation.etab_nom || 'Établissement',
              ...(cleanEtabUrl ? { sameAs: cleanEtabUrl } : {})
            }
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${ORIGIN}/` },
              { '@type': 'ListItem', position: 2, name: 'Formations', item: `${ORIGIN}/formations` },
              { '@type': 'ListItem', position: 3, name: title, item: canonicalUrl }
            ]
          }
        ]
      }

      const bootstrapJson = JSON.stringify({ formation, related }).replace(/</g, '\\u003c')
      const bodyHtml = renderFormationBodyHtml(formation, related)
      const fullHtml = injectFormationHead(template, {
        title: `${title} - ${formation.etab_nom || 'Zelia'}`,
        description: description || `Découvre ${title} sur Zelia.`,
        canonicalUrl,
        type: 'article',
        image: formation.image,
        imageAlt: formation.etab_nom || title,
        schema
      }).replace(
        '<div id="root"></div>',
        () => `<div id="root">${bodyHtml}</div><script type="application/json" id="zelia-formation-data">${bootstrapJson}</script>`
      )

      return sendHtml(res, 200, fullHtml, 'public, max-age=300, stale-while-revalidate=3600')
    } catch (error) {
      console.error('Formation SSR error:', error)
      res.set('Retry-After', '60')
      return sendHtml(res, 503, '<!doctype html><html lang="fr"><head><meta charset="UTF-8" /><title>Service temporairement indisponible - Zelia</title></head><body><p>Service temporairement indisponible.</p></body></html>', 'no-store')
    }
  })

  return router
}
