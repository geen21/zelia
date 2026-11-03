-- Orientation v4: concrete trade-offs, not agreement with desirable qualities.
-- Apply before deploying the client requesting inscription_v4.
-- Preserve every earlier question and its historical responses.

BEGIN;

ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS options JSONB;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.questions
    WHERE id BETWEEN 500 AND 519 AND questionnaire_type <> 'inscription_v4'
  ) THEN
    RAISE EXCEPTION 'Question ids 500-519 are already used by another questionnaire';
  END IF;
END $$;

WITH dilemmas (id, content, category, a, value_a, b, value_b) AS (
  VALUES
  (500, 'Un objet ne fonctionne plus. Tu préfères passer une heure à...',
   'hands_mind',
   'Démonter et tester des pièces, quitte à recommencer plusieurs fois.', 'mains',
   'Comparer les schémas et les mesures, sans manipuler l''objet.', 'tete'),
  (501, 'Pour une matinée de découverte, tu choisis de...',
   'interest',
   'Accompagner des patients pendant des soins, avec des échanges parfois difficiles.', 'S',
   'Réparer du matériel en atelier, avec des réglages et des essais à répéter.', 'R'),
  (502, 'Pour un projet à rendre dans une semaine, tu préfères...',
   'solo_team',
   'Gérer ta partie seul, sans pouvoir demander un avis à chaque étape.', 'solo',
   'Avancer ensemble, en adaptant ton rythme aux décisions du groupe.', 'equipe'),
  (503, 'Pendant un stage, tu prends en charge...',
   'interest',
   'Tester une hypothèse en laboratoire, en répétant les mêmes mesures.', 'I',
   'Présenter une offre sur un stand, en allant vers des inconnus malgré les refus.', 'E'),
  (504, 'Pour réaliser un projet, tu préfères...',
   'creative_structured',
   'Inventer une méthode, quitte à perdre du temps sur une piste qui ne marche pas.', 'creatif',
   'Appliquer une méthode éprouvée, même si tu ne peux pas la personnaliser.', 'structure'),
  (505, 'Pour préparer un événement, tu choisis de...',
   'interest',
   'Créer les affiches, en retravaillant tes visuels après les critiques.', 'A',
   'Tenir le budget, en vérifiant les devis et chaque justificatif.', 'C'),
  (506, 'À tâches aussi intéressantes et à salaire égal, tu préfères...',
   'field_office',
   'Passer d''un site à l''autre, avec des trajets et une météo changeante.', 'terrain',
   'Rester à un poste fixe, avec plusieurs heures assis et concentré.', 'bureau'),
  (507, 'Pour un projet sur la qualité de l''eau, tu préfères...',
   'interest',
   'Faire les prélèvements dehors, même par mauvais temps.', 'R',
   'Analyser les résultats sur ordinateur, en vérifiant les données une à une.', 'I'),
  (508, 'Deux façons de mener un projet sont possibles. Tu choisis de...',
   'risk_safety',
   'Tester un outil nouveau, en acceptant de devoir refaire une partie du travail.', 'audace',
   'Garder l''outil connu, même si tu renonces à essayer de nouvelles possibilités.', 'securite'),
  (509, 'Tu consacres plusieurs séances à une association. Tu préfères...',
   'interest',
   'Convaincre des partenaires de financer un projet, malgré les refus.', 'E',
   'Aider un élève à comprendre un cours, en réexpliquant autant que nécessaire.', 'S'),
  (510, 'Pour améliorer un équipement, tu préfères...',
   'hands_mind',
   'Comparer les calculs et les plans avant qu''une autre personne le fabrique.', 'tete',
   'Construire un prototype et reprendre les assemblages après chaque essai.', 'mains'),
  (511, 'Dans un lieu d''accueil, tu préfères passer la journée à...',
   'interest',
   'Organiser les plannings et les dossiers, en contrôlant les informations manquantes.', 'C',
   'Accompagner des personnes dans leurs démarches, en écoutant leurs difficultés.', 'S'),
  (512, 'Quand un travail devient difficile, tu préfères...',
   'solo_team',
   'Chercher à plusieurs, même si les échanges interrompent ta concentration.', 'equipe',
   'Chercher seul au calme, quitte à rester bloqué plus longtemps.', 'solo'),
  (513, 'Tu peux suivre un seul atelier pendant un mois. Tu choisis de...',
   'interest',
   'Comprendre un résultat scientifique inattendu, en refaisant les mesures.', 'I',
   'Créer une vidéo personnelle, en reprenant le montage après les retours.', 'A'),
  (514, 'Pour une commande avec une date limite, tu préfères...',
   'creative_structured',
   'Suivre un cahier des charges précis, même si ta marge de création est réduite.', 'structure',
   'Proposer plusieurs pistes originales, même si le résultat attendu est moins clair.', 'creatif'),
  (515, 'Pour une campagne de communication, tu préfères...',
   'interest',
   'Imaginer les visuels, sans savoir si ton style sera retenu.', 'A',
   'Présenter la campagne à des partenaires, en négociant malgré les objections.', 'E'),
  (516, 'Pour suivre un projet sur plusieurs semaines, tu préfères...',
   'field_office',
   'Examiner les dossiers depuis un poste fixe, sans voir chaque site en personne.', 'bureau',
   'Vérifier sur place, en acceptant des déplacements fréquents.', 'terrain'),
  (517, 'Dans une petite structure, tu choisis de...',
   'interest',
   'Entretenir un potager, même quand les tâches sont salissantes et répétitives.', 'R',
   'Gérer les stocks et les commandes, en vérifiant chaque quantité.', 'C'),
  (518, 'À salaire et horaires identiques, quel projet prends-tu ?',
   'risk_safety',
   'Un projet déjà balisé, avec peu de surprises mais peu de nouveautés.', 'securite',
   'Un projet expérimental, avec plus de nouveautés mais aucune garantie de résultat.', 'audace'),
  (519, 'Pour ta dernière demi-journée de découverte, tu préfères...',
   'interest',
   'Animer un atelier pour un groupe, en relançant souvent les participants.', 'S',
   'Déboguer un programme, en cherchant longtemps l''origine d''une erreur.', 'I')
), choices AS (
  SELECT d.id, side, activity AS label, value,
    'Activité choisie : ' || activity
      || ' Alternative moins choisie dans ce contexte : ' || alternative
      || ' Ce choix est relatif, pas un rejet absolu ni une aptitude mesurée.'
      AS interpretation
  FROM dilemmas d
  CROSS JOIN LATERAL (VALUES (0, a, value_a, b), (1, b, value_b, a))
    AS sides(side, activity, value, alternative)
)
INSERT INTO public.questions (id, content, category, questionnaire_type, options, interpretations)
SELECT d.id, d.content, d.category, 'inscription_v4',
  (SELECT jsonb_agg(jsonb_build_object('label', label, 'value', value, 'strength', 2)
    ORDER BY side) FROM choices c WHERE c.id = d.id),
  (SELECT jsonb_object_agg(label, interpretation) FROM choices c WHERE c.id = d.id)
FROM dilemmas d
ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  questionnaire_type = EXCLUDED.questionnaire_type,
  options = EXCLUDED.options,
  interpretations = COALESCE(public.questions.interpretations, '{}'::jsonb) || EXCLUDED.interpretations;

COMMIT;
