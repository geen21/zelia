export const blogPosts = [
  {
    slug: 'explorer-metiers-demain',
    title: 'Explorer les métiers de demain',
    description: 'Comment anticiper les compétences qui compteront pour les métiers émergents et se mettre en mouvement dès maintenant.',
    category: 'Futur du travail',
    readingTime: '6 min',
    publishedAt: 'Octobre 2025',
    accent: '#0ea5e9',
    accentSoft: '#e0f2fe'
  },
  {
    slug: 'questionnaire-orientation-premiers-pas',
    title: 'Bien démarrer le questionnaire Zélia',
    description: 'Quelques repères pour aborder le questionnaire d\'orientation avec curiosité et sans stress inutile.',
    category: 'Méthodologie',
    readingTime: '4 min',
    publishedAt: 'Septembre 2025',
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
