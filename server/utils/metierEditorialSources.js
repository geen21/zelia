const checkedAt = '2026-11-03'

const aiSource = {
  id: 'oit-ia-2025',
  name: 'OIT — Generative AI and Jobs, étude du 20 mai 2025',
  url: 'https://www.ilo.org/publications/generative-ai-and-jobs-refined-global-index-occupational-exposure',
  checkedAt,
  facts: [
    'L’étude examine l’exposition des tâches à l’IA générative à l’échelle internationale, pas les recrutements français actuels.',
    'Les emplois administratifs sont particulièrement exposés ; des activités techniques et professionnelles numérisées le sont aussi.',
    'Exposition des tâches ne signifie pas disparition d’un métier. La transformation des emplois est jugée plus probable que leur remplacement intégral.',
    'Ce cadre permet une analyse conditionnelle, pas une prédiction certaine ni un verdict officiel pour un métier particulier.'
  ]
}

const profiles = [
  {
    matches: (title) => /^infographiste$/iu.test(title),
    scope: 'Infographiste de communication visuelle : supports imprimés et numériques. Ne pas généraliser à toutes les spécialités 3D.',
    sources: [
      {
        id: 'rncp-graphiste',
        name: 'France compétences — titre professionnel Graphiste, RNCP39532',
        url: 'https://www.francecompetences.fr/recherche/rncp/39532/',
        checkedAt,
        facts: [
          'Certification active, de niveau 5, dont l’enregistrement court jusqu’au 30 septembre 2029.',
          'Le graphiste analyse les objectifs, publics, délais et contraintes d’une commande, puis réalise des supports visuels imprimés ou numériques.',
          'Il prépare et contrôle les livrables et coordonne les échanges avec clients, équipes créatives et prestataires.',
          'Les compétences couvrent composition et mise en page, illustration, contenus multimédias, veille et conduite de projets.',
          'Les environnements comprennent agence, studio, service de communication et activité indépendante.',
          'L’activité peut comporter un travail prolongé sur écran, des échéances serrées et des échanges pour ajuster les propositions.'
        ]
      },
      {
        id: 'afpa-graphiste',
        name: 'Afpa — parcours qualifiant Graphiste',
        url: 'https://www.afpa.fr/formation-qualifiante/graphiste',
        checkedAt,
        facts: [
          'L’Afpa présente infographiste parmi les appellations associées au graphisme.',
          'Son parcours vise le titre professionnel Graphiste de niveau 5, présenté comme équivalent bac +2.',
          'Les objectifs incluent création graphique, solutions multimédias et coordination de projets.',
          'Il s’agit d’un exemple de parcours, pas d’un diplôme unique obligatoire pour toutes les activités du graphisme. Ne pas reprendre le prix ou la durée commerciale.'
        ]
      }
    ]
  },
  {
    matches: (title) => /^(?:collaborateur comptable junior|comptable(?: assistant)?)$/iu.test(title),
    scope: 'Comptable salarié ou collaborateur junior supervisé, en entreprise ou en cabinet. Ne pas confondre avec l’expert-comptable.',
    sources: [
      {
        id: 'rncp-comptabilite',
        name: 'France compétences — titre professionnel Comptable assistant, RNCP37121',
        url: 'https://www.francecompetences.fr/recherche/rncp/37121/',
        checkedAt,
        facts: [
          'Certification active de niveau 4, dont l’enregistrement court jusqu’au 1er mars 2028.',
          'Le référentiel décrit le contrôle et l’enregistrement des documents commerciaux, sociaux et fiscaux ainsi que la justification des comptes.',
          'Les tâches incluent opérations clients et fournisseurs, trésorerie, éléments de paie, TVA, tableaux de bord et participation à la clôture annuelle.',
          'Le travail utilise des logiciels de gestion et de comptabilité et demande une veille réglementaire.',
          'L’emploi est principalement sédentaire, sur écran, avec des contraintes de délai et des pics liés aux échéances.',
          'En cabinet, le collaborateur peut traiter plusieurs dossiers sous l’autorité d’un responsable de mission ou d’un expert-comptable.',
          'Les échanges avec clients, fournisseurs et interlocuteurs internes demandent clarté et capacités relationnelles.'
        ]
      },
      {
        id: 'afpa-comptabilite',
        name: 'Afpa — parcours qualifiant Comptable assistant',
        url: 'https://www.afpa.fr/formation-qualifiante/comptable-assistant',
        checkedAt,
        facts: [
          'Le parcours vise le titre professionnel Comptable assistant de niveau 4.',
          'C’est un exemple de formation d’entrée dans les activités comptables, pas une équivalence avec l’expertise comptable ni une obligation pour tous les postes juniors.',
          'Vérifier les attendus d’une formation et du poste visé plutôt que déduire un parcours universel. Ne pas reprendre le prix ou la durée commerciale.'
        ]
      }
    ]
  },
  {
    matches: (title) => /^infirmier(?: en soins généraux)?(?: \(ide\))?$/iu.test(title),
    scope: 'Infirmier en soins généraux en France. Décrire le métier, sans conseil médical ni protocole de soins.',
    sources: [
      {
        id: 'rncp-infirmier',
        name: 'France compétences — diplôme d’État Infirmier, RNCP42589',
        url: 'https://www.francecompetences.fr/recherche/rncp/42589/',
        checkedAt,
        facts: [
          'Cette fiche remplace la RNCP39923 et renvoie au référentiel de formation de l’arrêté du 20 février 2026.',
          'Elle décrit évaluation clinique, diagnostic infirmier, soins préventifs, thérapeutiques, relationnels et palliatifs, éducation à la santé et coordination.',
          'L’infirmier exerce dans le respect de la déontologie, dans son rôle propre ou sur prescription, en lien avec les autres professionnels.',
          'Les compétences incluent la collecte de données pertinentes, l’adaptation des interventions, la continuité des soins et l’accompagnement des personnes.',
          'Le diplôme d’État constitue le parcours de qualification décrit. Les modalités applicables doivent être vérifiées selon la promotion auprès des établissements.',
          'La fiche annonce une délivrance universitaire à compter de l’année 2028-2029 : ne pas présenter cette date future comme déjà effective pour tous les diplômes en 2026.',
          'Ne pas inventer de durée de formation, de conditions de sélection ou de nouveaux actes autorisés absents de ces notes.'
        ]
      },
      {
        id: 'servicepublic-infirmier',
        name: 'Choisir le service public — infirmière / infirmier en soins généraux',
        url: 'https://choisirleservicepublic.gouv.fr/metiers/medical-et-paramedical/infirmiere-infirmier-en-soins-generaux/',
        checkedAt,
        facts: [
          'Le métier contribue à la continuité des soins et à leur adaptation aux besoins de chaque patient.',
          'Le rôle comprend la relation avec les proches, la coordination avec les professionnels et un soutien psychologique et émotionnel.',
          'La présentation porte sur les dimensions humaines du travail ; ne pas en déduire des chiffres d’embauche ou une protection absolue contre l’automatisation.'
        ]
      }
    ]
  }
]

export function metierEditorialContext(page) {
  const profile = profiles.find((candidate) => candidate.matches(page.title))
  if (!profile) throw new Error(`Sources métier à vérifier avant génération détaillée : ${page.title}`)
  const sources = [...profile.sources, aiSource]
  return {
    scope: profile.scope,
    sources,
    publicSources: sources.map(({ facts, ...source }) => source)
  }

  export function hasMetierEditorialSources(page) {
    return profiles.some((profile) => profile.matches(page.title))
  }
}
