-- Orientation v5: the trade-off is in one short sentence, answers use agreement levels.
-- Apply before deploying the client requesting inscription_v5.
-- Earlier question ids and interpretations must retain their original meaning.

BEGIN;

ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS options JSONB;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.questions
    WHERE id BETWEEN 600 AND 619 AND questionnaire_type IS DISTINCT FROM 'inscription_v5'
  ) THEN
    RAISE EXCEPTION 'Question ids 600-619 are already used by another questionnaire';
  END IF;
END $$;

WITH comparisons (id, content, category, value, alternative, activity, other_activity) AS (
  VALUES
  (600, 'Pour comprendre une panne, je préfère démonter l''objet plutôt qu''étudier son schéma.',
   'hands_mind', 'mains', 'tete',
   'Démonter et dépanner concrètement (maintenance, mécanique, électrotechnique, réparation).',
   'Étudier les schémas et diagnostiquer par l''analyse (ingénierie, bureau d''études, méthodes).'),
  (601, 'Je préfère écouter et conseiller quelqu''un plutôt que réparer du matériel.',
   'interest', 'S', 'R',
   'Écouter, conseiller et accompagner des personnes (social, psychologie, conseil, santé, RH).',
   'Réparer et régler du matériel technique (artisanat, maintenance, mécanique, atelier).'),
  (602, 'Je préfère avancer seul sur ma mission plutôt que travailler en groupe.',
   'solo_team', 'solo', 'equipe',
   'Avancer en autonomie sur sa mission (expertise indépendante, artisanat, recherche, rédaction).',
   'Travailler en collectif (équipe projet, chantier, restauration, soin, événementiel).'),
  (603, 'Je préfère mener une expérience scientifique plutôt que vendre un produit.',
   'interest', 'I', 'E',
   'Mener des expériences et chercher (sciences, laboratoire, biologie, chimie, R&D).',
   'Vendre, négocier et convaincre des clients (commerce, vente, immobilier, marketing).'),
  (604, 'Je préfère inventer ma propre méthode plutôt que suivre des règles fixes.',
   'creative_structured', 'creatif', 'structure',
   'Inventer sa propre méthode (création, design, innovation, entrepreneuriat).',
   'Suivre des règles et procédures précises (droit, comptabilité, qualité, sécurité, aéronautique).'),
  (605, 'Je préfère dessiner ou créer des visuels plutôt que manipuler des chiffres.',
   'interest', 'A', 'C',
   'Dessiner et créer des visuels (graphisme, design, architecture d''intérieur, mode, illustration).',
   'Manipuler des chiffres et des budgets (comptabilité, finance, gestion, banque, audit).'),
  (606, 'Je préfère bouger dehors toute la journée plutôt que travailler sur écran.',
   'field_office', 'terrain', 'bureau',
   'Bouger dehors au quotidien (sport, paysage, BTP, transport, secours, environnement).',
   'Travailler au calme sur écran (informatique, gestion, droit, rédaction, studio).'),
  (607, 'Je préfère m''occuper d''animaux ou de la nature plutôt que programmer.',
   'interest', 'R', 'I',
   'S''occuper d''animaux ou de la nature (soins animaliers, agriculture, forêt, environnement, paysage).',
   'Programmer et développer des outils numériques (informatique, développement, cybersécurité, systèmes).'),
  (608, 'Je préfère agir vite dans l''imprévu plutôt que tout planifier à l''avance.',
   'risk_safety', 'audace', 'securite',
   'Agir vite face à l''imprévu (urgences, sécurité, événementiel, reportage, commerce).',
   'Planifier et sécuriser chaque étape à l''avance (ingénierie, logistique, pharmacie, notariat, audit).'),
  (609, 'Je préfère défendre un projet à l''oral plutôt que former des débutants.',
   'interest', 'E', 'S',
   'Défendre un projet et convaincre à l''oral (droit, plaidoyer, commerce, communication, direction).',
   'Former, expliquer et faire progresser (enseignement, formation, éducation, coaching).'),
  (610, 'Je préfère imaginer les plans d''un projet plutôt que cuisiner ou fabriquer.',
   'hands_mind', 'tete', 'mains',
   'Imaginer et dessiner les plans d''un projet (architecture, ingénierie, urbanisme, bureau d''études).',
   'Cuisiner ou fabriquer de ses mains (cuisine, pâtisserie, menuiserie, artisanat, production).'),
  (611, 'Je préfère gérer l''organisation en coulisses plutôt qu''accueillir le public.',
   'interest', 'C', 'S',
   'Gérer l''organisation et la logistique en coulisses (logistique, transport, planification, administration).',
   'Accueillir, orienter et accompagner le public (hôtellerie, tourisme, événementiel, médiation, accueil).'),
  (612, 'Je préfère chercher des solutions à plusieurs plutôt que réfléchir seul.',
   'solo_team', 'equipe', 'solo',
   'Chercher des solutions à plusieurs (animation d''équipe, conseil, coordination, gestion de projet).',
   'Réfléchir seul au calme (recherche, écriture, analyse, expertise technique ou artisanale).'),
  (613, 'Je préfère enquêter pour vérifier des faits plutôt que tourner une vidéo.',
   'interest', 'I', 'A',
   'Enquêter et vérifier des faits en profondeur (journalisme, enquête, droit, recherche, audit).',
   'Tourner, monter et créer en image ou en son (audiovisuel, cinéma, photo, spectacle, médias).'),
  (614, 'Je préfère des consignes claires et précises plutôt qu''une liberté totale.',
   'creative_structured', 'structure', 'creatif',
   'Travailler avec des consignes claires et cadrées (technique normée, laboratoire, service public, gestion).',
   'Avoir une liberté totale de création (arts, direction artistique, création de contenu, spectacle).'),
  (615, 'Je préfère écrire, dessiner ou composer plutôt que diriger une équipe.',
   'interest', 'A', 'E',
   'Écrire, dessiner ou composer une œuvre (édition, journalisme, design, arts appliqués, musique).',
   'Diriger et coordonner une équipe (management, conduite de travaux, gestion d''établissement, encadrement).'),
  (616, 'Je préfère travailler dans un lieu fixe plutôt que bouger de site en site.',
   'field_office', 'bureau', 'terrain',
   'Exercer dans un lieu fixe et stable (cabinet, laboratoire, bureau, atelier fixe).',
   'Se déplacer de site en site (chantiers, commerce itinérant, interventions terrain, transport).'),
  (617, 'Je préfère construire sur le terrain plutôt que vérifier des dossiers.',
   'interest', 'R', 'C',
   'Construire et agir sur un chantier (BTP, génie civil, conduite d''engins, aménagement, artisanat du bâtiment).',
   'Vérifier des dossiers et contrats (droit, assurance, ressources humaines, administration, gestion).'),
  (618, 'Je préfère un métier stable et sécurisant plutôt que lancer ma propre boîte.',
   'risk_safety', 'securite', 'audace',
   'Choisir un métier stable et sécurisant (fonction publique, santé, enseignement, grands groupes).',
   'Lancer sa propre activité ou un projet indépendant (entrepreneuriat, commerce indépendant, freelance).'),
  (619, 'Je préfère soigner, former ou aider des gens plutôt qu''analyser des données.',
   'interest', 'S', 'I',
   'Soigner, entraîner ou aider directement des personnes (santé, rééducation, sport, secours, social).',
   'Analyser des données et résoudre des problèmes abstraits (data, économie, ingénierie, recherche, statistique).')
), levels (label, level) AS (
  VALUES ('Pas du tout', 0), ('Plutôt pas', 1), ('Plutôt oui', 2), ('Carrément', 3)
)
INSERT INTO public.questions (id, content, category, questionnaire_type, options, interpretations)
SELECT id, content, category, 'inscription_v5',
  (SELECT jsonb_agg(jsonb_build_object(
    'label', label, 'value', value, 'alternative', alternative, 'level', level
  ) ORDER BY level) FROM levels),
  (SELECT jsonb_object_agg(label,
    CASE WHEN level IN (0, 3) THEN 'Préférence nette' ELSE 'Préférence légère' END
      || ' dans cette comparaison pour : '
      || CASE WHEN level >= 2 THEN activity ELSE other_activity END
      || ' Alternative moins choisie : '
      || CASE WHEN level >= 2 THEN other_activity ELSE activity END
      || ' Ce choix est relatif, pas un rejet absolu ni une aptitude mesurée.'
  ) FROM levels)
FROM comparisons
ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  questionnaire_type = EXCLUDED.questionnaire_type,
  options = EXCLUDED.options,
  interpretations = EXCLUDED.interpretations;

COMMIT;
