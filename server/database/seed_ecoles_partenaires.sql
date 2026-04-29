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
    {"name": "Bachelor Informatique",            "level": "Bac+2", "info": "Pré-requis: Bac, Alt. possible"},
    {"name": "Bachelor Marketing Digital",       "level": "Bac+2", "info": "Pré-requis: Bac, Alt. possible"},
    {"name": "BTS SIO",                          "level": "Bac+2", "info": "Pré-requis: Bac, Alt. possible"},
    {"name": "Bachelor Chargé d''Affaires Web",  "level": "Bac+3", "info": "Pré-requis: Bac+2, Alt. majoritaire"},
    {"name": "Bachelor Chef de Projet Digital",  "level": "Bac+3", "info": "Pré-requis: Bac+2, Alt. majoritaire"},
    {
      "name": "Bachelor Création Numérique",
      "level": "Bac+3",
      "info": "Pré-requis: Bac+2, Alt. majoritaire",
      "description": "Le Designer graphique réalise la production graphique et visuelle de tous types de supports de communication : interfaces web et mobiles, supports print, bannières et encarts web, spots publicitaires en vidéo ou motion design. Il s''appuie sur un brief client pour concevoir des identités visuelles en phase avec les valeurs et la philosophie des marques, produits ou services qu''il met en avant à travers ses créations. Objectif : devenir un expert capable de concevoir des supports visuels innovants en mettant ta créativité au service des valeurs portées par la marque. Compétences développées : analyse de la demande du commanditaire, définition de la stratégie de projet de création graphique, réalisation et livraison du projet, conception d''identité visuelle, design graphique web et print, motion design, vidéo, design interactif, ainsi que l''application du marketing au design. Deux workshops rythment l''année : «Typographie» à la rentrée et «Identité graphique» au semestre 2, avec la réalisation d''un premier portfolio professionnel. Débouchés : Graphiste web, UI Designer, Designer interactif, Motion designer, Concepteur multimédia. Certification professionnelle de niveau 6 «Designer graphique» (RNCP37817). Poursuites possibles : MBA Direction Artistique Digitale, MBA Expert UX/UI Design, MBA Management de Projet Digital. Formation certifiante accessible en initial (statut étudiant) ou en alternance (1 semaine école / 2 semaines entreprise)."
    },
    {"name": "Bachelor Cyber & Réseau",          "level": "Bac+3", "info": "Pré-requis: Bac+2, Alt. majoritaire"},
    {"name": "Bachelor Data Analyst & IA",       "level": "Bac+3", "info": "Pré-requis: Bac+2, Alt. majoritaire"},
    {"name": "Bachelor Développeur Web",         "level": "Bac+3", "info": "Pré-requis: Bac+2, Alt. majoritaire"},
    {"name": "Bachelor UX/UI Design",            "level": "Bac+3", "info": "Pré-requis: Bac+2, Alt. majoritaire"},
    {"name": "Bachelor Webmarketing",            "level": "Bac+3", "info": "Pré-requis: Bac+2, Alt. majoritaire"},
    {"name": "MBA Big Data & IA",                "level": "Bac+5", "info": "Pré-requis: Bac+3, Alternance"},
    {"name": "MBA Cyber & Réseau",               "level": "Bac+5", "info": "Pré-requis: Bac+3, Alternance"},
    {"name": "MBA Développeur Full-Stack",       "level": "Bac+5", "info": "Pré-requis: Bac+3, Alternance"},
    {
      "name": "MBA Direction Artistique Digitale",
      "level": "Bac+5",
      "info": "Pré-requis: Bac+3, Alternance",
      "description": "Le directeur artistique digital conçoit et supervise la création visuelle de projets numériques (sites web, applications, campagnes marketing). Il élabore des concepts créatifs en accord avec la stratégie de marque, dirige les équipes de designers, graphistes et développeurs, et s''assure de la cohérence visuelle et de l''ergonomie des interfaces. Il collabore avec les équipes marketing pour aligner les projets sur les objectifs et optimiser l''expérience utilisateur. Objectif : devenir un créateur visionnaire, capable de transformer des concepts en expériences numériques captivantes et immersives. Compétences développées : décrypter et contextualiser le brief client, superviser la démarche d''émergence de l''idée créative, cadrer le process de production et post-production, manager l''équipe créative, manager un projet de création de contenus et d''interfaces digitaux. Tu maîtriseras motion design, conception 3D, identité de marque, design événementiel, UX/UI design, photo, vidéo et print, à travers MyDigitalStartUp et trois workshops clients permettant de constituer un portfolio professionnel valorisant. Options filière : Événementiel, Jeux vidéo et Narration Interactive, Marketing d''influence, Stratégie de com''. Options transverses : UX Design, Entrepreneuriat, Numérique Responsable, Design Thinking et Innovation, IA et NoCode. Débouchés : Directeur artistique digital, Directeur de création, UI Designer, Responsable de communication visuelle. Certification professionnelle de niveau 7 «Manager de la création et du design de marque» (RNCP40602). Formation certifiante accessible en initial ou en alternance (1 semaine école / 2 semaines entreprise)."
    },
    {"name": "MBA Entrepreneuriat & Digital",    "level": "Bac+5", "info": "Pré-requis: Bac+3, Alternance"},
    {"name": "MBA Expert Marketing Digital",     "level": "Bac+5", "info": "Pré-requis: Bac+3, Alternance"},
    {"name": "MBA Lead UX/UI Designer",          "level": "Bac+5", "info": "Pré-requis: Bac+3, Alternance"},
    {"name": "MBA Management Projet Digital",    "level": "Bac+5", "info": "Pré-requis: Bac+3, Alternance"}
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
