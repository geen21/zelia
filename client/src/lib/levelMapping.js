// Level mapping: New 10-level system -> Old 40-level system
// New Level -> Old Level (component file)
// 1 -> 1  (Niveau1.jsx - Exploration metiers)
// 2 -> 11 (Niveau11.jsx - Classement des domaines)
// 3 -> 3  (Niveau3.jsx - Quiz idees recues)
// 4 -> 15 (Niveau15.jsx - Points positifs et negatifs)
// 5 -> 7  (Niveau7.jsx - Matching metier)
// 6 -> 12 (Niveau12.jsx - Debouches et marche)
// 7 -> 21 (Niveau21.jsx - Choisir une voie d etudes)
// 8 -> 22 (Niveau22.jsx - Panorama des etudes)
// 9 -> 23 (Niveau23.jsx - Ecoles recommandees)
// 10 -> bilan (NiveauBilanFinal.jsx - Bilan final)

export const NEW_TO_OLD_LEVEL = {
  1: 1,
  2: 11,
  3: 3,
  4: 15,
  5: 7,
  6: 12,
  7: 21,
  8: 22,
  9: 23,
  10: 'bilan'
}

export const OLD_TO_NEW_LEVEL = {
  1: 1,
  11: 2,
  3: 3,
  15: 4,
  7: 5,
  12: 6,
  21: 7,
  22: 8,
  23: 9
}

export function getOldLevel(newLevel) {
  return NEW_TO_OLD_LEVEL[newLevel] || null
}

export function getNewLevel(oldLevel) {
  return OLD_TO_NEW_LEVEL[oldLevel] || null
}

// For user migration: map any old level to the closest new level
export function migrateOldLevelToNew(oldLevel) {
  const n = Number(oldLevel) || 1
  if (n <= 1) return 1
  if (n <= 2) return 1
  if (n <= 3) return 3
  if (n <= 6) return 3
  if (n <= 7) return 5
  if (n <= 10) return 5
  if (n <= 11) return 2
  if (n <= 12) return 6
  if (n <= 14) return 6
  if (n <= 15) return 4
  if (n <= 20) return 6
  if (n <= 21) return 7
  if (n <= 22) return 8
  if (n <= 23) return 9
  if (n >= 40) return 10
  return 9
}

// Functional toolbox entries. Legacy level IDs are kept only for redirects/data compatibility.
export const TOOLBOX_ITEMS = [
  { id: 'videos-orientation', legacyLevels: [2, 8, 16, 25, 27, 35], path: '/app/outils/videos-orientation', title: 'Vidéos orientation', category: 'Videos', icon: 'ph-video', description: "Toutes les vidéos d'orientation à suivre au même endroit" },
  { id: 'personnalite', legacyLevels: [4], componentLevel: 4, path: '/app/outils/personnalite', title: 'Test de personnalite', category: 'Quiz', icon: 'ph-brain', description: "Questionnaire de personnalite approfondi avec analyse IA" },
  { id: 'anglais', legacyLevels: [5], componentLevel: 5, path: '/app/outils/anglais', title: "Test d'anglais", category: 'Quiz', icon: 'ph-translate', description: "Evaluation de ton niveau d'anglais (CECR A1-C2)" },
  { id: 'formations', legacyLevels: [6], path: '/app/formations', title: 'Recherche de formations', category: 'Orientation', icon: 'ph-magnifying-glass', description: 'Rechercher des formations par mot-cle et region' },
  { id: 'emplois', legacyLevels: [9], path: '/app/emplois', title: "Recherche d'emplois", category: 'Exploration', icon: 'ph-briefcase', description: "Rechercher des offres d'emploi reelles" },
  { id: 'communaute', legacyLevels: [13], path: '/app/chat', title: 'Chat communautaire', category: 'Communication', icon: 'ph-chats', description: 'Echange avec la communaute Zelia' },
  { id: 'lettre', legacyLevels: [14], path: '/app/lettre', title: 'Lettre de motivation', category: 'Documents', icon: 'ph-file-text', description: 'Generation IA de lettre de motivation personnalisee' },
  { id: 'cv', legacyLevels: [17], componentLevel: 17, path: '/app/outils/cv', title: 'Creation du CV', category: 'Documents', icon: 'ph-identification-card', description: 'Creer et exporter ton CV en PDF' },
  { id: 'classement-metiers', legacyLevels: [18], componentLevel: 18, path: '/app/outils/classement-metiers', title: 'Classement des metiers', category: 'Exploration', icon: 'ph-sort-ascending', description: 'Classe tes metiers preferes par ordre de preference' },
  { id: 'axes-amelioration', legacyLevels: [19], componentLevel: 19, path: '/app/outils/axes-amelioration', title: "Axes d'amelioration", category: 'Developpement', icon: 'ph-trend-up', description: "5 points d'amelioration personnalises par l'IA" },
  { id: 'quiz-orientation', legacyLevels: [24], componentLevel: 24, path: '/app/outils/quiz-orientation', title: 'Quiz statistiques orientation', category: 'Quiz', icon: 'ph-chart-pie', description: "Quiz sur les statistiques d'orientation post-bac" },
  { id: 'parcoursup', legacyLevels: [26], componentLevel: 26, path: '/app/outils/parcoursup', title: 'Infos Parcoursup', category: 'Orientation', icon: 'ph-info', description: 'Tout savoir sur Parcoursup' },
  { id: 'pitch', legacyLevels: [28], componentLevel: 28, path: '/app/outils/pitch', title: 'Entrainement pitch', category: 'Entretien', icon: 'ph-microphone', description: 'Enregistre ton pitch et recois un feedback IA' },
  { id: 'entretien', legacyLevels: [29], componentLevel: 29, path: '/app/outils/entretien', title: "Simulation d'entretien", category: 'Entretien', icon: 'ph-chats-circle', description: "Simulation d'entretien avec un coach IA exigeant" },
  { id: 'parcours-etudes', legacyLevels: [31], componentLevel: 31, path: '/app/outils/parcours-etudes', title: "Explorer un parcours d'etudes", category: 'Exploration', icon: 'ph-path', description: 'Decouvre les etudes necessaires pour ton metier' },
  { id: 'competences', legacyLevels: [32], componentLevel: 32, path: '/app/outils/competences', title: 'Competences recommandees', category: 'Exploration', icon: 'ph-star', description: 'Competences a developper pour ta carriere' },
  { id: 'lettre-futur', legacyLevels: [33], componentLevel: 33, path: '/app/outils/lettre-futur', title: 'Lettre a soi-meme', category: 'Developpement', icon: 'ph-envelope', description: 'Ecris une lettre a ton futur toi dans 5 ans' },
  { id: 'stress', legacyLevels: [34], componentLevel: 34, path: '/app/outils/stress', title: 'Gerer son stress', category: 'Developpement', icon: 'ph-heart', description: 'Profil de stress et exercices guides pour faire redescendre la pression' },
  { id: 'intelligence-emotionnelle', legacyLevels: [36], componentLevel: 36, path: '/app/outils/intelligence-emotionnelle', title: 'Intelligence emotionnelle', category: 'Soft Skills', icon: 'ph-smiley', description: "Scenarios interactifs sur l'adaptabilite" },
  { id: 'quiz-soft-skills', legacyLevels: [37], componentLevel: 37, path: '/app/outils/quiz-soft-skills', title: 'Quiz soft skills', category: 'Quiz', icon: 'ph-chart-pie', description: 'Quiz sur les statistiques de recrutement et soft skills' },
  { id: 'resolution-problemes', legacyLevels: [38], componentLevel: 38, path: '/app/outils/resolution-problemes', title: 'Resolution de problemes', category: 'Soft Skills', icon: 'ph-puzzle-piece', description: "Scenarios de resolution de problemes en entreprise" },
  { id: 'feedback', legacyLevels: [39], componentLevel: 39, path: '/app/outils/feedback', title: 'Feedback', category: 'Autre', icon: 'ph-chat-dots', description: "Donne ton avis sur l'experience Zelia" }
]

export const TOOLBOX_CATEGORIES = [
  'Exploration', 'Quiz', 'Videos', 'Documents', 'Orientation',
  'Communication', 'Entretien', 'Developpement', 'Soft Skills', 'Autre'
]
