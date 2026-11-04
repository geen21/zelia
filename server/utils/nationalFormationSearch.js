import { NATIONAL_CODE_SUBJECTS, NATIONAL_FORMAT_PATTERNS, getNationalStudyLevels, nationalFormationMatches, nationalMasterPathwayMatches, resolveNationalDepartment } from '../../client/src/lib/nationalFormationMatching.js'
import { normalizeRelevanceText } from '../../client/src/lib/formationRelevance.js'
import { canonicalFormationColumns, requireFormationCanonicals } from './formationCanonical.js'

const COLUMNS = 'id,nmc,nm,fl,tf,app,int,aut,etab_nom,etab_uai,region,departement,commune,fiche,etab_url,annee,image,email,code_formation'
const LEVEL_PATTERNS = {
  1: ['CAP*', '*Bac*pro*'],
  2: ['BTS*', 'DUT*', 'DEUST*', 'BPJEPS*'],
  3: ['L1-*', 'L2-*', 'L3-*', 'Licence*', 'Bachelor*', 'BUT*', 'DNM-*', 'DN*MADE*', 'DCG*', '*BAC3*'],
  5: ['M1-*', 'M2-*', 'Master*', 'Mastère*', 'MBA*', 'MSC*', '*BAC5*', '*ingénieur*', 'DSCG*', 'ScPo*'],
  8: ['*doctorat*', '*PhD*', '*thèse*']
}
const SUBJECT_ALIASES = {
  informatique: ['SIO', 'CIEL', 'GEII', 'MMI', 'STID'], informatiques: ['SIO', 'CIEL'],
  numerique: ['informatique', 'SIO', 'CIEL', 'MMI'], biologie: ['SVT'],
  construction: ['GC', 'GCCD', 'Bâtiment'], batiment: ['GC', 'GCCD'],
  commerce: ['TC', 'MCO', 'NDRC'], commercial: ['TC', 'MCO', 'NDRC'],
  sport: ['STAPS'], gestion: ['GEA', 'GPME'],
  donnees: ['données', 'STID', 'SD'], cybersecurite: ['cybersécurité', 'SIO', 'CIEL'],
  sante: ['santé', 'IFSI', 'PASS', 'LAS'], medecine: ['médecine', 'PASS', 'LAS'],
  infirmier: ['IFSI'], electricite: ['électricité', 'GEII', 'Electrotechnique'],
  electronique: ['électronique', 'CIEL', 'GEII'], economie: ['économie', 'GEA'],
  mathematiques: ['mathématiques'], environnement: ['écologie', 'environnement'],
  mecanique: ['mécanique', 'GMP']
}
const GENERIC = new Set(['bts', 'but', 'dut', 'bac', 'licence', 'master', 'bachelor', 'doctorat', 'formation', 'formations', 'sciences', 'services', 'organisations', 'ingenieur', 'ecole', 'parcours', 'alternance'])
const quote = (value) => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
const literal = (value) => String(value).replace(/[\\%_*]/g, '\\$&')

function applyConstraints(query, profile, department) {
  if (department) {
    const variants = [...new Set([department, department.replace(/[’‘]/g, "'")])]
    query = query.or(variants.map((name) => `departement.ilike.${quote(name)}`).join(','))
  }
  const levels = getNationalStudyLevels(profile)
  if (levels.length) {
    query = query.or(levels.flatMap((level) => LEVEL_PATTERNS[level] || []).map((pattern) => `nmc.ilike.${quote(pattern)}`).join(','))
  }
  const formats = profile.formation_preferences.filter((format) => Object.hasOwn(NATIONAL_FORMAT_PATTERNS, format))
  if (formats.length && !profile.formation_preferences.includes('ecole_specialisee')) {
    query = query.or(formats.flatMap((format) => NATIONAL_FORMAT_PATTERNS[format]).map((pattern) => `nmc.ilike.${quote(pattern)}`).join(','))
  }
  if (profile.formation_preferences.length === 1 && profile.formation_preferences[0] === 'alternance') {
    query = query.or('app.ilike.*apprentissage*,nmc.ilike.*-App*,nmc.ilike.*/App*')
  }
  if (profile.formation_preferences.length === 1 && profile.formation_preferences[0] === 'prepa') {
    query = query.or('nmc.ilike.CPGE*,nmc.ilike.*prépa*')
  }
  return query
}

export function parseNationalSearch(query) {
  const levels = String(query.study_levels || '').split(',').filter(Boolean).map(Number)
  if (levels.some((level) => !Object.hasOwn(LEVEL_PATTERNS, level))) throw new Error('Niveau de formation invalide.')
  const formats = String(query.formation_formats || '').split(',').filter(Boolean).slice(0, 3)
  const department = query.departement ? resolveNationalDepartment(query.departement) : ''
  if (query.departement && !department) throw new Error('Département inconnu : précise un département français valide.')
  return {
    department,
    profile: {
      formation_preferences: formats,
      study_levels: levels
    }
  }
}

export async function searchNationalFormations(db, { q = '', department, profile, pageSize = 24, from = 0 }) {
  const signal = AbortSignal.timeout(2500)
  const words = [...new Set((String(q).match(/[\p{L}\p{N}]+/gu) || [])
    .filter((word) => word.length >= 3 && !GENERIC.has(normalizeRelevanceText(word))))].slice(0, 5)
  const terms = [...new Set(words.flatMap((word) => {
    const normalized = normalizeRelevanceText(word)
    const prefix = normalized.length > 6 ? normalized.slice(0, 6) : normalized.replace(/s$/, '')
    const codes = Object.entries(NATIONAL_CODE_SUBJECTS)
      .filter(([, label]) => normalizeRelevanceText(label).split(' ').some((part) => part.startsWith(prefix)))
      .map(([code]) => code)
    return [word, ...(SUBJECT_ALIASES[normalized] || []), ...codes]
  }))]
  let direct = applyConstraints(db.from('formation_france').select(canonicalFormationColumns(COLUMNS)), profile, department)
  if (terms.length) {
    direct = direct.or(terms.map((term) => `nmc.ilike.${quote(`*${literal(term)}*`)}`).join(','))
  }
  direct = direct.order('annee', { ascending: false, nullsFirst: false }).order('id').range(from, from + pageSize)

  // The direct query applies level/location BEFORE limiting. The existing title RPC
  // complements sparse nmc codes with matches in nm; never trust its substring geography.
  const levels = getNationalStudyLevels(profile)
  const doctorateOnly = levels.length === 1 && levels[0] === 8
  const discover = from === 0 && (words.length || doctorateOnly)
  const discoverMaster = from === 0 && levels.includes(5)
  const [directResult, titleResult, masterResult] = await Promise.all([
    direct.abortSignal(signal),
    discover
      ? db.rpc('search_formations_simple', {
        p_keyword: doctorateOnly ? 'doctorat' : words[0], p_department: department || null, p_limit: 50
      }).abortSignal(signal)
      : Promise.resolve({ data: [], error: null }),
    discoverMaster
      ? db.rpc('search_formations_simple', {
        p_keyword: 'master', p_department: department || null, p_limit: 50
      }).abortSignal(signal)
      : Promise.resolve({ data: [], error: null })
  ])
  if (directResult.error) throw new Error(directResult.error.message, { cause: directResult.error })
  if (titleResult.error) throw new Error(titleResult.error.message, { cause: titleResult.error })
  if (masterResult.error) throw new Error(masterResult.error.message, { cause: masterResult.error })
  const rows = new Map((directResult.data || []).map((row) => [String(row.id), row]))
  const missing = [...new Set([...(titleResult.data || []), ...(masterResult.data || [])]
    .filter((row) => !rows.has(String(row.id))).map((row) => row.id))]
  if (missing.length) {
    const extra = await applyConstraints(db.from('formation_france').select(canonicalFormationColumns(COLUMNS)).in('id', missing), {
      formation_preferences: [], study_levels: []
    }, department)
      .abortSignal(signal)
    if (extra.error) throw new Error(extra.error.message, { cause: extra.error })
    for (const row of extra.data || []) rows.set(String(row.id), row)
  }
  const unique = new Set()
  requireFormationCanonicals([...rows.values()])
  const newestYear = new Map()
  const candidates = [...rows.values()]
    .sort((a, b) => String(b.annee || '').localeCompare(String(a.annee || '')) || Number(a.id) - Number(b.id))
    .filter((row) => {
      const programme = [row.etab_uai || row.etab_nom, row.commune, row.nmc || row.nm?.[0]].join('|')
      const year = String(row.annee || '')
      if (newestYear.has(programme) && newestYear.get(programme) !== year) return false
      newestYear.set(programme, year)
      const key = `${programme}|${row.nm?.[0] || ''}`
      if (unique.has(key)) return false
      unique.add(key)
      return true
    })
  const items = candidates.filter((row) => nationalFormationMatches(row, profile, department))
  const pathways = candidates.filter((row) => nationalMasterPathwayMatches(row, profile, department)
    && !nationalFormationMatches(row, profile, department))
  return { items: items.slice(0, pageSize), pathways: pathways.slice(0, pageSize), total: null, has_more: (directResult.data || []).length > pageSize, page_size: pageSize }
}
