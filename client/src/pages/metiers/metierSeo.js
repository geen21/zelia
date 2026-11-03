import { METIER_ORIGIN, metierPath, directoryPath, validateMetierSnapshot, metierWordCount } from '../../lib/metierContent.js'

export const DIRECTORY_SIZE = 36

export function metierDocumentSeo(doc) {
  const url = `${METIER_ORIGIN}${doc.path}`
  const title = doc.kind === 'detail' ? `${doc.page.title} : un métier d'avenir ? | Zélia` :
    `Métiers d'avenir : trouve ta voie${doc.number > 1 ? ` - Page ${doc.number}` : ''} | Zélia`
  const fullDescription = doc.kind === 'detail' ?
    `${doc.page.title} : ${doc.page.content.verdict === 'OUI' ? 'oui' : 'non'}. ${doc.page.content.explanation}` :
    'Explore les métiers, découvre comment l’intelligence artificielle les transforme et trouve une orientation qui te ressemble avec Zélia.'
  const description = fullDescription.length > 160 ? `${fullDescription.slice(0, 157).trim()}…` : fullDescription
  const breadcrumbs = [
    { '@type': 'ListItem', position: 1, name: 'Accueil', item: METIER_ORIGIN },
    { '@type': 'ListItem', position: 2, name: 'Métiers', item: `${METIER_ORIGIN}/metiers/` }
  ]
  if (doc.kind === 'detail') breadcrumbs.push({ '@type': 'ListItem', position: 3, name: doc.page.title, item: url })
  else if (doc.number > 1) breadcrumbs.push({ '@type': 'ListItem', position: 3, name: `Page ${doc.number}`, item: url })
  const mainEntity = doc.kind === 'detail' ? {
    '@type': 'Occupation', name: doc.page.title, description: doc.page.content.summary,
    skills: doc.page.content.skills.join(', '), responsibilities: doc.page.content.missions.join('; '),
    occupationLocation: { '@type': 'Country', name: 'France' }
  } : {
    '@type': 'ItemList', itemListElement: doc.entries.map((entry, index) => ({
      '@type': 'ListItem', position: (doc.number - 1) * DIRECTORY_SIZE + index + 1,
      name: entry.title, url: `${METIER_ORIGIN}${metierPath(entry)}`
    }))
  }
  return {
    title, description, url, type: 'website', noindex: doc.preview,
    modifiedTime: doc.updatedAt,
    schema: { '@context': 'https://schema.org', '@graph': [
      { '@type': 'WebPage', '@id': url, url, name: title, description, inLanguage: 'fr-FR', dateModified: doc.updatedAt, mainEntity,
        ...(doc.kind === 'detail' && doc.page.content.version === 2 ? {
          wordCount: metierWordCount(doc.page.content),
          citation: doc.page.content.sources.map((source) => ({ '@type': 'CreativeWork', name: source.name, url: source.url })),
          hasPart: doc.page.content.sections.map((section) => ({ '@type': 'WebPageElement', name: section.heading, url: `${url}#${section.id}` }))
        } : {}) },
      { '@type': 'BreadcrumbList', itemListElement: breadcrumbs }
    ] }
  }
}

export function* buildMetierDocuments(snapshot) {
  validateMetierSnapshot(snapshot)
  const pages = [...snapshot.pages].sort((a, b) => a.title.localeCompare(b.title, 'fr') || a.id.localeCompare(b.id))
  const summary = (page) => ({ title: page.title, slug: page.slug, verdict: page.content.verdict })
  const updatedAt = pages.reduce((latest, page) => page.updatedAt > latest ? page.updatedAt : latest, pages[0].updatedAt)
  const families = new Map()
  for (const page of pages) {
    for (const code of page.romeCodes) {
      const family = code.slice(0, 3)
      if (!families.has(family)) families.set(family, [])
      families.get(family).push(page)
    }
  }
  const totalPages = Math.ceil(pages.length / DIRECTORY_SIZE)
  for (let number = 1; number <= totalPages; number++) {
    yield { path: directoryPath(number), kind: 'directory', preview: snapshot.preview, number, totalPages,
      total: pages.length, updatedAt, entries: pages.slice((number - 1) * DIRECTORY_SIZE, number * DIRECTORY_SIZE).map(summary) }
  }
  for (const page of pages) {
    const candidates = page.romeCodes.flatMap((code) => (families.get(code.slice(0, 3)) || []).slice(0, 7))
    const related = [...new Map([...candidates, ...pages.slice(0, 7)].map((candidate) => [candidate.id, candidate])).values()]
      .filter((candidate) => candidate.id !== page.id).slice(0, 4).map(summary)
    yield { path: metierPath(page), kind: 'detail', preview: snapshot.preview, updatedAt: page.updatedAt, page, related }
  }
}

export function metierDataPath(path) {
  if (!/^\/metiers\/(?:page\/[1-9]\d*\/|[a-z0-9-]+-metier-avenir\/)?$/.test(path)) {
    throw new Error('URL métier invalide')
  }
  return `/metiers-data/${path.slice('/metiers/'.length)}index.json`
}
