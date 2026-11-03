-- Orientation v3: 20 natural statements, one agreement scale.
-- New ids and a versioned question type preserve v1/v2 answers and let older clients
-- keep using their own questions. Responses are still saved under 'inscription'.
-- Apply before deploying the client that requests type=inscription_v3.

BEGIN;

ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS options JSONB;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.questions
    WHERE id BETWEEN 400 AND 419 AND questionnaire_type <> 'inscription_v3'
  ) THEN
    RAISE EXCEPTION 'Question ids 400-419 are already used by another questionnaire';
  END IF;
END $$;

WITH statements (id, content, category, pole, negative, positive) AS (
  VALUES
  (400, 'J''aime faire des choses de mes mains, comme cuisiner, fabriquer ou réparer.',
   'hands_mind', 'mains',
   'Peu d''envie déclarée de réaliser des activités manuelles.',
   'Goût déclaré pour les activités manuelles et les réalisations concrètes.'),
  (401, 'Les découvertes scientifiques me donnent envie d''en savoir plus.',
   'interest', 'I',
   'Peu d''intérêt déclaré pour les découvertes scientifiques.',
   'Intérêt déclaré pour les sciences et la découverte.'),
  (402, 'J''aime avancer sur un projet avec d''autres personnes.',
   'solo_team', 'equipe',
   'Peu d''envie déclarée de travailler en groupe.',
   'Goût déclaré pour la collaboration et les projets collectifs.'),
  (403, 'J''aimerais aider des personnes à se sentir mieux.',
   'interest', 'S',
   'Peu d''envie déclarée de travailler dans l''aide ou le soin aux personnes.',
   'Intérêt déclaré pour l''aide, le soin et le bien-être des personnes.'),
  (404, 'J''aime trouver ma propre façon de faire les choses.',
   'creative_structured', 'creatif',
   'Peu de besoin déclaré de chercher sa propre méthode.',
   'Goût déclaré pour la liberté de méthode et l''exploration de nouvelles idées.'),
  (405, 'J''aime m''exprimer par la création : écriture, dessin, musique, photo...',
   'interest', 'A',
   'Peu d''intérêt déclaré pour la création et l''expression artistique.',
   'Intérêt déclaré pour la création et l''expression artistique, sans discipline imposée.'),
  (406, 'J''aimerais un travail où je bouge souvent.',
   'field_office', 'terrain',
   'Peu de besoin déclaré de mouvement dans le travail.',
   'Envie déclarée de mouvement et d''activité sur le terrain.'),
  (407, 'J''aimerais m''occuper d''animaux ou protéger la nature.',
   'interest', 'R',
   'Peu d''intérêt déclaré pour les activités liées aux animaux ou à la nature.',
   'Intérêt déclaré pour les animaux, la nature ou la protection de l''environnement.'),
  (408, 'J''aime essayer quelque chose de nouveau, même sans savoir si ça va marcher.',
   'risk_safety', 'audace',
   'Préfère limiter l''incertitude avant de se lancer.',
   'Accepte une part d''incertitude pour essayer quelque chose de nouveau.'),
  (409, 'J''aimerais lancer une activité ou faire connaître un produit.',
   'interest', 'E',
   'Peu d''intérêt déclaré pour le lancement ou la promotion d''une activité.',
   'Intérêt déclaré pour l''entreprise, le commerce ou la promotion d''un projet.'),
  (410, 'J''aime réfléchir à un problème jusqu''à trouver une solution.',
   'hands_mind', 'tete',
   'Peu d''envie déclarée de consacrer du temps à l''analyse de problèmes.',
   'Goût déclaré pour la réflexion et la résolution de problèmes.'),
  (411, 'Les outils numériques et les nouvelles technologies m''intéressent.',
   'interest', 'I',
   'Peu d''intérêt déclaré pour les outils numériques et les nouvelles technologies.',
   'Intérêt déclaré pour le numérique et les technologies, sans présumer de compétences techniques.'),
  (412, 'J''aime avoir des moments où je travaille seul, à mon rythme.',
   'solo_team', 'solo',
   'Peu de besoin déclaré de travailler seul à son rythme.',
   'Goût déclaré pour les moments de travail individuel et l''autonomie.'),
  (413, 'J''aime expliquer quelque chose pour aider quelqu''un à progresser.',
   'interest', 'S',
   'Peu d''intérêt déclaré pour la transmission et l''accompagnement.',
   'Intérêt déclaré pour la transmission, l''enseignement ou l''accompagnement.'),
  (414, 'J''aime savoir quelles étapes suivre avant de commencer.',
   'creative_structured', 'structure',
   'Préfère garder de la souplesse plutôt que suivre des étapes définies à l''avance.',
   'Goût déclaré pour les étapes claires et les méthodes organisées.'),
  (415, 'J''aime échanger des idées et défendre mon point de vue.',
   'interest', 'E',
   'Peu d''envie déclarée de débattre ou de défendre un point de vue.',
   'Intérêt déclaré pour le débat, l''argumentation et la communication.'),
  (416, 'Un travail à un bureau me conviendrait bien.',
   'field_office', 'bureau',
   'Peu d''envie déclarée de travailler à un bureau.',
   'Un environnement de travail à un bureau peut lui convenir.'),
  (417, 'Le sport et les activités physiques m''intéressent.',
   'interest', 'R',
   'Peu d''intérêt déclaré pour le sport et les activités physiques.',
   'Intérêt déclaré pour le sport et les activités physiques, sans présumer de pratique ni d''aptitudes.'),
  (418, 'Pour mon futur travail, la stabilité est importante pour moi.',
   'risk_safety', 'securite',
   'La stabilité professionnelle n''est pas une priorité déclarée.',
   'La stabilité professionnelle est une priorité déclarée.'),
  (419, 'J''aime comprendre comment les gens vivent et comment la société fonctionne.',
   'interest', 'S',
   'Peu d''intérêt déclaré pour les questions de société et les modes de vie.',
   'Intérêt déclaré pour la société, les cultures et les relations humaines, sans en déduire un intérêt pour le soin.')
), levels (label, level) AS (
  VALUES ('Pas du tout', 0), ('Plutôt pas', 1), ('Plutôt oui', 2), ('Carrément', 3)
)
INSERT INTO public.questions (id, content, category, questionnaire_type, options, interpretations)
SELECT id, content, category, 'inscription_v3',
  (SELECT jsonb_agg(jsonb_build_object('label', label, 'value', pole, 'level', level) ORDER BY level) FROM levels),
  jsonb_build_object(
    'Pas du tout', negative,
    'Plutôt pas', 'Tendance légère : ' || negative,
    'Plutôt oui', 'Tendance légère : ' || positive,
    'Carrément', positive
  )
FROM statements
ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  questionnaire_type = EXCLUDED.questionnaire_type,
  options = EXCLUDED.options,
  interpretations = EXCLUDED.interpretations;

COMMIT;
