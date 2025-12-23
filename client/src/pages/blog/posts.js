export const blogPosts = [
  {
    slug: 'etude-salaire-bon-salaire-ados',
    title: 'Étude sur le salaire : ce qu’en disent 50 jeunes de 15 à 18 ans',
    description: 'Chiffres clés (moyenne, médiane, mode), valeurs extrêmes, et répartition par tranches avec graphiques simples.',
    category: 'Méthodologie',
    readingTime: '6 min',
    publishedAt: 'Décembre 2025',
    accent: '#f97316',
    accentSoft: '#ffedd5'
  },
  {
    slug: 'choisir-ses-etudes-sans-pression',
    title: 'Choisir ses études : comment décider sans pression',
    description: 'Questions simples pour choisir ta formation, droit à l’erreur, plan B, et comment Zelia peut t’aider (avec une FAQ).',
    category: 'Orientation',
    readingTime: '6 min',
    publishedAt: 'Décembre 2025',
    accent: '#6366f1',
    accentSoft: '#e0e7ff'
  },
  {
    slug: 'metier-bien-fait-pour-soi-mode-emploi',
    title: 'S’assurer qu’un métier est bien fait pour soi, mode d’emploi',
    description: 'Méthode simple pour savoir si un métier est fait pour toi : quotidien réel, valeurs, projection, parcours, et droit de changer d’avis (avec une FAQ).',
    category: 'Méthodologie',
    readingTime: '9 min',
    publishedAt: 'Décembre 2025',
    accent: '#0ea5e9',
    accentSoft: '#e0f2fe'
  },
  {
    slug: 'ia-remplacer-futur-metier',
    title: 'L’intelligence artificielle va-t-elle remplacer ton futur métier ?',
    description: 'L’IA inquiète, mais elle crée aussi des opportunités. Découvre quels métiers vont évoluer et comment te préparer à ce changement inévitable.',
    category: 'Futur du travail',
    readingTime: '6 min',
    publishedAt: 'Novembre 2025',
    accent: '#0ea5e9',
    accentSoft: '#e0f2fe'
  },
  {
    slug: 'pourquoi-ecole-ne-t-aide-pas',
    title: 'Pourquoi l’école ne t’aide pas à te connaître (et ce qu’on te cache sur l’orientation)',
    description: 'L’école t’apprend à résoudre des équations, mais pas à savoir qui tu es. Découvre pourquoi le système actuel ne t’aide pas à trouver ta voie.',
    category: 'Orientation',
    readingTime: '5 min',
    publishedAt: 'Novembre 2025',
    accent: '#6366f1',
    accentSoft: '#e0e7ff'
  },
  {
    slug: 'accompagner-parents',
    title: 'Accompagner ses parents dans le choix d\'orientation',
    description: 'Transformer la discussion familiale sur l\'orientation en moment constructif et apaisé.',
    category: 'Vie familiale',
    readingTime: '5 min',
    publishedAt: 'Août 2025',
    accent: '#f97316',
    accentSoft: '#ffedd5'
  }
]

export function findBlogPost(slug) {
  return blogPosts.find((post) => post.slug === slug)
}
