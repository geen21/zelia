import { createHash } from 'node:crypto'
import { unzipSync } from 'fflate'
import { canonicalMetier } from './metierPages.js'
import { metierPilotRomeCode } from './metierEditorialSources.js'
import { isDeepStrictEqual } from 'node:util'
import { validateMetierContent, hasMalformedMetierWord } from '../../client/src/lib/metierContent.js'

export const ROME_DATASET_URL = 'https://www.data.gouv.fr/datasets/repertoire-operationnel-des-metiers-et-des-emplois-rome'
export const ROME_DOWNLOAD_URL = 'https://api.francetravail.fr/api-nomenclatureemploi/v1/open-data/json'

function decode(bytes, legacyWindows1252 = false) {
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' } } catch (error) {
    if (error.code !== 'ERR_ENCODING_INVALID_ENCODED_DATA') throw error
    const encoding = legacyWindows1252 ? 'windows-1252' : 'iso-8859-15'
    return { text: new TextDecoder(encoding).decode(bytes), encoding }
  }
}

function repairLegacyContext(value) {
  const chars = { '¤': '€', '¦': 'Š', '¨': 'š', '´': 'Ž', '¸': 'ž', '¼': 'Œ', '½': 'œ', '¾': 'Ÿ' }
  if (typeof value === 'string') return value.replace(/[¤¦¨´¸¼½¾]/g, (char) => chars[char])
  if (Array.isArray(value)) return value.map(repairLegacyContext)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, repairLegacyContext(item)]))
  return value
}

function withoutCheckDates(context) {
  return { ...context, sources: context.sources.map(({ checkedAt, ...source }) => source) }
}

function text(value, max = 6000) {
  if (typeof value !== 'string') return ''
  if (/\uFFFD|<(?:script|iframe|style)\b/iu.test(value)) throw new Error('Texte officiel ROME mal encodé ou non textuel')
  const clean = value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim()
  if (clean.length > max) throw new Error(`Texte ROME trop long (${clean.length} caractères)`)
  return clean
}

function leaves(value) {
  if (Array.isArray(value)) return value.flatMap(leaves)
  if (!value || typeof value !== 'object') return []
  if (typeof value.libelle === 'string' && !value.items) return [{ label: text(value.libelle, 700), primary: value.coeur_metier === 'Principale' }]
  return Object.values(value).flatMap(leaves)
}

function labels(value, limit) {
  const items = leaves(value).sort((a, b) => Number(b.primary) - Number(a.primary))
  return [...new Set(items.map((item) => item.label).filter(Boolean))].slice(0, limit)
}

export function readRomeArchive(buffer, { legacyWindows1252 = false } = {}) {
  if (buffer.byteLength > 128 * 1024 * 1024) throw new Error('Archive ROME trop volumineuse')
  let total = 0
  const files = unzipSync(buffer, { filter(file) {
    if (file.name !== 'version.txt' && !/^unix_(?:fiche_emploi_metier|referentiel_code_rome)_v4\d+\.json$/.test(file.name)) return false
    total += file.originalSize
    if (file.originalSize > 32 * 1024 * 1024 || total > 64 * 1024 * 1024) throw new Error('Contenu décompressé ROME trop volumineux')
    return true
  } })
  const load = (prefix) => {
    const matches = Object.entries(files).filter(([name]) => name.startsWith(prefix))
    if (matches.length !== 1) throw new Error(`Fichier officiel ROME manquant ou ambigu : ${prefix}`)
    return decode(matches[0][1], legacyWindows1252)
  }
  if (!files['version.txt']) throw new Error('Version du référentiel ROME absente')
  const metadata = decode(files['version.txt']).text
  const versionNumber = /Numero de version\s*:\s*(\d+)/i.exec(metadata)?.[1]
  const date = /Date de publication\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(metadata)
  if (!versionNumber || !date) throw new Error('Métadonnées de version ROME invalides')
  const publishedAt = `${date[3]}-${date[2]}-${date[1]}`
  if (!Number.isFinite(Date.parse(publishedAt))) throw new Error('Date de publication ROME invalide')
  const body = load('unix_fiche_emploi_metier_')
  const codesBody = load('unix_referentiel_code_rome_')
  const fiches = JSON.parse(body.text)
  const codes = JSON.parse(codesBody.text)
  if (!Array.isArray(fiches) || !fiches.length || !Array.isArray(codes)) throw new Error('Structure du référentiel ROME invalide')
  const byCode = new Map()
  for (const fiche of fiches) {
    const code = fiche.rome?.code_rome
    if (!/^[A-Z]\d{4}$/.test(code || '') || byCode.has(code)) throw new Error('Code ROME officiel invalide ou dupliqué')
    const title = text(fiche.rome.intitule, 180)
    if (!title) throw new Error(`Intitulé officiel manquant : ${code}`)
    byCode.set(code, { ...fiche, rome: { ...fiche.rome, intitule: title } })
  }
  const sha256 = createHash('sha256').update(JSON.stringify({ fiches, codes })).digest('hex')
  return {
    version: `ROME4-v${versionNumber}-${sha256.slice(0, 12)}`, publishedAt, byCode,
    encodings: { fiches: body.encoding, codes: codesBody.encoding },
    sha256
  }
}

export function romeEditorialContext(reference, fiche, checkedAt) {
  const code = fiche.rome.code_rome
  const definition = text(fiche.definition)
  const access = text(fiche.acces_metier)
  const skills = labels(fiche.competences?.savoir_faire, 10)
  const personal = labels(fiche.competences?.savoir_etre_professionnel, 4)
  const contexts = labels(fiche.contextes_travail, 8)
  const names = [...new Set((fiche.appellations || []).map((item) => text(item.libelle, 180)).filter(Boolean))].slice(0, 12)
  if (!definition && !skills.length) throw new Error(`Fiche ROME insuffisamment documentée : ${code}`)
  const facts = [
    `Définition officielle du métier : ${definition || 'Non précisée ; se limiter aux compétences documentées.'}`,
    access ? `Accès au métier selon le ROME : ${access}` : 'Le ROME ne précise pas ici de parcours d’accès : ne pas inventer de diplôme ou de durée.',
    skills.length ? `Compétences et activités documentées : ${skills.join(' ; ')}.` : null,
    personal.length ? `Savoir-être documentés : ${personal.join(' ; ')}.` : null,
    contexts.length ? `Contextes de travail recensés, selon les postes : ${contexts.join(' ; ')}.` : null,
    names.length ? `Exemples d’appellations rattachées à cette fiche : ${names.slice(0, 6).join(' ; ')}.` : null,
    'Ces informations décrivent un métier, pas des offres en cours. Les certifications, autorisations et conditions précises doivent être vérifiées auprès des organismes compétents.',
    'Ne pas déduire une exclusivité de diplôme, une équivalence automatique ou un parcours réglementaire complet de ce résumé du ROME.'
  ].filter(Boolean)
  return {
    scope: `Une fiche métier officielle ROME (${code}) regroupant ses appellations. Décrire ce métier et ses variantes sans confondre d’autres professions. Ne donner aucun protocole médical ou instruction technique dangereuse.`,
    officialNames: names,
    sources: [{
      id: 'france-travail-rome', name: `France Travail — fiche ROME ${code}, publication du ${reference.publishedAt}`,
      url: ROME_DATASET_URL, checkedAt, facts
    }]
  }
}

export function buildRomeCatalog(reference, inventory, existing, checkedAt, { repairFromVersion } = {}) {
  if (!Array.isArray(inventory) || !inventory.length) throw new Error('Inventaire des codes ROME vide')
  const seen = new Set()
  const missing = inventory.filter((row) => !reference.byCode.has(row.rome_code)).map((row) => row.rome_code)
  if (missing.length) throw new Error(`Codes absents du référentiel officiel : ${missing.join(', ')}`)
  const canonical = new Map(existing.filter((page) => page.catalog_kind === 'canonical').map((page) => [page.rome_code, page]))
  const pilots = new Map()
  for (const page of existing.filter((page) => page.content?.version === 2)) {
    const code = metierPilotRomeCode(page)
    if (code && !pilots.has(code)) pilots.set(code, page)
  }
  return inventory.map((row) => {
    const code = row.rome_code
    if (seen.has(code) || !/^[A-Z]\d{4}$/.test(code) || !Number.isSafeInteger(Number(row.source_count)) || Number(row.source_count) <= 0 ||
        !Array.isArray(row.aliases) || !row.aliases.length) throw new Error('Inventaire ROME invalide ou dupliqué')
    seen.add(code)
    const fiche = reference.byCode.get(code)
    const previous = canonical.get(code) || pilots.get(code)
    const title = fiche.rome.intitule
    const base = canonicalMetier(title).normalized_title.replace(/[^a-z0-9]+/g, '-').slice(0, 82).replace(/^-+|-+$/g, '')
    const context = romeEditorialContext(reference, fiche, checkedAt)
    const encodingRepair = repairFromVersion && repairFromVersion !== reference.version &&
      previous?.reference_version === repairFromVersion
    const unchangedFacts = encodingRepair && previous.title === title && previous.editorial_context &&
      isDeepStrictEqual(withoutCheckDates(repairLegacyContext(previous.editorial_context)), withoutCheckDates(context))
    const reuseContent = unchangedFacts && previous.content?.version === 2 &&
      previous.content_reference_version === previous.reference_version &&
      !hasMalformedMetierWord(JSON.stringify(previous.content))
    if (reuseContent) validateMetierContent(previous.content)
    const repairSlug = encodingRepair && previous.normalized_title?.startsWith('rome:')
    return {
      id: previous?.id || createHash('sha256').update(`rome:${code}`).digest('hex'),
      normalized_title: previous?.normalized_title || `rome:${code}`,
      title, slug: previous?.slug && !repairSlug ? previous.slug : `${base}-${code.toLowerCase()}`,
      aliases: row.aliases, rome_codes: [code], source_count: Number(row.source_count), review_reason: null,
      catalog_kind: 'canonical', rome_code: code, reference_version: reference.version,
      editorial_context: context,
      content_reference_version: reuseContent ? reference.version : previous?.content_reference_version || null
    }
  })
}
