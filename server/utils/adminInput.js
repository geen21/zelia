export function invalid(message) {
  return Object.assign(new Error(message), { status: 400 })
}

export function identifier(value, uuid = false) {
  const text = String(value || '')
  const pattern = uuid ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i : /^[1-9][0-9]{0,18}$/
  if (!pattern.test(text)) throw invalid('Identifiant invalide.')
  return text
}

export function pagination(query = {}) {
  const limit = Number(query.limit ?? 50)
  const offset = Number(query.offset ?? 0)
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) {
    throw invalid('Pagination invalide.')
  }
  return { limit, offset }
}

export function searchText(value) {
  const text = String(value || '').trim()
  if (text.length > 150) throw invalid('Recherche trop longue.')
  return text.replace(/[\\%,()"_]/g, ' ')
}

export function validatePatch(body, allowed, required = []) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Formulaire invalide.')
  const patch = {}
  for (const [key, value] of Object.entries(body)) {
    if (key === 'reason') continue
    if (!allowed.includes(key)) throw invalid(`Champ non modifiable : ${key}`)
    if (['is_active', 'is_published', 'show_in_results', 'highlight_in_results'].includes(key)) {
      if (typeof value !== 'boolean') throw invalid('Statut invalide.')
      patch[key] = value
    } else if (key === 'results_priority') {
      if (!Number.isInteger(value) || value < 0 || value > 100) throw invalid('Priorite invalide (0 a 100).')
      patch[key] = value
    } else if (key === 'age') {
      if (value !== null && (!Number.isInteger(value) || value < 3 || value > 120)) throw invalid('Age invalide.')
      patch[key] = value
    } else if (key === 'company_id') {
      patch[key] = identifier(value)
    } else {
      if (typeof value !== 'string') throw invalid(`Valeur invalide : ${key}`)
      const text = value.trim()
      if (text.length > (key === 'description' ? 10000 : 500)) throw invalid(`Valeur trop longue : ${key}`)
      if (['title','formation_name','school_name','name','city'].includes(key) && !text) throw invalid(`Champ requis : ${key}`)
      if (['email','contact_email'].includes(key) && text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw invalid('Email invalide.')
      if (['link','image_url'].includes(key) && text) {
        let url
        try { url = new URL(text) } catch { throw invalid('Lien invalide.') }
        if (!['https:', 'http:'].includes(url.protocol)) throw invalid('Le lien doit utiliser HTTPS ou HTTP.')
      }
      patch[key] = text
    }
  }
  for (const key of required) if (!patch[key]) throw invalid(`Champ requis : ${key}`)
  if (!Object.keys(patch).length) throw invalid('Aucune modification.')
  return patch
}

export function mutationReason(body, required = false) {
  const reason = String(body?.reason || '').trim()
  if (reason.length > 1000 || (required && !reason)) throw invalid('Un motif de 1 a 1000 caracteres est requis.')
  return reason
}