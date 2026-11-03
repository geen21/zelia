const publication = {
  publishedAt: '3 novembre 2026',
  dateIso: '2026-11-03T09:00:00+01:00',
  updatedIso: '2026-11-03T09:00:00+01:00',
  readingTime: '3 min',
  image: '/assets/images/logo-dark.png'
}

export const editorialPosts = [
  {
    ...publication,
    slug: 'parcoursup-2027-dates-nouveautes',
    title: 'Parcoursup 2027 : les dates clés et ce qui change avant sa fin en 2028',
    metaTitle: 'Parcoursup 2027 : dates clés et nouveautés avant 2028',
    description: 'Parcoursup 2027 ouvre le 18 janvier. Les dates à retenir, ce qui change dès cette année et ce que l’on sait de son remplacement prévu en 2028.',
    category: 'Parcoursup',
    accent: '#6d28d9',
    accentSoft: '#ede9fe',
    cover: { value: '18 janvier', label: 'Ouverture des vœux', detail: 'Le calendrier Parcoursup 2027', icon: 'ph-calendar-check' },
    videoTitle: 'L’actu décodée, Parcoursup et le blocus',
    summary: 'Parcoursup 2027 aura bien lieu : les inscriptions et les vœux ouvrent le 18 janvier 2027 et se ferment le 11 mars. Le 26 octobre 2026, le gouvernement a annoncé que la plateforme serait remplacée en 2028. D’ici là, plusieurs changements arrivent dès cette session : refus expliqués, critères de sélection publiés, lettre de motivation demandée seulement quand elle est utile.',
    sections: [
      {
        id: 'parcoursup-en-2027',
        heading: 'Parcoursup existe-t-il toujours en 2027 ?',
        paragraphs: [
          'Oui. Si tu es en terminale cette année, c’est bien sur Parcoursup que tu formuleras tes vœux. Une annonce de remplacement ne supprime pas la procédure qui te concerne : garde donc un œil sur le calendrier Parcoursup 2027.',
          'Cet automne, Parcoursup est revenu souvent dans les revendications des lycéens mobilisés. Le 26 octobre 2026, les ministres de l’Éducation nationale et de l’Enseignement supérieur ont annoncé qu’en 2028, la plateforme serait remplacée par un nouveau système d’admission, plus simple, construit avec les lycéens et les enseignants. À ce jour, on ne sait pas encore à quoi il ressemblera.',
          'Pour toi qui passes le bac en 2027, la procédure ne change pas de fonctionnement en cours de route. Neuf des onze mesures annoncées s’appliquent dès cette session, mais elles ajoutent surtout de l’information et de la transparence.'
        ],
        links: [{ slug: 'blocus-lycee-legal-risques', label: 'Comprendre les mobilisations lycéennes' }]
      },
      {
        id: 'calendrier',
        heading: 'Quelles sont les dates de Parcoursup 2027 ?',
        table: {
          caption: 'Calendrier Parcoursup 2027 : les huit rendez-vous à retenir',
          columns: ['Date', 'Ce qui se passe'],
          rows: [
            ['17 décembre 2026', 'Mise en ligne des formations pour la rentrée 2027'],
            ['18 janvier 2027', 'Ouverture des inscriptions et des vœux'],
            ['11 mars 2027', 'Dernier jour pour formuler tes vœux'],
            ['1er avril 2027', 'Dernier jour pour compléter ton dossier et confirmer tes vœux'],
            ['1er juin 2027', 'Premières réponses des formations'],
            ['4 au 7 juin 2027', 'Classement des vœux encore en attente'],
            ['10 juin 2027', 'Ouverture de la phase complémentaire'],
            ['9 septembre 2027', 'Fin de la procédure']
          ]
        },
        paragraphs: [
          'Bon à savoir : les réponses sont mises en pause pendant les épreuves écrites du bac. Pour les formations en apprentissage, tu peux ajouter jusqu’à 10 vœux en plus, même après le 1er avril.',
          'Note séparément les deux échéances de mars et d’avril : formuler un vœu n’est pas le confirmer. Prépare tes pièces avant le dernier soir et relis chaque fiche pour vérifier ce que la formation demande.'
        ]
      },
      {
        id: 'nouveautes',
        heading: 'Qu’est-ce qui change dès cette année ?',
        paragraphs: ['Les principales nouveautés annoncées pour la session 2027 :'],
        bullets: [
          'Chaque refus sera expliqué : des éléments d’explication accompagneront les réponses négatives, et tu pourras demander une décision motivée.',
          'Les critères seront affichés : chaque fiche formation indiquera les critères et leur poids utilisés l’année précédente.',
          'Moins de lettres de motivation : elles ne seront demandées que si la formation justifie leur utilité.',
          'Une commission CLAIRE dans chaque académie, avec des lycéens, examinera l’orientation et l’affectation.',
          'Une information sur la réorientation dès le premier semestre du supérieur doit éviter de rester bloqué dans une filière qui ne te va pas.'
        ],
        conclusion: 'Le gouvernement annonce aussi 15 000 places supplémentaires, progressivement en 2027 et 2028 : 10 000 en BTS, 4 000 en BUT et 1 000 en licence accès santé. Le simulateur d’admission et la suppression de la mention du lycée d’origine sont prévus pour 2028.'
      },
      {
        id: 'propositions',
        heading: 'Quelles sont tes chances d’avoir une proposition ?',
        paragraphs: [
          'En 2026, Parcoursup a battu son record avec 1 046 000 candidats. Côté lycéens, 603 910 ont reçu au moins une proposition, soit 91,4 %. Les deux tiers (66,5 %) en avaient une dès le premier jour. Plus de 80 000 candidats ont trouvé une place pendant la phase complémentaire.',
          'Ces chiffres rassurent, mais une proposition n’est pas forcément ton premier choix. Moins de la moitié des lycéens interrogés en 2026 ont jugé la plateforme transparente. Le taux d’accès d’une formation est un repère collectif, pas une prédiction individuelle.'
        ],
        chart: {
          title: 'Une proposition ne vient pas toujours le premier jour',
          unit: '%',
          max: 100,
          rows: [{ label: 'Dès le premier jour', value: 66.5 }, { label: 'Sur l’ensemble de la procédure', value: 91.4 }],
          note: 'Part des lycéens ayant reçu au moins une proposition en 2026. Source : bilan du ministère de l’Éducation nationale.'
        }
      }
    ],
    parents: 'Le bon moment pour en parler, c’est maintenant, pas en mars. De décembre à janvier, votre ado peut explorer les fiches formations, repérer leur taux d’accès et noter les journées portes ouvertes. Aidez-le à construire plusieurs options, sans choisir à sa place. La date à ne pas manquer pour les vœux reste le 11 mars.',
    faq: [
      { question: 'Parcoursup est-il supprimé ?', answer: 'Pas pour 2027. Le gouvernement a annoncé son remplacement par un nouveau système à partir de 2028.' },
      { question: 'Combien de vœux peut-on faire sur Parcoursup 2027 ?', answer: 'Jusqu’à 10 vœux, plus 10 vœux supplémentaires pour des formations en apprentissage.' },
      { question: 'Quand reçoit-on les réponses ?', answer: 'À partir du 1er juin 2027, avec une pause pendant les épreuves écrites du bac.' }
    ],
    related: ['prepa-cpge-c-est-quoi', 'nombre-eleves-par-classe-lycee', 'bac-5-premier-emploi-insertion'],
    sources: [
      { label: 'Ministère de l’Enseignement supérieur — calendrier Parcoursup 2026-2027 (octobre 2026)', url: 'https://www.parcoursup.gouv.fr/sites/default/files/database/documents/2026-10/calendrier-parcoursup-2027-805_0.pdf' },
      { label: 'Ministère de l’Éducation nationale — bilan de la procédure d’admission 2026', url: 'https://www.education.gouv.fr/sites/default/files/document/parcoursup-bilan-de-la-procedure-d-admission-2026-521649.pdf' },
      { label: 'Gouvernement — ce qui change pour les lycéens et les étudiants (26 octobre 2026)', url: 'https://www.info.gouv.fr/actualite/parcoursup-classes-bourses-ce-qui-change-pour-les-lyceens-et-les-etudiants' },
      { label: 'Thotis — détail des mesures annoncées', url: 'https://thotismedia.com/remplacement-de-parcoursup-lecornu-sebastien-thotis/' },
      { label: 'L’Étudiant — le calendrier de Parcoursup 2027', url: 'https://www.letudiant.fr/etudes/parcoursup/on-connait-le-calendrier-de-parcoursup-2027.html' },
      { label: 'L’Étudiant — baromètre de satisfaction 2026', url: 'https://www.letudiant.fr/etudes/parcoursup/bilan-parcoursup-en-2026-moins-de-la-moitie-des-lyceens-ont-trouve-la-plateforme-transparente.html' }
    ]
  },
  {
    ...publication,
    slug: 'nombre-eleves-par-classe-lycee',
    title: 'Combien d’élèves par classe au lycée en 2026 ? Les vrais chiffres',
    metaTitle: 'Élèves par classe au lycée en 2026 : les vrais chiffres',
    description: '30,5 élèves en moyenne par classe au lycée général en 2026. Pourquoi c’est autant, ce que ça change en cours, et ce que prévoient les secondes à 28.',
    category: 'Vie au lycée',
    accent: '#0369a1',
    accentSoft: '#e0f2fe',
    cover: { value: '30,5', label: 'Élèves par classe en moyenne', detail: 'Lycée général et technologique · 2026', icon: 'ph-users-three' },
    videoTitle: 'L’actu décodée, le nombre d’élèves par classe',
    summary: 'À la rentrée 2026, une classe de lycée général et technologique compte en moyenne 30,5 élèves, contre 25,3 au collège et 18,7 au lycée professionnel. Aucun texte national ne fixe aujourd’hui de plafond pour les classes de lycée. Le gouvernement a annoncé fin octobre 2026 que les classes de seconde seraient limitées à 28 élèves, en deux temps, à partir de la rentrée 2027.',
    sections: [
      {
        id: 'moyennes',
        heading: 'Combien d’élèves y a-t-il en moyenne dans une classe ?',
        table: {
          caption: 'Nombre d’élèves par classe à la rentrée 2026',
          columns: ['Niveau', 'Élèves par classe en moyenne'],
          rows: [['Collège', '25,3'], ['Lycée général et technologique', '30,5'], ['Lycée professionnel', '18,7']]
        },
        paragraphs: [
          'C’est le lycée général et technologique qui a les classes les plus remplies. Au total, 2 261 550 élèves ont fait leur rentrée au lycée en septembre 2026, dont 667 200 en voie professionnelle.',
          'Ce qui surprend, c’est que la natalité baisse depuis plusieurs années. Mais cette baisse touche d’abord l’école primaire, où la moyenne descend autour de 21 élèves par classe. Au lycée, elle ne se fait pas encore sentir dans les effectifs.',
          'La moyenne cache aussi des écarts. Dans certains lycées, les classes dépassent 35 élèves : c’est ce que dénonçaient en février 2026 des élèves et des profs du lycée Fresnel à Caen, ou le conseil d’administration d’un lycée de Roissy-en-Brie pour ses terminales.'
        ],
        chart: {
          title: 'Des classes plus remplies au lycée général',
          unit: 'élèves',
          max: 40,
          rows: [{ label: 'Collège', value: 25.3 }, { label: 'Lycée général et technologique', value: 30.5 }, { label: 'Lycée professionnel', value: 18.7 }],
          note: 'Moyennes à la rentrée 2026, pas des plafonds. Échelle commune de 0 à 40 élèves. Sources : CIDJ et L’Étudiant.'
        }
      },
      {
        id: 'groupes',
        heading: '30 élèves dans la classe, mais combien en cours ?',
        paragraphs: [
          'C’est la nuance que les chiffres officiels rappellent : une partie des heures se fait en demi-groupe, en option ou en spécialité. Selon le service statistique du ministère (DEPP), un enseignant du second degré a en moyenne autour de 22 élèves devant lui pendant une heure de cours.',
          'Au lycée général et technologique, cela varie du simple au double selon la matière : environ 15 élèves en éducation musicale, plus de 30 en EPS. Les spécialités les plus demandées, comme les maths, font partie des groupes les plus chargés.',
          'Pour comprendre ton emploi du temps, distingue donc ta classe administrative du groupe présent à chaque cours. Une classe de 32 peut avoir un dédoublement dans une matière, puis se retrouver au complet dans une autre. Le nombre d’élèves par classe ne résume pas à lui seul toutes les conditions de travail.'
        ]
      },
      {
        id: 'plafond',
        heading: 'Y a-t-il un nombre maximum d’élèves par classe au lycée ?',
        paragraphs: [
          'Non, pas au niveau national. Le nombre de classes dépend des heures d’enseignement attribuées à chaque lycée par le rectorat. Quand un établissement perd des heures, il peut fermer une classe et répartir les élèves dans les autres, ce qui fait monter les effectifs.',
          'Une moyenne nationale de 30,5 n’est donc ni une règle à respecter partout ni un maximum autorisé. De la même façon, constater une classe à 35 ne permet pas de déduire l’effectif de toutes les autres classes du lycée.'
        ]
      },
      {
        id: 'secondes-a-28',
        heading: 'Qu’est-ce qui a été annoncé pour la suite ?',
        paragraphs: ['Les classes surchargées faisaient partie des revendications des lycéens mobilisés cet automne. Le 26 octobre 2026, le gouvernement a annoncé :'],
        bullets: [
          'Des secondes générales et technologiques à 28 élèves maximum : à la rentrée 2027 dans la moitié des lycées les moins favorisés, puis à la rentrée 2028 dans les autres.',
          'La même limite pour les secondes professionnelles qui dépassent ce seuil.',
          'En première et terminale, un objectif de réduction des groupes les plus chargés, notamment en maths de spécialité, sans date précise pour l’instant.',
          '500 postes de professeurs en plus pour accompagner la mesure.'
        ],
        conclusion: 'Attention à la date : cette annonce ne change pas immédiatement l’effectif de ta classe en 2026. Pour connaître son application dans un établissement précis, il faudra suivre les informations de la rentrée concernée.',
        links: [{ slug: 'blocus-lycee-legal-risques', label: 'Les revendications et les droits des lycéens pendant un blocus' }]
      }
    ],
    parents: 'Pour connaître la situation réelle du lycée de votre enfant, passez par les représentants des parents d’élèves. Les effectifs prévus pour la rentrée suivante sont présentés chaque année au conseil d’administration, généralement au début de l’année civile, lors de la répartition des heures. Demandez aussi quels cours sont dédoublés : cela aide à dépasser le seul chiffre affiché pour la classe.',
    faq: [
      { question: 'Combien d’élèves par classe en seconde ?', answer: 'En moyenne autour de 30 en seconde générale et technologique. La limite à 28 doit s’appliquer à partir de la rentrée 2027 dans la moitié des lycées, et en 2028 dans les autres.' },
      { question: 'Pourquoi les classes sont-elles plus chargées au lycée qu’au collège ?', answer: 'Le nombre de classes dépend des heures attribuées à chaque établissement. Au lycée général, ces heures sont aussi réparties entre de nombreuses spécialités et options.' },
      { question: 'Le lycée professionnel a-t-il moins d’élèves par classe ?', answer: 'Oui, 18,7 en moyenne à la rentrée 2026, notamment parce que les enseignements pratiques se font en petits groupes.' }
    ],
    related: ['blocus-lycee-legal-risques', 'parcoursup-2027-dates-nouveautes', 'prepa-cpge-c-est-quoi'],
    sources: [
      { label: 'CIDJ — rentrée 2026 : plus de 5,5 millions d’élèves reprennent le collège ou le lycée', url: 'https://www.cidj.com/s-orienter/rentree-2026-plus-de-5-5-millions-d-eleves-reprennent-le-college-ou-le-lycee' },
      { label: 'L’Étudiant — rentrée 2026 : les chiffres à retenir', url: 'https://www.letudiant.fr/lycee/rentree-2026-eleves-profs-classes-les-chiffres-a-retenir-au-college-et-au-lycee.html' },
      { label: 'DEPP — note d’information n° 26.38 sur le nombre d’élèves devant un enseignant (août 2026)', url: 'https://www.education.gouv.fr/depp/le-nombre-d-eleves-devant-un-enseignignant-dans-le-second-degre-la-rentree-2025-moins-d-eleves-dans-les-505404' },
      { label: 'Gouvernement — annonces du 26 octobre 2026', url: 'https://www.info.gouv.fr/actualite/parcoursup-classes-bourses-ce-qui-change-pour-les-lyceens-et-les-etudiants' },
      { label: 'Thotis — détail de la mesure des classes à 28', url: 'https://thotismedia.com/remplacement-de-parcoursup-lecornu-sebastien-thotis/' },
      { label: 'Ouest-France / académie de Normandie — lycée Fresnel de Caen (10 février 2026)', url: 'https://media.ac-normandie.fr/-/communication/revue-presse/2026/02/10/OF_14_cri_Caen_Lyc%e9e%20Fresnel%20%e0%20Caen.%20Une%20classe%20sur%20la%20sellette%20pour%20la%20rentr%e9e%202026,%20%e9l%e8ves%20et%20profs%20montent%20au%20cr%e9neau.pdf' }
    ]
  },
  {
    ...publication,
    slug: 'blocus-lycee-legal-risques',
    title: 'Blocus au lycée : c’est quoi, est-ce légal et qu’est-ce qu’on risque ?',
    metaTitle: 'Blocus au lycée : légal ou pas, et quels risques ?',
    description: 'Blocus au lycée : ce que c’est, ce que dit la loi, les sanctions possibles et ce qui s’est passé à l’automne 2026. Les faits, sans parti pris.',
    category: 'Vie au lycée',
    accent: '#be185d',
    accentSoft: '#fce7f3',
    cover: { value: 'Tes droits', label: 'S’informer avant d’agir', detail: 'Expression, mobilisation et sanctions', icon: 'ph-scales' },
    videoTitle: 'La vidéo d’Inès sur le blocus (3 novembre 2026)',
    summary: 'Un blocus, c’est quand des élèves bloquent l’entrée de leur lycée pour empêcher les cours. Les lycéens ont un droit d’expression et de réunion, mais il ne couvre pas le fait d’empêcher les cours : un blocus peut donc entraîner des sanctions disciplinaires. À l’automne 2026, un mouvement parti de Créteil a touché des centaines de lycées en France.',
    sections: [
      {
        id: 'definition',
        heading: 'C’est quoi, un blocus ?',
        paragraphs: [
          'Concrètement, des élèves bloquent les entrées du lycée pour que les cours ne puissent pas avoir lieu. Ce n’est ni une grève au sens du droit du travail, puisque les élèves ne sont pas des salariés, ni une manifestation dans la rue, même si les deux vont souvent ensemble.',
          'Il existe aussi des blocages filtrants, où l’accès est ralenti sans être totalement fermé. Dans tous les cas, il faut distinguer le fait d’exprimer une revendication du fait d’empêcher d’autres personnes d’entrer en cours.'
        ]
      },
      {
        id: 'mobilisation-2026',
        heading: 'Pourquoi tant de blocus à l’automne 2026 ?',
        paragraphs: [
          'Le mouvement est parti mi-septembre 2026 du lycée Saint-Exupéry de Créteil, dans le Val-de-Marne, puis s’est étendu à tout le pays. Les revendications les plus citées : professeurs absents et non remplacés, classes surchargées, locaux dégradés et pression de Parcoursup.'
        ],
        table: {
          caption: 'Mobilisations lycéennes : les chiffres et leur périmètre',
          columns: ['Repère', 'Chiffre'],
          rows: [
            ['Lycées touchés le 30 septembre 2026, blocages ou tentatives', '356, soit environ 1 sur 10'],
            ['Lycées totalement bloqués ce jour-là', '45'],
            ['Temps d’enseignement non assuré en 2024-2025, second degré public', '9,8 %'],
            ['Contributions à la consultation nationale des lycéens, du 6 au 23 octobre', 'Plus de 100 000']
          ]
        },
        chart: {
          title: 'Tous les lycées touchés n’étaient pas totalement bloqués',
          unit: 'lycées',
          max: 356,
          rows: [{ label: 'Blocages ou tentatives au total', value: 356 }, { label: 'Dont lycées totalement bloqués', value: 45 }],
          note: 'Situation au 30 septembre 2026. Les 45 lycées sont inclus dans le total de 356 : ces barres ne s’additionnent pas. Source : Planète Grandes Écoles, données ministérielles.'
        },
        conclusion: 'Le 26 octobre, le gouvernement a annoncé le remplacement de Parcoursup en 2028, des secondes limitées à 28 élèves et une pause déjeuner d’au moins une heure dès la rentrée 2027. Les organisations lycéennes ont jugé ces réponses insuffisantes et appelé à poursuivre la mobilisation.',
        links: [
          { slug: 'parcoursup-2027-dates-nouveautes', label: 'Ce qui change sur Parcoursup en 2027' },
          { slug: 'nombre-eleves-par-classe-lycee', label: 'Les chiffres des élèves par classe au lycée' }
        ]
      },
      {
        id: 'legalite',
        heading: 'Un blocus, est-ce légal ?',
        paragraphs: [
          'Le Code de l’éducation, article L. 511-2, reconnaît aux lycéens la liberté d’information et d’expression. Ils disposent aussi de droits de réunion et de publication. Mais ces droits s’exercent sans empêcher les cours ni troubler l’ordre dans l’établissement. Bloquer l’accès aux cours sort donc de ce cadre.',
          'Le Code pénal, article 431-22, punit d’un an de prison et 7 500 € d’amende le fait d’entrer ou de rester dans un établissement scolaire sans y être autorisé pour en troubler le fonctionnement. Selon l’analyse du Club des juristes relayée par Planète Grandes Écoles, ce texte n’a pas été appliqué à des lycéens pour un simple blocage.',
          'Il ne faut pas lire cette peine comme une sanction automatique pour toute participation. Les circonstances et les faits comptent. Les violences et les dégradations relèvent, elles, du droit pénal classique, comme ailleurs.'
        ]
      },
      {
        id: 'risques',
        heading: 'Qu’est-ce qu’on risque concrètement ?',
        bullets: [
          'Des sanctions disciplinaires : avertissement, blâme, mesure de responsabilisation, exclusion temporaire de huit jours maximum ou exclusion définitive. Cette dernière ne peut être décidée que par un conseil de discipline. Toute sanction doit être écrite et proportionnée aux faits.',
          'Des absences relevées, ainsi que des cours ou des devoirs à rattraper.',
          'Des risques physiques quand la situation dégénère. Le 30 septembre, les autorités ont recensé 625 interpellations au niveau national ; une interpellation n’est pas une condamnation.'
        ],
        conclusion: 'Pour faire entendre ta voix dans le cadre prévu, tu peux passer par les délégués de classe, le conseil de la vie lycéenne (CVL), le conseil d’administration ou les consultations ouvertes aux lycéens. Si une situation te met en danger, éloigne-toi et préviens un adulte de confiance.'
      }
    ],
    parents: 'Avec un enfant mineur, prenez le temps de discuter de sa sécurité et des conséquences possibles. Plutôt que d’interdire ou d’encourager sans échange, demandez-lui pourquoi il veut participer et comment il compte rester joignable. Le règlement intérieur et l’équipe du lycée sont les bons interlocuteurs pour les questions propres à l’établissement.',
    faq: [
      { question: 'Peut-on être exclu pour avoir participé à un blocus ?', answer: 'C’est possible, mais l’exclusion définitive exige un conseil de discipline et doit rester proportionnée aux faits.' },
      { question: 'Le lycée peut-il fermer à cause d’un blocus ?', answer: 'Oui, une fermeture temporaire ou une adaptation des cours peut être décidée pour la sécurité de tous. Suis les consignes officielles de ton établissement.' },
      { question: 'Les blocus sont-ils plus fréquents qu’avant ?', answer: 'Les mobilisations lycéennes reviennent régulièrement en France. Celle de l’automne 2026 a été l’une des plus larges de ces dernières années.' }
    ],
    related: ['nombre-eleves-par-classe-lycee', 'parcoursup-2027-dates-nouveautes'],
    sources: [
      { label: 'Légifrance — Code de l’éducation, article L. 511-2 (rechercher la référence)', url: 'https://www.legifrance.gouv.fr' },
      { label: 'Légifrance — Code pénal, article 431-22 (rechercher la référence)', url: 'https://www.legifrance.gouv.fr' },
      { label: 'Planète Grandes Écoles — ampleur, revendications et état du mouvement en 2026 ; analyse du Club des juristes', url: 'https://planetegrandesecoles.com/blocus-lycees/' },
      { label: 'Thotis — consultation des lycéens et mesures du 26 octobre 2026', url: 'https://thotismedia.com/remplacement-de-parcoursup-lecornu-sebastien-thotis/' },
      { label: 'Franceinfo — fin de Parcoursup annoncée pour 2028 et réactions des lycéens', url: 'https://www.franceinfo.fr/societe/education/parcoursup/parcoursup/parcoursup-la-fin-de-la-plateforme-annoncee-pour-2028-les-lyceens-reclament-des-mesures-concretes_8255458.html' },
      { label: 'Znaki — chronologie du mouvement', url: 'https://znaki.fm/fr/events/blocus-des-lycees/' }
    ]
  },
  {
    ...publication,
    slug: 'prepa-cpge-c-est-quoi',
    title: 'Prépa (CPGE) : c’est quoi, pour qui, et est-ce vraiment l’enfer ?',
    metaTitle: 'Prépa (CPGE) : c’est quoi, pour qui, et c’est dur ?',
    description: 'Classe prépa : comment ça marche, les filières, qui est admis via Parcoursup et ce qu’on y vit vraiment. Tout ce qu’il faut savoir avant de choisir.',
    category: 'Études supérieures',
    accent: '#047857',
    accentSoft: '#d1fae5',
    cover: { value: '2 ans', label: 'Pour préparer les concours', detail: 'La prépa, sans les idées reçues', icon: 'ph-graduation-cap' },
    videoTitle: 'Zéro bullshit, la prépa de Gaspard',
    summary: 'Une classe préparatoire aux grandes écoles (CPGE), ce sont deux années d’études après le bac, dans un lycée, pour préparer les concours des écoles d’ingénieurs, de commerce ou des écoles normales supérieures. On y entre sur dossier via Parcoursup. 87 100 étudiants étaient en prépa à la rentrée 2025. C’est exigeant, mais pas réservé à une élite de génies.',
    sections: [
      {
        id: 'filieres',
        heading: 'C’est quoi, une prépa ?',
        paragraphs: ['C’est une formation de deux ans, installée dans un lycée, avec un suivi régulier et des profs très présents. À la fin de la deuxième année, tu passes des concours pour intégrer une grande école. Il y a trois grandes familles :'],
        bullets: [
          'Scientifique : MPSI, PCSI, PTSI, MP2I, BCPST… pour les écoles d’ingénieurs, vétérinaires ou d’agronomie.',
          'Économique et commerciale : ECG pour le bac général et ECT pour le bac technologique, vers les écoles de commerce.',
          'Littéraire : hypokhâgne puis khâgne, vers les écoles normales supérieures, certaines écoles de commerce ou de journalisme, ou l’université.'
        ],
        conclusion: 'Il existe aussi des prépas pour les bacheliers technologiques, comme la TSI côté sciences. Le bon point de départ n’est pas le prestige d’un lycée : regarde d’abord les matières que tu as envie de travailler au quotidien.'
      },
      {
        id: 'effectifs',
        heading: 'Combien d’étudiants vont en prépa ?',
        table: {
          caption: 'Les effectifs en CPGE à la rentrée 2025',
          columns: ['Repère', 'Chiffre'],
          rows: [
            ['Étudiants en CPGE', '87 100'],
            ['Évolution en première année', '−2,8 %'],
            ['Évolution en deuxième année', '+3,2 %'],
            ['Évolution en filière scientifique', '+1,5 %'],
            ['Évolution en filières économique et littéraire', '−1,2 % et −3,4 %']
          ]
        },
        paragraphs: ['Après une forte hausse en 2024, les effectifs sont stables. La filière scientifique continue de grossir, quand les filières économique et littéraire reculent un peu. Ces évolutions décrivent des effectifs, pas les chances de réussite aux concours.'],
        chart: {
          title: 'Les effectifs n’évoluent pas pareil selon la filière',
          unit: '%',
          max: 4,
          diverging: true,
          rows: [{ label: 'Scientifique', value: 1.5 }, { label: 'Économique et commerciale', value: -1.2 }, { label: 'Littéraire', value: -3.4 }],
          note: 'Évolution à la rentrée 2025 par rapport à 2024. Le centre représente 0 %, l’échelle va de −4 à +4 %. Source : SIES, note flash 2026-02.'
        }
      },
      {
        id: 'admission',
        heading: 'Qui est admis en prépa ?',
        paragraphs: [
          'L’admission se fait sur dossier via Parcoursup : notes de première et de terminale, spécialités suivies et fiche Avenir, où tes profs donnent leur avis sur ta capacité à réussir. Contrairement à la licence, il n’y a pas de secteur géographique : tu peux candidater dans toute la France.',
          'Chaque prépa a son taux d’accès sur sa fiche Parcoursup. Certaines sont très sélectives ; beaucoup accueillent des profils solides et motivés sans exiger une moyenne de 18. En prépa publique, il n’y a pas de frais de scolarité, même si l’inscription dans une université partenaire est obligatoire.',
          'Compare plusieurs établissements et pense aux aspects pratiques : trajet, internat, budget et possibilité de rentrer chez toi. Une formation adaptée à ton rythme vaut mieux qu’un choix fait uniquement pour son classement.'
        ],
        links: [{ slug: 'parcoursup-2027-dates-nouveautes', label: 'Les dates pour candidater sur Parcoursup en 2027' }]
      },
      {
        id: 'rythme',
        heading: 'Est-ce que c’est vraiment l’enfer ?',
        paragraphs: [
          'Le rythme est intense : beaucoup d’heures de cours, des devoirs surveillés réguliers et des colles, des interrogations orales en petit groupe chaque semaine. Il faut aimer travailler régulièrement.',
          'Mais la prépa, c’est aussi un encadrement rare dans le supérieur : des profs qui te connaissent, une classe soudée, souvent un internat. Beaucoup d’anciens racontent surtout avoir appris à s’organiser.',
          'Aux portes ouvertes, demande aux étudiants comment se passe une semaine ordinaire, pas seulement la semaine des concours. Le sommeil, les temps de trajet et l’entraide font aussi partie de ton choix.'
        ]
      },
      {
        id: 'passerelles',
        heading: 'Et si ça ne marche pas ?',
        paragraphs: [
          'La prépa n’est pas un quitte ou double. Si tu ne décroches pas l’école visée, tu peux refaire une deuxième année, sous réserve d’acceptation : on parle notamment de 5/2 en sciences ou de cubes.',
          'Tu peux aussi rejoindre l’université. Les années de prépa permettent de valider des crédits pour entrer en deuxième ou troisième année de licence, selon les validations et conventions. Des écoles recrutent après un bac+2 ou un bac+3. Renseigne-toi sur les passerelles avant d’en avoir besoin.'
        ]
      }
    ],
    parents: 'La question n’est pas « mon enfant est-il assez brillant ? », mais « a-t-il envie de deux ans de travail intense et cadré ? ». Les journées portes ouvertes, généralement entre janvier et mars, permettent d’échanger directement avec les étudiants et de parler des conditions concrètes de vie.',
    faq: [
      { question: 'Peut-on entrer en prépa avec un bac technologique ?', answer: 'Oui, des filières sont faites pour cela, comme ECT pour le commerce ou TSI pour les sciences.' },
      { question: 'La prépa est-elle payante ?', answer: 'Pas en lycée public. Il faut prévoir les droits d’inscription dans l’université partenaire, sous réserve des exonérations applicables.' },
      { question: 'Peut-on quitter la prépa en cours de route ?', answer: 'Oui. Les crédits validés et les conventions avec les universités permettent d’envisager une poursuite en licence ou une réorientation. L’admission dépend du dossier et de la formation visée.' }
    ],
    related: ['parcoursup-2027-dates-nouveautes', 'bac-5-premier-emploi-insertion', 'choisir-ses-etudes-sans-pression'],
    sources: [
      { label: 'SIES — note flash n° 2026-02 : effectifs en CPGE à la rentrée 2025-2026 (février 2026)', url: 'https://www.enseignementsup-recherche.gouv.fr/fr/les-effectifs-en-classes-preparatoires-aux-grandes-ecoles-la-rentree-2025-2026-100950' },
      { label: 'SIES — effectifs en CPGE à la rentrée 2024-2025', url: 'https://www.enseignementsup-recherche.gouv.fr/fr/les-effectifs-en-classes-preparatoires-aux-grandes-ecoles-la-rentree-2024-2025-98530' },
      { label: 'Onisep — les classes préparatoires aux grandes écoles', url: 'https://www.onisep.fr' },
      { label: 'Parcoursup — fiches formations et taux d’accès', url: 'https://www.parcoursup.gouv.fr' }
    ]
  },
  {
    ...publication,
    slug: 'bac-5-premier-emploi-insertion',
    title: 'Bac+5 et premier emploi : pourquoi ça coince, et comment rebondir',
    metaTitle: 'Bac+5 et premier emploi : pourquoi ça coince en 2026',
    description: '72 % des bac+5 en emploi un an après, 1 sur 4 dans un job alimentaire : ce que disent les chiffres de l’Apec, et les options pour rebondir.',
    category: 'Premier emploi',
    accent: '#c2410c',
    accentSoft: '#ffedd5',
    cover: { value: '72 %', label: 'En emploi salarié après un an', detail: 'Bac+5 · promotion 2023 · Apec', icon: 'ph-briefcase' },
    videoTitle: 'Ça m’est arrivé, Bac+5 de socio et caissière',
    summary: 'Un an après leur diplôme, 72 % des jeunes diplômés d’un bac+5 de la promotion 2023 avaient un emploi salarié, deux points de moins que la promotion précédente. Parmi les diplômés en emploi, 24 % qualifient leur poste d’alimentaire. Le bac+5 reste un atout face au chômage des jeunes, mais l’insertion est plus lente qu’avant. Changer de voie n’est pas un échec.',
    sections: [
      {
        id: 'emploi-bac-5',
        heading: 'Un bac+5, ça protège encore du chômage ?',
        paragraphs: [
          'Oui. En France, le chômage des jeunes est nettement plus élevé que celui du reste de la population, et il frappe d’abord les moins diplômés. Les bac+5 restent mieux armés. Mais mieux armé ne veut plus dire embauché tout de suite.',
          'Pour comprendre l’insertion des jeunes diplômés bac+5, il faut regarder la promotion étudiée et la définition de l’emploi. Les données ci-dessous portent sur l’emploi salarié douze mois après le diplôme, pas sur tous les diplômés de 2026.'
        ],
        table: {
          caption: 'Insertion des bac+5 : repères Apec publiés en novembre 2025',
          columns: ['Repère', 'Chiffre'],
          rows: [
            ['Bac+5 en emploi salarié à douze mois, promotion 2023', '72 %'],
            ['Évolution par rapport à la promotion précédente', '−2 points'],
            ['Parmi les diplômés en emploi, part qui juge son poste alimentaire', '24 % (+7 points)'],
            ['Diplômés en lettres, langues et arts en emploi salarié', '59 %']
          ]
        },
        chart: {
          title: 'À diplôme égal, l’insertion dépend aussi de la discipline',
          unit: '%',
          max: 100,
          rows: [{ label: 'Bac+5, toutes disciplines', value: 72 }, { label: 'Dont lettres, langues et arts', value: 59 }],
          note: 'Part en emploi salarié douze mois après le diplôme, promotion 2023. Les lettres, langues et arts sont un sous-ensemble des bac+5. Source : Apec, novembre 2025.'
        }
      },
      {
        id: 'contexte',
        heading: 'Pourquoi c’est plus difficile en ce moment ?',
        paragraphs: [
          'Deux raisons principales ressortent des études. Le marché de l’emploi cadre s’est contracté : les entreprises ont moins recruté de cadres en 2024, et l’Apec a constaté un nouveau ralentissement de l’insertion des bac+5 en 2025. Les profils sans expérience sont les premiers touchés.',
          'Il y a aussi beaucoup plus de diplômés. Le nombre de nouveaux bac+5 a presque doublé en moins de vingt ans, passant d’environ 98 000 à 180 000 entre 2006 et 2023. Plus de candidats arrivent sur un marché dont les débouchés n’augmentent pas forcément au même rythme.',
          'Cela ne veut pas dire que ton diplôme ne vaut rien. Cela invite plutôt à examiner les débouchés précis d’une formation, les expériences déjà acquises et les besoins des employeurs, au lieu de compter seulement sur le niveau bac+5.'
        ]
      },
      {
        id: 'job-alimentaire',
        heading: 'Un job alimentaire après un master, c’est un échec ?',
        paragraphs: [
          'Non, c’est souvent une étape. Près d’un diplômé en emploi sur quatre est dans ce cas, et la proportion a augmenté. Cela permet de payer son loyer, de prendre de l’expérience et de chercher mieux en parallèle. Le risque, c’est d’y rester par défaut sans avoir de plan pour en sortir.',
          'Tu peux te fixer des étapes réalistes : identifier les postes visés, faire relire ton CV, rencontrer des professionnels et réserver un créneau régulier à tes candidatures. Décris aussi ce que ton poste actuel t’apprend, sans le présenter comme une faute de parcours.'
        ]
      },
      {
        id: 'reorientation',
        heading: 'Se réorienter ou se reconvertir : c’est fréquent ?',
        paragraphs: ['Oui. Près d’un étudiant sur cinq change de voie après sa première année dans le supérieur, selon une analyse des données Parcoursup de 2018 à 2023. La première année sert de plus en plus à tester. Plusieurs leviers existent :'],
        bullets: [
          'Après le bac ou une L1 : repasser par Parcoursup ou viser une rentrée décalée dans certaines formations. Dès 2027, une information sur la réorientation dès le premier semestre est annoncée.',
          'Après un bac+3 ou un bac+5 : examiner l’alternance, une formation courte spécialisée ou l’accompagnement gratuit de l’Apec Objectif Premier Emploi, ouvert dès bac+3.',
          'Avant de choisir : utiliser Quel job avec mon diplôme ? de l’Apec pour comparer les taux d’emploi par discipline.'
        ],
        conclusion: 'Avant de financer une nouvelle formation, vérifie le diplôme délivré, son coût, ses débouchés et ce qu’elle ajoute réellement à ton parcours. Repartir pour étudier n’est pas automatiquement la meilleure réponse : un accompagnement peut aussi aider à cibler autrement ta recherche.',
        links: [{ slug: 'parcoursup-2027-dates-nouveautes', label: 'Préparer une réorientation avec Parcoursup 2027' }]
      }
    ],
    parents: 'Les études longues restent un atout, mais la discipline et la voie suivie, avec ou sans alternance, comptent. Regardez les taux d’insertion affichés par les formations et les universités dès la terminale. Si l’emploi tarde, aidez à construire un plan sans transformer chaque discussion familiale en bilan de candidatures.',
    faq: [
      { question: 'Combien de temps faut-il pour trouver un emploi après un bac+5 ?', answer: 'Environ 7 sur 10 ont un emploi salarié un an après le diplôme, selon l’Apec pour la promotion 2023. Ce taux ne donne pas une durée individuelle de recherche, qui varie selon les parcours.' },
      { question: 'Quelles disciplines s’insèrent le moins bien ?', answer: 'Dans les chiffres cités de l’Apec, les diplômés en lettres, langues et arts affichent 59 % en emploi salarié un an après le diplôme.' },
      { question: 'L’alternance aide-t-elle à trouver un premier emploi ?', answer: 'Elle permet d’arriver sur le marché avec de l’expérience, ce qui compte quand les entreprises recrutent moins de débutants. Elle ne garantit pas une embauche.' }
    ],
    related: ['prepa-cpge-c-est-quoi', 'parcoursup-2027-dates-nouveautes', 'metier-bien-fait-pour-soi-mode-emploi'],
    sources: [
      { label: 'Apec — jeunes diplômés bac+5 : une insertion plus difficile (novembre 2025)', url: 'https://www.banquedesterritoires.fr/sites/default/files/2025-11/Apec-Jeunes-diplom%C3%A9s-Bac%2B5-une-insertion-plus-difficile.pdf' },
      { label: 'Apec — une insertion professionnelle plus difficile (juillet 2026)', url: 'https://www.apec.fr/tendances-emploi-cadre/recrutement-et-pratiques-rh/une-insertion-professionnelle-plus-difficile-pour-les-jeunes-diplomes-au-prix-de-concessions-importantes-.html' },
      { label: 'Apec — baromètre du premier trimestre 2026', url: 'https://corporate.apec.fr/files/live/sites/corporate/files/Nos%20etudes/PDF/Barometre%20Apec%20T1%202026.pdf' },
      { label: 'CIDJ — diplômés bac+5 : quand l’emploi se fait attendre (décembre 2025)', url: 'https://www.cidj.com/travailler/decrocher-un-emploi/diplomes-bac-5-quand-l-emploi-se-fait-attendre' },
      { label: 'Futura / The Conversation — un étudiant sur cinq change de voie après le bac (juillet 2025)', url: 'https://www.futura-sciences.com/formation/actualites/examens-diplomes-etudiant-cinq-change-voie-apres-bac-signe-ouverture-symptome-malaise-123569/' },
      { label: 'Apec — outil Quel job avec mon diplôme ?', url: 'https://www.apec.fr/tous-nos-outils/fiche-outils/quel-job-avec-mon-diplome.html' }
    ]
  }
]
