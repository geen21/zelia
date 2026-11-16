export const SCHOOL_SHARING_VERSION = 'orientation-dossier-v1'
export const SCHOOL_SHARING_NOTICE = 'En demandant des informations, tu autorises cette école à recevoir tes coordonnées, ton profil scolaire, tes réponses au questionnaire et ton bilan d’orientation pour te recontacter. Tu peux retirer ce partage depuis ton profil.'

export const SCHOOL_LEVEL_LABELS = {
  '3e': '3e',
  '3eme': '3e',
  '3ème': '3e',
  '2nde': '2nde',
  seconde: '2nde',
  '1ere': '1ère',
  '1ère': '1ère',
  premiere: '1ère',
  première: '1ère',
  terminale: 'Terminale',
  post_bac: 'Post-bac',
  'post-bac': 'Post-bac',
  'post bac': 'Post-bac'
}

export function formatSchoolLevel(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  return SCHOOL_LEVEL_LABELS[raw] || SCHOOL_LEVEL_LABELS[raw.toLowerCase()] || raw
}

