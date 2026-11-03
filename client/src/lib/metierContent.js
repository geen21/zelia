export const METIER_SCHEMA_VERSION = 1
export const METIER_ORIGIN = 'https://zelia.io'
export const METIER_SECTION_IDS = ['quotidien', 'intelligence-artificielle', 'competences', 'formation', 'perspectives']

export function metierWordCount(content) {
  return [content.summary, content.explanation, ...content.missions, ...content.skills, ...content.access,
    ...(content.sections || []).flatMap((section) => section.paragraphs),
    ...(content.faq || []).map((item) => item.answer)]
    .join(' ').trim().split(/\s+/u).length
}

function plainText(value, max, field) {
  if (typeof value !== 'string' || !value.trim() || value.length > max ||
      /[<>]|https?:\/\/|[\w.+-]+@[\w.-]+|\d+\s*[%€]/u.test(value)) {
    throw new Error(`Contenu métier invalide : ${field}`)
  }
  return value.trim()
}

export function validateMetierContent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Fiche métier invalide')
  if (!['OUI', 'NON'].includes(value.verdict)) throw new Error('Verdict métier invalide')
  const result = {
    summary: plainText(value.summary, 240, 'présentation'),
    verdict: value.verdict,
    explanation: plainText(value.explanation, 400, 'explication')
  }
  const sentences = [...new Intl.Segmenter('fr', { granularity: 'sentence' }).segment(result.explanation)]
    .filter(({ segment }) => segment.trim())
  if (sentences.length < 1 || sentences.length > 2) throw new Error('L’explication doit contenir une à deux phrases')
  if (/\bjamais\b|sans (?:aucun )?risque|irremplaçable/iu.test(result.explanation)) {
    throw new Error('Le verdict ne doit pas présenter une perspective comme une certitude')
  }
  for (const field of ['missions', 'skills', 'access']) {
    if (!Array.isArray(value[field]) || value[field].length < 1 || value[field].length > 3) {
      throw new Error(`Liste métier invalide : ${field}`)
    }
    result[field] = value[field].map((item) => plainText(item, 140, field))
  }
  if (value.version !== undefined && value.version !== 2) throw new Error('Version de contenu métier inconnue')
  if (value.version === 2) {
    if (!Array.isArray(value.sources) || value.sources.length < 2 || value.sources.length > 6) throw new Error('Sources métier manquantes')
    const sourceIds = new Set()
    result.sources = value.sources.map((source) => {
      const id = plainText(source.id, 80, 'identifiant de source')
      if (!/^[a-z0-9-]+$/.test(id) || sourceIds.has(id)) throw new Error('Source métier dupliquée ou invalide')
      sourceIds.add(id)
      const url = new URL(source.url)
      if (url.protocol !== 'https:' || !['www.francecompetences.fr', 'www.afpa.fr', 'www.ilo.org', 'choisirleservicepublic.gouv.fr'].includes(url.hostname) ||
          /[<>\s]/.test(source.url) || url.username || url.password || !/^\d{4}-\d{2}-\d{2}$/.test(source.checkedAt) ||
          !Number.isFinite(Date.parse(source.checkedAt))) throw new Error('Référence documentaire non vérifiée')
      return { id, name: plainText(source.name, 180, 'source'), url: url.href, checkedAt: source.checkedAt }
    })
    const citations = (ids) => {
      if (!Array.isArray(ids) || !ids.length || ids.length > 3 || new Set(ids).size !== ids.length || ids.some((id) => !sourceIds.has(id))) {
        throw new Error('Citation documentaire absente ou inconnue')
      }
      return [...ids]
    }
    if (!Array.isArray(value.sections) || value.sections.length !== METIER_SECTION_IDS.length) throw new Error('Sections métier incomplètes')
    result.sections = value.sections.map((section, index) => {
      if (section.id !== METIER_SECTION_IDS[index] || !Array.isArray(section.paragraphs) || section.paragraphs.length < 2 || section.paragraphs.length > 3) {
        throw new Error('Structure éditoriale métier invalide')
      }
      return { id: section.id, heading: plainText(section.heading, 180, 'titre de section'),
        paragraphs: section.paragraphs.map((text) => plainText(text, 2200, 'paragraphe')), sourceIds: citations(section.sourceIds) }
    })
    if (!Array.isArray(value.faq) || value.faq.length < 3 || value.faq.length > 4) throw new Error('FAQ métier incomplète')
    result.faq = value.faq.map((item) => ({ question: plainText(item.question, 180, 'question FAQ'),
      answer: plainText(item.answer, 900, 'réponse FAQ'), sourceIds: citations(item.sourceIds) }))
    if (new Set(result.faq.map((item) => item.question.toLowerCase())).size !== result.faq.length) throw new Error('Questions FAQ dupliquées')
    result.version = 2
    const words = metierWordCount(result)
    if (words < 600 || words > 900) throw new Error(`Fiche détaillée : ${words} mots utiles, attendu 600–900`)
  }
  return result
}

export function metierPath(page) {
  return `/metiers/${page.slug}-metier-avenir/`
}

export function directoryPath(number = 1) {
  return number === 1 ? '/metiers/' : `/metiers/page/${number}/`
}

export function validateMetierSnapshot(snapshot) {
  if (snapshot?.schemaVersion !== METIER_SCHEMA_VERSION || typeof snapshot.preview !== 'boolean' ||
      !Array.isArray(snapshot.pages) || !snapshot.pages.length ||
      !Number.isSafeInteger(snapshot.totalCatalog) || snapshot.totalCatalog < snapshot.pages.length) {
    throw new Error('Instantané métiers absent, vide ou invalide')
  }
  if (!snapshot.preview && snapshot.totalCatalog !== snapshot.pages.length) {
    throw new Error('Publication refusée : catalogue métiers incomplet')
  }
  const slugs = new Set()
  const ids = new Set()
  for (const page of snapshot.pages) {
    if (!/^[a-f0-9]{64}$/.test(page.id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug) ||
        page.slug.length > 110 || ids.has(page.id) || slugs.has(page.slug)) {
      throw new Error('Identité métier invalide ou dupliquée')
    }
    plainText(page.title, 180, 'intitulé')
    if (!Number.isFinite(Date.parse(page.updatedAt))) throw new Error('Date métier invalide')
    if (!Array.isArray(page.romeCodes) || page.romeCodes.some((code) => !/^[A-Z]\d{4}$/.test(code))) {
      throw new Error('Classification métier invalide')
    }
    validateMetierContent(page.content)
    if (!snapshot.preview && page.content.version !== 2) throw new Error('Publication refusée : fiche détaillée sourcée requise')
    ids.add(page.id)
    slugs.add(page.slug)
  }
  return snapshot
}
