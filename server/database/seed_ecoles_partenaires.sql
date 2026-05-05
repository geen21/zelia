-- Seed data: MyDigitalSchool formations (340 rows)
-- 17 cities × 20 formations per city
-- Run AFTER migration_ecoles_partenaires.sql (table must exist)

-- Clear existing data (only if tables exist)
DO $clear$
BEGIN
  IF to_regclass('public.contact_submitted') IS NOT NULL THEN
    EXECUTE 'DELETE FROM contact_submitted';
  END IF;
  IF to_regclass('public.ecoles_partenaires') IS NOT NULL THEN
    EXECUTE 'DELETE FROM ecoles_partenaires';
  END IF;
END $clear$;

DO $$
DECLARE
  cities TEXT[] := ARRAY[
    'Angers', 'Annecy', 'Bordeaux', 'Caen', 'Grenoble',
    'Lille', 'Lyon', 'Melun', 'Montpellier', 'Nancy',
    'Nantes', 'Nice', 'Paris', 'Rennes', 'St-Quentin-en-Yvelines',
    'Toulouse', 'Vannes'
  ];
  formations JSONB := '[
    {
      "name": "Bachelor Digital Design",
      "level": "Bac+2",
      "info": "Pré-requis: Bac, Alt. possible",
      "description": "Pendant tes deux premières années d''études en tronc commun, tu découvres l''écosystème digital et développes un socle solide de compétences en design graphique, UX/UI, langages web, culture digitale et gestion de projet. Tu suis également des cours généralistes en lien avec le numérique : langues étrangères, économie, expression orale & écrite, développement de tes soft skills. Objectif : te préparer à la spécialité de ton choix en 3ème année. En Bachelor 1 tu te familiarises avec le maquettage, les outils de production graphique web et print, la photo & vidéo, les bases du marketing, l''intégration web, WordPress et le dev front, avec la semaine «Digital Sans Frontières». En Bachelor 2 tu approfondis l''ergonomie web, le motion design, la typographie, l''intégration WordPress, le développement front, le marketing digital, le SEO, la rédaction web et la stratégie de communication, avec création de portfolio et podcast. Formation accessible en initial (statut étudiant) avec 8 semaines de stage minimum en B1, ou en alternance en B2."
    },
    {"name": "Bachelor Informatique",
     "level": "Bac+2",
     "info": "Pré-requis: Bac, Alt. possible",
     "description": "Le technicien informatique intervient sur l''ensemble du cycle de vie des projets numériques : développement, intégration, administration et maintenance des systèmes. En deux ans de tronc commun, tu construis un socle technique solide en algorithmie, programmation orientée objet, bases de données, réseaux et systèmes d''exploitation. Objectif : acquérir les fondamentaux pour choisir ta spécialisation en 3ème année. En Bachelor 1 tu découvres les langages de programmation (Python, JavaScript, Java), les architectures logicielles, l''administration Linux/Windows et les bases des réseaux TCP/IP. En Bachelor 2 tu approfondis le développement applicatif, la sécurité des systèmes, la gestion de bases de données relationnelles et NoSQL, et tu réalises un projet technique en équipe. Formation accessible en initial avec 8 semaines de stage minimum en B1, ou en alternance en B2. Débouchés : Technicien systèmes et réseaux, Développeur junior, Administrateur bases de données."
    },
    {"name": "Bachelor Marketing Digital",
     "level": "Bac+2",
     "info": "Pré-requis: Bac, Alt. possible",
     "description": "Le chargé de marketing digital pilote la présence en ligne d''une marque et optimise ses performances sur tous les canaux numériques. En deux ans de tronc commun, tu develops une culture digitale complète et des compétences opérationnelles immédiatement valorisables. Objectif : maîtriser les leviers du marketing digital pour créer de la croissance en ligne. En Bachelor 1 tu découvres les fondamentaux du marketing, des réseaux sociaux, du SEO, de la création de contenus et des outils d''analyse (Google Analytics, Meta Ads). En Bachelor 2 tu approfondis l''email marketing, la stratégie de content marketing, le SEA, l''influence marketing et tu réalises une stratégie digitale complète pour un client réel. Formation accessible en initial avec 8 semaines de stage minimum en B1, ou en alternance en B2. Débouchés : Chargé de marketing digital, Community manager, Chargé de référencement, Traffic manager."
    },
    {"name": "BTS SIO",
     "level": "Bac+2",
     "info": "Pré-requis: Bac, Alt. possible",
     "description": "Le Brevet de Technicien Supérieur Services Informatiques aux Organisations forme des techniciens opérationnels capables d''intervenir sur les systèmes d''information des entreprises. Deux options sont disponibles selon ton profil : SLAM (Solutions Logicielles et Applications Métiers) orientée développement, ou SISR (Solutions d''Infrastructure, Systèmes et Réseaux) orientée administration systèmes et réseaux. Objectif : obtenir un diplôme d''État reconnu qui t''ouvre les portes du marché du travail ou d''une poursuite d''études en Bachelor. Compétences développées : développement d''applications, gestion de bases de données, administration de serveurs, sécurisation des réseaux, support utilisateurs, documentation technique. La formation alterne périodes en école et en entreprise. Débouchés : Développeur d''applications, Technicien systèmes et réseaux, Administrateur bases de données, Support informatique. Certification : Diplôme d''État de niveau 5 (BTS SIO). Poursuite possible en Bachelor en 3ème année."
    },
    {"name": "Bachelor Chargé d''Affaires Web",
     "level": "Bac+3",
     "info": "Pré-requis: Bac+2, Alt. majoritaire",
     "description": "Le chargé d''affaires web est l''interface entre les clients et les équipes techniques et créatives d''une agence ou d''un département digital. Il détecte les opportunités commerciales, élabore des propositions adaptées aux besoins clients et pilote la relation tout au long des projets numériques. Objectif : devenir un expert capable de développer un portefeuille clients dans l''univers digital tout en maîtrisant les enjeux techniques et créatifs des projets web. Compétences développées : prospection et développement commercial, élaboration d''offres et de devis, négociation et closing, suivi de la satisfaction client, coordination avec les équipes de production, reporting et analyse des performances commerciales. La formation se déroule majoritairement en alternance, te permettant d''appliquer directement tes apprentissages en entreprise. Débouchés : Chargé d''affaires web, Account manager, Business developer digital, Responsable commercial digital."
    },
    {"name": "Bachelor Chef de Projet Digital",
     "level": "Bac+3",
     "info": "Pré-requis: Bac+2, Alt. majoritaire",
     "description": "Le chef de projet digital orchestre la conception et la livraison de projets numériques en coordonnant des équipes pluridisciplinaires (développeurs, designers, marketeurs) dans les délais et budgets impartis. Objectif : acquérir les compétences managériales et techniques pour piloter des projets web et digitaux de A à Z. Compétences développées : gestion de projet en méthodes Agile et Scrum, rédaction de cahiers des charges, planification et suivi budgétaire, coordination d''équipes, gestion des risques, recette et livraison, communication client. Tu travailles sur des projets concrets en entreprise grâce à l''alternance qui rythme cette 3ème année. Des workshops pratiques te permettent de simuler des situations de crise et de prendre des décisions sous pression. Débouchés : Chef de projet digital, Product owner, Responsable de projet web, Coordinateur digital. Poursuite possible en MBA Management de Projet Digital."
    },
    {
      "name": "Bachelor Création Numérique",
      "level": "Bac+3",
      "info": "Pré-requis: Bac+2, Alt. majoritaire",
      "description": "Le Designer graphique réalise la production graphique et visuelle de tous types de supports de communication : interfaces web et mobiles, supports print, bannières et encarts web, spots publicitaires en vidéo ou motion design. Il s''appuie sur un brief client pour concevoir des identités visuelles en phase avec les valeurs et la philosophie des marques, produits ou services qu''il met en avant à travers ses créations. Objectif : devenir un expert capable de concevoir des supports visuels innovants en mettant ta créativité au service des valeurs portées par la marque. Compétences développées : analyse de la demande du commanditaire, définition de la stratégie de projet de création graphique, réalisation et livraison du projet, conception d''identité visuelle, design graphique web et print, motion design, vidéo, design interactif, ainsi que l''application du marketing au design. Deux workshops rythment l''année : «Typographie» à la rentrée et «Identité graphique» au semestre 2, avec la réalisation d''un premier portfolio professionnel. Débouchés : Graphiste web, UI Designer, Designer interactif, Motion designer, Concepteur multimédia. Certification professionnelle de niveau 6 «Designer graphique» (RNCP37817). Poursuites possibles : MBA Direction Artistique Digitale, MBA Expert UX/UI Design, MBA Management de Projet Digital. Formation certifiante accessible en initial (statut étudiant) ou en alternance (1 semaine école / 2 semaines entreprise)."
    },
    {"name": "Bachelor Cyber & Réseau",
     "level": "Bac+3",
     "info": "Pré-requis: Bac+2, Alt. majoritaire",
     "description": "Face à l''explosion des cybermenaces, le technicien cyber et réseau est devenu un acteur indispensable de la sécurité informatique des organisations. Il conçoit, déploie et sécurise les infrastructures réseau, détecte les intrusions et met en place les contre-mesures adaptées. Objectif : maîtriser les fondamentaux de la cybersécurité et de l''administration réseau pour protéger les systèmes d''information. Compétences développées : architecture et administration de réseaux (LAN, WAN, VPN), sécurisation des systèmes (Linux, Windows Server), cryptographie, tests d''intrusion, gestion des pare-feux et des IDS/IPS, conformité RGPD et normes ISO 27001, réponse aux incidents de sécurité. La formation alterne cours théoriques et mises en situation pratiques sur des environnements virtualisés. Débouchés : Administrateur réseaux et systèmes, Technicien cybersécurité, Analyste SOC, Consultant sécurité junior. Poursuite possible en MBA Cyber & Réseau."
    },
    {"name": "Bachelor Data Analyst & IA",
     "level": "Bac+3",
     "info": "Pré-requis: Bac+2, Alt. majoritaire",
     "description": "Le data analyst collecte, nettoie et analyse des données massives pour en extraire des insights stratégiques qui guident les décisions business. Avec l''essor de l''intelligence artificielle, il intègre également des modèles prédictifs dans ses analyses. Objectif : devenir un expert de la donnée capable de transformer des volumes importants d''informations brutes en valeur ajoutée pour l''entreprise. Compétences développées : manipulation de données en Python et SQL, visualisation avec Power BI et Tableau, statistiques appliquées, machine learning supervisé et non supervisé, traitement du langage naturel (NLP), ETL et datawarehousing, communication des résultats aux équipes métier. Tu réalises des projets d''analyse sur des jeux de données réels en entreprise grâce à l''alternance. Débouchés : Data analyst, Business intelligence analyst, Data scientist junior, Chargé de reporting. Poursuite possible en MBA Big Data & IA."
    },
    {"name": "Bachelor Développeur Web",
     "level": "Bac+3",
     "info": "Pré-requis: Bac+2, Alt. majoritaire",
     "description": "Le développeur web conçoit et réalise des sites et applications web en maîtrisant à la fois les technologies front-end (interface utilisateur) et back-end (serveur, bases de données). Il transforme des maquettes en expériences numériques fonctionnelles et performantes. Objectif : devenir un développeur polyvalent capable de prendre en charge un projet web de la conception technique à la mise en production. Compétences développées : HTML, CSS, JavaScript et frameworks modernes (React, Vue.js), développement back-end (Node.js, PHP, Python), gestion de bases de données (MySQL, PostgreSQL, MongoDB), intégration d''APIs RESTful, versioning avec Git, déploiement cloud et bonnes pratiques de sécurité web. Tu développes des projets concrets en équipe tout au long de l''année, avec une immersion en entreprise via l''alternance. Débouchés : Développeur web front-end, Développeur web back-end, Développeur full-stack junior, Intégrateur web. Poursuite possible en MBA Développeur Full-Stack."
    },
    {"name": "Bachelor UX/UI Design",
     "level": "Bac+3",
     "info": "Pré-requis: Bac+2, Alt. majoritaire",
     "description": "Le designer UX/UI place l''utilisateur au cœur de la conception d''interfaces digitales. Il mène des recherches utilisateurs pour comprendre les besoins, conçoit des parcours fluides et intuitifs, et crée des interfaces visuellement cohérentes et attractives. Objectif : maîtriser l''ensemble du processus de design centré utilisateur pour concevoir des produits numériques qui engagent et fidélisent. Compétences développées : recherche utilisateur (interviews, tests d''utilisabilité), cartographie des parcours (user journey, wireframes), prototypage interactif avec Figma, conception de design systems, principes d''accessibilité, UI design et typographie, collaboration avec les développeurs en méthode Agile. Un workshop «Design Sprint» en semestre 2 te permet de résoudre un challenge de design en 5 jours pour le compte d''un client réel. Débouchés : UX Designer, UI Designer, Product designer, Webdesigner. Poursuite possible en MBA Lead UX/UI Designer."
    },
    {"name": "Bachelor Webmarketing",
     "level": "Bac+3",
     "info": "Pré-requis: Bac+2, Alt. majoritaire",
     "description": "Le chargé de webmarketing pilote la stratégie digitale d''une organisation pour générer du trafic qualifié, convertir les visiteurs en clients et fidéliser la communauté. Il maîtrise l''ensemble des leviers du marketing en ligne et sait mesurer précisément le retour sur investissement de chaque action. Objectif : devenir un expert opérationnel du marketing digital capable de construire et d''animer une présence en ligne performante. Compétences développées : stratégie de contenu, SEO technique et éditorial, campagnes SEA (Google Ads, Meta Ads), email marketing et marketing automation, social media management, affiliation et influence marketing, analyse des performances (Google Analytics 4, Data Studio), A/B testing et optimisation des conversions. La formation se déroule en alternance pour une mise en pratique immédiate. Débouchés : Chargé de webmarketing, Traffic manager, Growth hacker, Responsable acquisition digitale. Poursuite possible en MBA Expert Marketing Digital."
    },
    {"name": "MBA Big Data & IA",
     "level": "Bac+5",
     "info": "Pré-requis: Bac+3, Alternance",
     "description": "Le manager Big Data & IA conçoit et pilote des solutions data avancées pour extraire de la valeur des données massives et déployer des modèles d''intelligence artificielle au service de la stratégie d''entreprise. Objectif : devenir un expert capable de diriger des projets data complexes et de positionner la donnée comme avantage concurrentiel. Compétences développées : architecture de plateformes Big Data (Hadoop, Spark, Kafka), machine learning avancé et deep learning (TensorFlow, PyTorch), MLOps et déploiement de modèles en production, gouvernance et éthique des données, IA générative, cloud data (AWS, GCP, Azure), management d''équipes data et conduite du changement. Options filière : IA & Automatisation, Data Engineering, Science des données appliquée. MyDigitalStartUp te permet de co-fonder un projet entrepreneurial data during ta formation. Débouchés : Data scientist, Data engineer, Chief Data Officer, Consultant IA. Formation certifiante accessible en alternance (1 semaine école / 2 semaines entreprise)."
    },
    {"name": "MBA Cyber & Réseau",
     "level": "Bac+5",
     "info": "Pré-requis: Bac+3, Alternance",
     "description": "Le manager cybersécurité et réseaux définit et met en œuvre la politique de sécurité informatique d''une organisation, anticipe les menaces, pilote la réponse aux incidents et garantit la résilience des infrastructures critiques. Objectif : devenir un expert capable d''assumer le rôle de RSSI ou de responsable sécurité dans tout type d''organisation. Compétences développées : gouvernance de la sécurité (ISO 27001, NIST, EBIOS), pentest et ethical hacking, forensique numérique et réponse à incidents (SOC, CERT), sécurité cloud et zero trust, cryptographie avancée, conformité RGPD et NIS2, management d''équipes sécurité, audit et conseil en cybersécurité. Options filière : Sécurité offensive, Sécurité défensive, Audit & Conformité. Des challenges CTF (Capture The Flag) et des simulations d''incidents ponctuent la formation pour t''entraîner en conditions réelles. Débouchés : RSSI, Responsable SOC, Consultant cybersécurité, Architecte sécurité. Formation certifiante accessible en alternance (1 semaine école / 2 semaines entreprise)."
    },
    {"name": "MBA Développeur Full-Stack",
     "level": "Bac+5",
     "info": "Pré-requis: Bac+3, Alternance",
     "description": "Le développeur full-stack expert maîtrise l''intégralité de la chaîne de développement d''une application web ou mobile, de l''architecture technique à la mise en production, en passant par l''expérience utilisateur. Objectif : devenir un développeur senior capable de concevoir des architectures logicielles robustes et de diriger des équipes techniques. Compétences développées : architectures microservices et API-first, frameworks modernes front-end (React, Next.js, Vue) et back-end (Node.js, Python/Django, Java Spring), bases de données relationnelles et NoSQL, DevOps et CI/CD (Docker, Kubernetes, GitHub Actions), cloud computing (AWS, GCP, Azure), sécurité applicative (OWASP), code review et bonnes pratiques, tech leadership. Options filière : Mobile & Cross-platform, Cloud & DevOps, IA & Automatisation. MyDigitalStartUp te permet de développer ta propre solution logicielle pendant ta formation. Débouchés : Développeur full-stack senior, Lead developer, CTO, Architecte logiciel. Formation certifiante accessible en alternance (1 semaine école / 2 semaines entreprise)."
    },
    {
      "name": "MBA Direction Artistique Digitale",
      "level": "Bac+5",
      "info": "Pré-requis: Bac+3, Alternance",
      "description": "Le directeur artistique digital conçoit et supervise la création visuelle de projets numériques (sites web, applications, campagnes marketing). Il élabore des concepts créatifs en accord avec la stratégie de marque, dirige les équipes de designers, graphistes et développeurs, et s''assure de la cohérence visuelle et de l''ergonomie des interfaces. Il collabore avec les équipes marketing pour aligner les projets sur les objectifs et optimiser l''expérience utilisateur. Objectif : devenir un créateur visionnaire, capable de transformer des concepts en expériences numériques captivantes et immersives. Compétences développées : décrypter et contextualiser le brief client, superviser la démarche d''émergence de l''idée créative, cadrer le process de production et post-production, manager l''équipe créative, manager un projet de création de contenus et d''interfaces digitaux. Tu maîtriseras motion design, conception 3D, identité de marque, design événementiel, UX/UI design, photo, vidéo et print, à travers MyDigitalStartUp et trois workshops clients permettant de constituer un portfolio professionnel valorisant. Options filière : Événementiel, Jeux vidéo et Narration Interactive, Marketing d''influence, Stratégie de com''. Options transverses : UX Design, Entrepreneuriat, Numérique Responsable, Design Thinking et Innovation, IA et NoCode. Débouchés : Directeur artistique digital, Directeur de création, UI Designer, Responsable de communication visuelle. Certification professionnelle de niveau 7 «Manager de la création et du design de marque» (RNCP40602). Formation certifiante accessible en initial ou en alternance (1 semaine école / 2 semaines entreprise)."
    },
    {"name": "MBA Entrepreneuriat & Digital",
     "level": "Bac+5",
     "info": "Pré-requis: Bac+3, Alternance",
     "description": "L''entrepreneur digital conçoit des modèles d''affaires innovants à l''ère du numérique, lance et scale des projets digitaux en s''appuyant sur des méthodes éprouvées (Lean Startup, Design Thinking, Growth Hacking). Objectif : acquérir toutes les compétences pour créer ta propre entreprise digitale ou piloter l''innovation au sein d''une grande organisation. Compétences développées : idéation et validation de concept (MVP, product-market fit), business planning et modèles de revenus SaaS, levée de fonds et relations investisseurs, marketing de croissance et acquisition, management d''équipes pluridisciplinaires, transformation digitale des organisations, droit des entreprises et propriété intellectuelle, pilotage financier. MyDigitalStartUp est le projet central de ta formation : tu crées réellement ton entreprise digitale pendant 2 ans. Options filière : Création d''entreprise, Intrapreneuriat, Innovation & Digital. Débouchés : Fondateur de startup, Chief Digital Officer, Responsable innovation, Consultant en transformation digitale. Formation certifiante accessible en initial ou en alternance."
    },
    {"name": "MBA Expert Marketing Digital",
     "level": "Bac+5",
     "info": "Pré-requis: Bac+3, Alternance",
     "description": "L''expert marketing digital définit et pilote la stratégie de croissance digitale d''une marque à l''échelle internationale, en orchestrant l''ensemble des leviers d''acquisition, d''engagement et de fidélisation. Objectif : devenir un décideur marketing capable d''aligner la stratégie digitale sur les objectifs business et de manager des équipes pluridisciplinaires. Compétences développées : stratégie de marque et brand management, marketing omnicanal et expérience client, growth marketing et expérimentation, marketing automation et CRM avancé, data-driven marketing et BI, influence et social commerce, gestion de budgets marketing importants, management d''agences et prestataires. Options filière : Brand Strategy, Growth & Performance, Marketing & IA. Trois workshops clients réels te permettent de te constituer un portfolio professionnel solide. Débouchés : Directeur marketing digital, Head of growth, CMO, Responsable stratégie digitale. Formation certifiante accessible en alternance (1 semaine école / 2 semaines entreprise)."
    },
    {"name": "MBA Lead UX/UI Designer",
     "level": "Bac+5",
     "info": "Pré-requis: Bac+3, Alternance",
     "description": "Le lead UX/UI designer dirige la vision design d''un produit numérique, structure les équipes créatives et garantit une expérience utilisateur cohérente, accessible et innovante sur l''ensemble des points de contact digitaux. Objectif : devenir un expert capable de définir la stratégie de design d''un produit et de manager une équipe de designers. Compétences développées : UX strategy et UX research avancée, conception et gouvernance de design systems à grande échelle, prototypage haute fidélité et tests utilisateurs, accessibility (WCAG 2.1), design ops et méthodes de collaboration avec les équipes produit et développement, motion design et micro-interactions, direction artistique et cohérence de marque, management et mentoring de designers. Options filière : Product Design, Design & IA, Service Design. MyDigitalStartUp t''amène à co-concevoir un produit digital de bout en bout. Débouchés : Lead UX/UI designer, Head of design, UX director, Product designer senior. Formation certifiante accessible en alternance (1 semaine école / 2 semaines entreprise)."
    },
    {"name": "MBA Management Projet Digital",
     "level": "Bac+5",
     "info": "Pré-requis: Bac+3, Alternance",
     "description": "Le manager de projets digitaux pilote des transformations numériques d''envergure au sein d''organisations complexes, en coordonnant des équipes pluridisciplinaires et en alignant chaque initiative sur la stratégie de l''entreprise. Objectif : devenir un chef de projet senior capable de conduire des programmes digitaux stratégiques de la conception à la livraison. Compétences développées : pilotage stratégique de programmes digitaux, méthodes Agile à l''échelle (SAFe, Scrum of Scrums), gestion budgétaire et pilotage de la valeur (ROI), conduite du changement et communication de crise, management d''équipes techniques et créatives en multi-sites, risk management et gouvernance IT, rédaction de RFP et sélection de prestataires, reporting CODIR et suivi des KPIs. Options filière : Transformation digitale, Management de l''innovation, IT Governance. Des mises en situation de crise projet et des ateliers de négociation rythment la formation. Débouchés : Chef de projet digital senior, Responsable transformation digitale, IT project manager, PMO. Formation certifiante accessible en alternance (1 semaine école / 2 semaines entreprise)."}
  ]';
  city TEXT;
  formation JSONB;
  full_description TEXT;
BEGIN
  FOREACH city IN ARRAY cities LOOP
    FOR formation IN SELECT * FROM jsonb_array_elements(formations) LOOP
      -- Concatène la description longue (si présente) et les pré-requis
      IF formation ? 'description' THEN
        full_description := (formation->>'description') || E'\n\n' || (formation->>'info');
      ELSE
        full_description := formation->>'info';
      END IF;

      INSERT INTO ecoles_partenaires (school_name, formation_name, city, diploma_level, description)
      VALUES (
        'MyDigitalSchool',
        formation->>'name',
        city,
        formation->>'level',
        full_description
      );
    END LOOP;
  END LOOP;
END $$;
