import { useMemo } from 'react'
import NiveauTemplate from './NiveauTemplate'

const ARC_DEFINITIONS = [
  {
    id: 'interets_forces',
    min: 6,
    max: 10,
    title: 'Approfondir tes forces',
    subtitle: 'Consolidation des centres d’intérêt et des motivations personnelles',
    description: "On continue à explorer ce qui fait ta singularité. Les prochains ateliers t'aideront à clarifier tes forces et les environnements où tu t'épanouis vraiment.",
    label: 'Forces & intérêts'
  },
  {
    id: 'recherche_metiers',
    min: 11,
    max: 15,
    title: 'Explorer des univers métiers',
    subtitle: 'Découvertes guidées pour confronter tes envies au terrain',
    description: "Place à l'exploration concrète : métiers inspirants, études de cas et premières immersions virtuelles pour valider tes intuitions.",
    label: 'Recherche métiers'
  },
  {
    id: 'immersions_rencontres',
    min: 16,
    max: 20,
    title: 'Multiplier les rencontres',
    subtitle: 'Préparation et capitalisation sur les échanges professionnels',
    description: "On te met dans les meilleures conditions pour échanger avec des pros, préparer tes questions et tirer le meilleur de chaque rencontre.",
    label: 'Immersions & rencontres'
  },
  {
    id: 'competences_soft_skills',
    min: 21,
    max: 25,
    title: 'Valoriser tes compétences',
    subtitle: 'Identifier, documenter et illustrer tes soft skills clés',
    description: "Tu vas apprendre à mettre en lumière tes compétences comportementales et à raconter tes expériences avec impact.",
    label: 'Compétences & soft skills'
  },
  {
    id: 'cv_lm',
    min: 26,
    max: 30,
    title: 'Construire un dossier percutant',
    subtitle: 'CV, lettre et pitch : les essentiels pour te démarquer',
    description: "On passe en mode production : modèles guidés, retours sur ton CV et rédaction accompagnée pour ta lettre de motivation.",
    label: 'CV & lettre'
  },
  {
    id: 'parcoursup_preparation',
    min: 31,
    max: 35,
    title: 'Sécuriser ton Parcoursup',
    subtitle: 'Stratégie de vœux et dossiers solidement argumentés',
    description: "Tu travailles ta stratégie Parcoursup, tu hiérarchises tes vœux et tu consolides chaque dossier.",
    label: 'Parcoursup'
  },
  {
    id: 'orals_pitch',
    min: 36,
    max: 40,
    title: 'Réussir tes oraux',
    subtitle: 'Préparation mentale, scénarios guidés et feedbacks',
    description: "Simulations d'entretiens, pitchs chronométrés et exercices de confiance pour arriver serein(e) le jour J.",
    label: 'Oraux & pitch'
  },
  {
    id: 'dossiers_avances',
    min: 41,
    max: 45,
    title: 'Polir chaque détail',
    subtitle: 'Audit complet de ton dossier et plan d’action final',
    description: "On passe tout au crible : cohérence générale, storytelling, preuves. Tu termines avec un dossier prêt à être envoyé.",
    label: 'Dossier avancé'
  },
  {
    id: 'maitrise_finale',
    min: 46,
    max: 50,
    title: 'Devenir mentor',
    subtitle: 'Capitaliser sur ton parcours et transmettre',
    description: "Tu transformes ton expérience en expertise : accompagnement des autres, partage de tes apprentissages et vision long terme.",
    label: 'Maîtrise finale'
  }
]

const ARC_TASKS = {
  interets_forces: [
    {
      title: 'Diagnostic approfondi de tes motivations',
      hint: 'Tu identifies ce qui te donne de l’énergie au quotidien et pourquoi.'
    },
    {
      title: 'Carte de tes environnements préférés',
      hint: 'Tu relies tes intérêts aux contextes scolaires ou pro qui te correspondent.'
    },
    {
      title: 'Journal des réussites',
      hint: 'Tu capitalises sur tes succès pour nourrir ta confiance.'
    }
  ],
  recherche_metiers: [
    {
      title: 'Veille métiers ciblée',
      hint: 'Tu découvres 3 métiers réalistes associés à ton profil.'
    },
    {
      title: 'Interviews inspirantes',
      hint: 'Tu prépares des questions pour rencontrer des pros du secteur.'
    },
    {
      title: 'Tableau de comparaison',
      hint: 'Tu compares débouchés, missions et formations associées.'
    }
  ],
  immersions_rencontres: [
    {
      title: 'Préparation express aux rencontres',
      hint: 'Tu rédiges un pitch de présentation et tes objectifs de rencontre.'
    },
    {
      title: 'Immersion guidée',
      hint: 'Tu vis une simulation ou une immersion terrain commentée.'
    },
    {
      title: 'Retour d’expérience structuré',
      hint: 'Tu capitalises sur chaque échange avec une fiche synthèse.'
    }
  ],
  competences_soft_skills: [
    {
      title: 'Inventaire de tes soft skills',
      hint: 'Tu relies chaque compétence à une situation vécue.'
    },
    {
      title: 'Storytelling des expériences',
      hint: 'Tu apprends à raconter un projet marquant avec la méthode STAR.'
    },
    {
      title: 'Plan de progression ciblé',
      hint: 'Tu définis 2 axes d’amélioration et ton plan d’entraînement.'
    }
  ],
  cv_lm: [
    {
      title: 'CV design et contenu',
      hint: 'Tu construis un CV clair, lisible et orienté impact.'
    },
    {
      title: 'Lettre de motivation guidée',
      hint: 'Tu suis un canevas pas à pas avec feedback instantané.'
    },
    {
      title: 'Élaboration de ton pitch écrit',
      hint: 'Tu synthétises ton profil en quelques phrases convaincantes.'
    }
  ],
  parcoursup_preparation: [
    {
      title: 'Stratégie de vœux',
      hint: 'Tu priorises et testes plusieurs scénarios d’admission.'
    },
    {
      title: 'Projet motivé béton',
      hint: 'Tu rédiges un projet motivé personnalisé et argumenté.'
    },
    {
      title: 'Checklist administrative',
      hint: 'Tu sécurises chaque dossier avec un plan de contrôle rapide.'
    }
  ],
  orals_pitch: [
    {
      title: 'Simulation d’entretien chronométrée',
      hint: 'Tu t’entraînes avec un retour détaillé sur la posture et le fond.'
    },
    {
      title: 'Défi pitch 60 secondes',
      hint: 'Tu apprends à te présenter de façon percutante et mémorable.'
    },
    {
      title: 'Gestion du stress et de la voix',
      hint: 'Tu explores des techniques concrètes pour être à l’aise.'
    }
  ],
  dossiers_avances: [
    {
      title: 'Audit intégral de ton dossier',
      hint: 'Tu vérifies cohérence, preuves et différenciation.'
    },
    {
      title: 'Plan d’amélioration finale',
      hint: 'Tu priorises les derniers ajustements à réaliser.'
    },
    {
      title: 'Simulation d’évaluation jury',
      hint: 'Tu testes ton dossier face à des critères exigeants.'
    }
  ],
  maitrise_finale: [
    {
      title: 'Bilan rétrospectif complet',
      hint: 'Tu captures tout ce que tu as appris pendant le parcours.'
    },
    {
      title: 'Mentorat d’un autre Zélia',
      hint: 'Tu partages ton expérience pour accompagner un nouvel élève.'
    },
    {
      title: 'Vision long terme',
      hint: 'Tu élabores une feuille de route post-Zélia.'
    }
  ]
}

function clampLevel(value) {
  const parsed = Number(value)
  if (Number.isNaN(parsed)) return 6
  return Math.min(Math.max(parsed, 6), 50)
}

function selectArc(level) {
  return ARC_DEFINITIONS.find((arc) => level >= arc.min && level <= arc.max) || ARC_DEFINITIONS[0]
}

function computeXpReward(level) {
  const base = 220
  const step = 25
  const offset = Math.max(0, level - 6)
  return base + offset * step
}

function buildTasks(arcId, level) {
  const seeds = ARC_TASKS[arcId] || []
  return seeds.map((seed, index) => ({
    id: `${arcId}-${level}-${index + 1}`,
    title: seed.title,
    hint: seed.hint
  }))
}

function buildConfig(level) {
  const safeLevel = clampLevel(level)
  const arc = selectArc(safeLevel)
  const xpReward = computeXpReward(safeLevel)
  const tasks = buildTasks(arc.id, safeLevel)

  return {
    level: safeLevel,
    xpReward,
    title: `Niveau ${safeLevel} — ${arc.title}`,
    subtitle: arc.subtitle,
    description: arc.description,
    tasks,
    comingSoon: true,
    arcLabel: arc.label
  }
}

export default function NiveauPlaceholder({ level }) {
  const safeLevel = clampLevel(level)
  const config = useMemo(() => buildConfig(safeLevel), [safeLevel])

  return <NiveauTemplate {...config} />
}
