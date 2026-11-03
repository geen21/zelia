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
   'Démonter et réparer concrètement (maintenance, mécanique, électronique, artisanat).',
   'Comprendre par le schéma et l''analyse (ingénierie, bureau d''études, conception).'),
  (601, 'En salle de sport, je préfère coacher les gens plutôt que réparer les machines.',
   'interest', 'S', 'R',
   'Coacher et faire progresser des personnes (coach sportif, éducation, animation).',
   'Réparer et entretenir des machines (maintenance, mécanique, technique).'),
  (602, 'Pour un exposé, je préfère le préparer seul plutôt qu''en groupe.',
   'solo_team', 'solo', 'equipe',
   'Préparer un travail seul, à son rythme (expertise, recherche, rédaction, artisanat).',
   'Préparer un travail en groupe (projet d''équipe, coordination, collectif).'),
  (603, 'Dans un procès, je préfère analyser les preuves plutôt que défendre l''accusé.',
   'interest', 'I', 'E',
   'Analyser des preuves et des indices (police scientifique, enquête, expertise, recherche).',
   'Défendre une personne et convaincre (avocat, plaidoirie, négociation, commerce).'),
  (604, 'Pour un devoir, je préfère avoir carte blanche plutôt que des consignes précises.',
   'creative_structured', 'creatif', 'structure',
   'Avoir carte blanche pour créer (création, design, conception, entrepreneuriat).',
   'Suivre des consignes précises (métiers normés, qualité, administration, droit).'),
  (605, 'Dans une boutique, je préfère créer la vitrine plutôt que gérer les comptes.',
   'interest', 'A', 'C',
   'Créer une vitrine et une ambiance visuelle (design, décoration, graphisme, mode).',
   'Gérer les comptes d''une activité (comptabilité, gestion, banque, finance).'),
  (606, 'Au quotidien, je préfère travailler dehors plutôt que dans un bureau.',
   'field_office', 'terrain', 'bureau',
   'Travailler dehors au quotidien (paysage, agriculture, environnement, BTP, sport).',
   'Travailler dans un bureau (gestion, informatique, droit, communication).'),
  (607, 'Dans un zoo, je préfère m''occuper des animaux plutôt qu''étudier leur comportement.',
   'interest', 'R', 'I',
   'S''occuper concrètement des animaux (soigneur animalier, élevage, vétérinaire, nature).',
   'Étudier le comportement des animaux (biologie, recherche, sciences du vivant).'),
  (608, 'Pour un projet, je préfère me lancer tout de suite plutôt que tout préparer.',
   'risk_safety', 'audace', 'securite',
   'Se lancer tout de suite et ajuster en route (entrepreneuriat, événementiel, terrain, urgence).',
   'Tout préparer avant de commencer (gestion de projet, ingénierie, logistique, audit).'),
  (609, 'Dans une école, je préfère diriger l''établissement plutôt qu''enseigner.',
   'interest', 'E', 'S',
   'Diriger un établissement et décider (direction, management, gestion d''équipe).',
   'Enseigner et transmettre en classe (enseignement, formation, éducation).'),
  (610, 'Pour apprendre, je préfère comprendre la théorie plutôt qu''essayer par moi-même.',
   'hands_mind', 'tete', 'mains',
   'Comprendre la théorie avant d''agir (filières générales, université, sciences, prépa).',
   'Apprendre en essayant soi-même (voie pro, alternance, ateliers, apprentissage).'),
  (611, 'Dans un hôtel, je préfère gérer les réservations plutôt qu''accueillir les clients.',
   'interest', 'C', 'S',
   'Gérer les réservations et l''organisation (administration, tourisme, logistique, gestion).',
   'Accueillir et accompagner des clients (hôtellerie, accueil, tourisme, relation client).'),
  (612, 'Au travail, je préfère être entouré de collègues plutôt que travailler seul.',
   'solo_team', 'equipe', 'solo',
   'Travailler entouré de collègues (équipe, coordination, relation, collectif).',
   'Travailler seul (autonomie, indépendance, expertise, télétravail).'),
  (613, 'Pour créer un jeu vidéo, je préfère coder plutôt que dessiner les personnages.',
   'interest', 'I', 'A',
   'Coder et programmer (informatique, développement, jeu vidéo, cybersécurité).',
   'Dessiner et créer des personnages (illustration, animation 3D, graphisme, jeu vidéo).'),
  (614, 'En cuisine, je préfère suivre la recette plutôt qu''improviser.',
   'creative_structured', 'structure', 'creatif',
   'Suivre une méthode précise (pâtisserie, laboratoire, production, métiers normés).',
   'Improviser et inventer (création culinaire, arts, conception, innovation).'),
  (615, 'Dans la mode, je préfère créer les vêtements plutôt que les vendre.',
   'interest', 'A', 'E',
   'Créer des vêtements ou des collections (stylisme, mode, design, couture).',
   'Vendre et promouvoir des produits (commerce, vente, marketing, distribution).'),
  (616, 'Pour mon futur job, je préfère un lieu fixe plutôt que me déplacer chaque jour.',
   'field_office', 'bureau', 'terrain',
   'Travailler dans un lieu fixe (bureau, cabinet, laboratoire, atelier).',
   'Se déplacer chaque jour (chantiers, transport, commerce itinérant, interventions).'),
  (617, 'Sur un chantier, je préfère construire plutôt que gérer les plannings.',
   'interest', 'R', 'C',
   'Construire sur un chantier (BTP, maçonnerie, charpente, travaux publics).',
   'Gérer les plannings d''une activité (planification, logistique, gestion, administration).'),
  (618, 'Plus tard, je préfère un emploi stable plutôt que lancer ma propre boîte.',
   'risk_safety', 'securite', 'audace',
   'Avoir un emploi stable et sécurisant (fonction publique, grandes structures, CDI).',
   'Lancer sa propre activité (entrepreneuriat, indépendant, création d''entreprise).'),
  (619, 'À l''hôpital, je préfère m''occuper des patients plutôt que travailler au labo.',
   'interest', 'S', 'I',
   'S''occuper des patients au quotidien (soins infirmiers, aide-soignant, rééducation).',
   'Travailler en laboratoire d''analyses (biologie médicale, recherche, technicien de laboratoire).')
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
