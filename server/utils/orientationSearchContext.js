const FORMAT_LABELS = {
  bts: 'BTS', but: 'BUT', licence: 'Licence', bachelor: 'Bachelor', master: 'Master',
  doctorat: 'Doctorat', ecole_specialisee: 'École spécialisée', alternance: 'Alternance',
  prepa: 'Prépa', voie_pro: 'CAP ou bac pro'
}
const SUBJECT_LABELS = { maths: 'Maths', francais: 'Français', anglais: 'Anglais', sciences: 'Sciences', eco: 'Éco', arts: 'Arts', numerique: 'Numérique' }
const LOCATION_LABELS = { near_home: 'Près de chez moi', move_city: 'Changer de ville', both: 'Les deux' }
const DOMAIN_LABELS = {
  sante_soin: 'Soigner et aider', construction_technique: 'Construire et réparer',
  creation_communication: 'Créer et communiquer', service_public: 'Protéger et accompagner',
  terrain_sport: 'Bouger et être dehors', science_numerique: 'Comprendre et innover',
  hotellerie_restauration: 'Cuisiner et accueillir', commerce_entrepreneuriat: 'Vendre et entreprendre'
}

function text(value, limit = 100) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/\s+/g, ' ').trim().slice(0, limit)
    : ''
}

function list(value, limit, labels = {}) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => text(labels[item] || item, 80)).filter(Boolean))].slice(0, limit)
    : []
}

function savedList(value, questionId) {
  if (!value) return []
  let parsed
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    throw new Error(`Préférence enregistrée invalide : ${questionId}`, { cause: error })
  }
  if (!Array.isArray(parsed)) throw new Error(`Liste de préférences attendue : ${questionId}`)
  return parsed
}

export function buildOrientationSearchContext(orientationProfile = {}, saved = []) {
  const latest = [...saved].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))
    || Number(b.id || 0) - Number(a.id || 0))
  const pick = (id) => latest.find((entry) => entry.question_id === id)?.answer_text || ''
  const raw = orientationProfile.searchProfile && typeof orientationProfile.searchProfile === 'object'
    && !Array.isArray(orientationProfile.searchProfile) ? orientationProfile.searchProfile : {}
  const scalar = (name, id, limit = 40) => text(raw[name] ?? pick(id), limit)
  const savedOrClientList = (name, id, limit, labels) => list(
    Object.hasOwn(raw, name) ? raw[name] : savedList(pick(id), id), limit, labels
  )
  const searchProfile = {
    gradeConfidence: scalar('gradeConfidence', 'orientation_grade_confidence'),
    schoolLevel: scalar('schoolLevel', 'orientation_school_level'),
    targetLevel: scalar('targetLevel', 'orientation_target_level'),
    studyLocation: scalar('studyLocation', 'orientation_study_location'),
    department: scalar('department', 'orientation_department'),
    departmentName: scalar('departmentName', 'orientation_department_name', 80),
    strongSubjects: savedOrClientList('strongSubjects', 'orientation_strong_subjects', 7, SUBJECT_LABELS),
    formationPreferences: savedOrClientList('formationPreferences', 'orientation_formation_preferences', 3, FORMAT_LABELS),
    careerDomains: savedOrClientList('careerDomains', 'orientation_career_domains', 3, DOMAIN_LABELS)
  }
  return {
    searchProfile,
    formationPreference: text(orientationProfile.formationPreference, 160) || searchProfile.formationPreferences.join(', '),
    careerDomains: text(orientationProfile.careerDomains, 160) || searchProfile.careerDomains.join(', '),
    locationLabel: LOCATION_LABELS[searchProfile.studyLocation] || searchProfile.studyLocation
  }
}

export const FORMATION_RECOMMENDATION_GUIDELINES = `Les préférences explicites de diplôme et de mobilité ne doivent pas disparaître pour remplir la liste.
Respecte les familles demandées, pas seulement leur niveau : un BUT n'est pas une licence. Pour le choix Master, inclue les diplômes nationaux de master et les autres diplômes dont le grade master est établi, en conservant leur intitulé exact.
Les Cursus Master en Ingénierie (CMI) suivent les mêmes règles que les autres formations et restent sous leur intitulé exact, avec leurs conditions d'accès.
Un mastère, MBA ou titre RNCP de niveau 7 ne confère pas automatiquement un master ; un DU/DIU n'est pas un doctorat/PhD.
DN MADE est un diplôme bac+3, et non un master. Le PASS ou une CPGE sont des étapes d'accès, pas le diplôme final en médecine ou un diplôme d'ingénieur.
Si le diplôme visé est une étape lointaine, nomme d'abord ce diplôme avec son domaine puis explique séparément le parcours d'accès. Ne rebaptise pas une étape préparatoire en diplôme demandé.
Ces recommandations sont des pistes de diplômes, pas des offres vérifiées : ne prétends pas connaître une place disponible ou une formation près du domicile. Les établissements, la localisation réelle et l'offre du catalogue seront vérifiés par la recherche nationale, sans élargissement géographique silencieux.
Une absence dans le catalogue ne signifie pas que le diplôme n'existe pas. N'invente ni intitulé, ni établissement, ni garantie d'admission.`
