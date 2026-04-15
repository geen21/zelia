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

// All old levels that become standalone tools in the Boite a Outils
// Excludes levels that are part of the new parcours (1, 3, 7, 11, 12, 15, 21, 22, 23)
export const TOOLBOX_ITEMS = [
  { oldLevel: 2, title: "L'importance de l'orientation", category: 'Videos', icon: 'ph-video', description: "Video sur l'importance de l'orientation professionnelle" },
  { oldLevel: 4, title: 'Test de personnalite', category: 'Quiz', icon: 'ph-brain', description: "Questionnaire de personnalite approfondi avec analyse IA" },
  { oldLevel: 5, title: "Test d'anglais", category: 'Quiz', icon: 'ph-translate', description: "Evaluation de ton niveau d'anglais (CECR A1-C2)" },
  { oldLevel: 6, title: 'Recherche de formations', category: 'Orientation', icon: 'ph-magnifying-glass', description: 'Rechercher des formations par mot-cle et region' },
  { oldLevel: 8, title: 'La diversite des metiers', category: 'Videos', icon: 'ph-video', description: 'Video sur la diversite des metiers et partage' },
  { oldLevel: 9, title: "Recherche d'emplois", category: 'Exploration', icon: 'ph-briefcase', description: "Rechercher des offres d'emploi reelles" },
  { oldLevel: 13, title: 'Chat communautaire', category: 'Communication', icon: 'ph-chats', description: 'Echange avec la communaute Zelia' },
  { oldLevel: 14, title: 'Lettre de motivation', category: 'Documents', icon: 'ph-file-text', description: 'Generation IA de lettre de motivation personnalisee' },
  { oldLevel: 16, title: 'Video : comment se vendre', category: 'Videos', icon: 'ph-video', description: 'Tutoriel CV par Nicolas' },
  { oldLevel: 17, title: 'Creation du CV', category: 'Documents', icon: 'ph-identification-card', description: 'Creer et exporter ton CV en PDF' },
  { oldLevel: 18, title: 'Classement des metiers', category: 'Exploration', icon: 'ph-sort-ascending', description: 'Classe tes metiers preferes par ordre de preference' },
  { oldLevel: 19, title: "Axes d'amelioration", category: 'Developpement', icon: 'ph-trend-up', description: "5 points d'amelioration personnalises par l'IA" },
  { oldLevel: 24, title: 'Quiz statistiques orientation', category: 'Quiz', icon: 'ph-chart-pie', description: "Quiz sur les statistiques d'orientation post-bac" },
  { oldLevel: 25, title: 'Video : etudes post-bac', category: 'Videos', icon: 'ph-video', description: 'Video sur les etudes apres le bac' },
  { oldLevel: 26, title: 'Infos Parcoursup', category: 'Orientation', icon: 'ph-info', description: 'Tout savoir sur Parcoursup' },
  { oldLevel: 27, title: "Video : se presenter a l'oral", category: 'Videos', icon: 'ph-video', description: 'Comment se presenter efficacement' },
  { oldLevel: 28, title: 'Entrainement pitch', category: 'Entretien', icon: 'ph-microphone', description: 'Enregistre ton pitch et recois un feedback IA' },
  { oldLevel: 29, title: "Simulation d'entretien", category: 'Entretien', icon: 'ph-chats-circle', description: "Simulation d'entretien avec un coach IA exigeant" },
  { oldLevel: 31, title: "Explorer un parcours d'etudes", category: 'Exploration', icon: 'ph-path', description: 'Decouvre les etudes necessaires pour ton metier' },
  { oldLevel: 32, title: 'Competences recommandees', category: 'Exploration', icon: 'ph-star', description: 'Competences a developper pour ta carriere' },
  { oldLevel: 33, title: 'Lettre a soi-meme', category: 'Developpement', icon: 'ph-envelope', description: 'Ecris une lettre a ton futur toi dans 5 ans' },
  { oldLevel: 34, title: 'Gestion du stress', category: 'Developpement', icon: 'ph-heart', description: 'Decouvre ton profil de gestion du stress' },
  { oldLevel: 35, title: 'Video motivation', category: 'Videos', icon: 'ph-video', description: 'Video motivationnelle par Nicolas' },
  { oldLevel: 36, title: 'Intelligence emotionnelle', category: 'Soft Skills', icon: 'ph-smiley', description: "Scenarios interactifs sur l'adaptabilite" },
  { oldLevel: 37, title: 'Quiz soft skills', category: 'Quiz', icon: 'ph-chart-pie', description: 'Quiz sur les statistiques de recrutement et soft skills' },
  { oldLevel: 38, title: 'Resolution de problemes', category: 'Soft Skills', icon: 'ph-puzzle-piece', description: "Scenarios de resolution de problemes en entreprise" },
  { oldLevel: 39, title: 'Feedback', category: 'Autre', icon: 'ph-chat-dots', description: "Donne ton avis sur l'experience Zelia" }
]

export const TOOLBOX_CATEGORIES = [
  'Exploration', 'Quiz', 'Videos', 'Documents', 'Orientation',
  'Communication', 'Entretien', 'Developpement', 'Soft Skills', 'Autre'
]
