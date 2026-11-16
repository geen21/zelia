export const EDITORIAL_SLUGS = [
  'parcoursup-2027-dates-nouveautes',
  'nombre-eleves-par-classe-lycee',
  'blocus-lycee-legal-risques',
  'prepa-cpge-c-est-quoi',
  'bac-5-premier-emploi-insertion'
]

const editorialCardBase = {
  publishedAt: '3 novembre 2026',
  dateIso: '2026-11-03T09:00:00+01:00',
  updatedIso: '2026-11-03T09:00:00+01:00',
  readingTime: '3 min',
  image: '/assets/images/logo-dark.png'
}

export const latestEditorialCards = [
  {
    ...editorialCardBase,
    slug: 'parcoursup-2027-dates-nouveautes',
    title: 'Parcoursup 2027 : les dates clés et ce qui change avant sa fin en 2028',
    description: 'Parcoursup 2027 ouvre le 18 janvier. Les dates à retenir, ce qui change dès cette année et ce que l’on sait de son remplacement prévu en 2028.',
    category: 'Parcoursup',
    accent: '#6d28d9',
    accentSoft: '#ede9fe',
    cover: { value: '18 janvier', label: 'Ouverture des vœux', detail: 'Le calendrier Parcoursup 2027', icon: 'ph-calendar-check' }
  },
  {
    ...editorialCardBase,
    slug: 'nombre-eleves-par-classe-lycee',
    title: 'Combien d’élèves par classe au lycée en 2026 ? Les vrais chiffres',
    description: '30,5 élèves en moyenne par classe au lycée général en 2026. Pourquoi c’est autant, ce que ça change en cours, et ce que prévoient les secondes à 28.',
    category: 'Vie au lycée',
    accent: '#0369a1',
    accentSoft: '#e0f2fe',
    cover: { value: '30,5', label: 'Élèves par classe en moyenne', detail: 'Lycée général et technologique · 2026', icon: 'ph-users-three' }
  },
  {
    ...editorialCardBase,
    slug: 'blocus-lycee-legal-risques',
    title: 'Blocus au lycée : c’est quoi, est-ce légal et qu’est-ce qu’on risque ?',
    description: 'Blocus au lycée : ce que c’est, ce que dit la loi, les sanctions possibles et ce qui s’est passé à l’automne 2026. Les faits, sans parti pris.',
    category: 'Vie au lycée',
    accent: '#be185d',
    accentSoft: '#fce7f3',
    cover: { value: 'Tes droits', label: 'S’informer avant d’agir', detail: 'Expression, mobilisation et sanctions', icon: 'ph-scales' }
  }
]
