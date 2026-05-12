export const ORIENTATION_VIDEO_TOOL_PATH = '/app/outils/videos-orientation'

export const ORIENTATION_VIDEO_ITEMS = [
  {
    level: 2,
    title: "L'importance de l'orientation",
    description: "Comprendre pourquoi l'orientation se construit progressivement.",
    videoId: 'JBEFI62HPsE',
    questionId: 'niveau2_video_watched',
    questionText: 'Vidéo orientation regardée'
  },
  {
    level: 8,
    title: 'La diversité des métiers',
    description: 'Explorer la variété des métiers et ouvrir le champ des possibles.',
    videoId: 'QMwfhMb6cxA',
    questionId: 'niveau8_video_watched',
    questionText: 'Vidéo diversité des métiers regardée'
  },
  {
    level: 16,
    title: 'Comment se vendre',
    description: 'Valoriser son profil, ses expériences et ses qualités.',
    videoId: 'GkGkONEAbL0',
    questionId: 'niveau16_video_watched',
    questionText: 'Vidéo tutoriel Parcoursup regardée'
  },
  {
    level: 25,
    title: 'Études post-bac',
    description: 'Comprendre les choix possibles après le bac.',
    videoId: 'OLd17RLW85A',
    questionId: 'niveau25_video_watched',
    questionText: 'Vidéo études post-bac regardée'
  },
  {
    level: 27,
    title: "Se présenter à l'oral",
    description: 'Préparer une présentation claire, courte et convaincante.',
    videoId: 'BI9OJDvaR5A',
    questionId: 'niveau27_video_watched',
    questionText: 'Vidéo présentation orale regardée'
  },
  {
    level: 35,
    title: 'Motivation',
    description: 'Garder le cap et avancer étape par étape.',
    videoId: 'zwNFqXkxqOA',
    questionId: 'niveau35_video_completed',
    questionText: 'Vidéo motivation regardée'
  }
]

export const ORIENTATION_VIDEO_COMPLETION_ID = 'orientation_videos_completed'
export const VIDEO_TOOL_LEVELS = ORIENTATION_VIDEO_ITEMS.map((video) => video.level)

export function isVideoToolPath(pathname = '') {
  return pathname.includes('/outils')
}

export function getNextVideoToolPath(currentLevel) {
  return ORIENTATION_VIDEO_TOOL_PATH
}

export function getVideoToolButtonLabel(currentLevel) {
  return 'Terminer'
}