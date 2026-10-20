export function recommendedFormations(value) {
  let parsed = value
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed) } catch { return [] }
  }

  const candidates = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.candidates) ? parsed.candidates : []
  return candidates.filter((candidate) => candidate?.type === 'formation')
}

export function selectedFormations(value) {
  return recommendedFormations(value).filter((candidate) => candidate.requestMoreInformation === true)
}

export function isPartnerFormation(candidate) {
  return candidate?.sourceTable === 'ecoles_partenaires' || candidate?.partner === true || String(candidate?.id || '').startsWith('partner-')
}

export function formationHref(formation) {
  const links = [formation?.detail?.link,formation?.raw?.fiche,formation?.fiche,formation?.raw?.link,formation?.link,formation?.raw?.etab_url,formation?.etab_url]
  for (const value of links) {
    if (typeof value !== 'string') continue
    const href = value.trim().replace(/^www\./i,'https://www.')
    if (!/^https?:\/\//i.test(href)) continue
    try {
      const url = new URL(href)
      if (['http:','https:'].includes(url.protocol) && url.hostname) return url.href
    } catch { continue }
  }
  return ''
}