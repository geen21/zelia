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
   'Manipuler et démonter l''objet pour comprendre comment il fonctionne.',
   'Étudier le schéma et analyser le fonctionnement avant d''agir.'),
  (601, 'Lors d''un événement, je préfère accueillir et guider le public plutôt qu''installer le matériel.',
   'interest', 'S', 'R',
   'Accueillir, orienter et accompagner le public lors d''un événement.',
   'Installer et régler le matériel technique lors d''un événement.'),
  (602, 'Pour un travail de groupe, je préfère gérer ma partie seul plutôt qu''avancer tous ensemble.',
   'solo_team', 'solo', 'equipe',
   'Gérer sa propre partie en autonomie dans un projet.',
   'Avancer collectivement à chaque étape avec le groupe.'),
  (603, 'Pour un exposé, je préfère approfondir et analyser le sujet plutôt que le défendre à l''oral.',
   'interest', 'I', 'E',
   'Rechercher, vérifier et approfondir le fond d''un sujet.',
   'Présenter le projet à l''oral et convaincre l''auditoire.'),
  (604, 'Face à un devoir, je préfère avoir carte blanche plutôt que suivre des consignes précises.',
   'creative_structured', 'creatif', 'structure',
   'Explorer librement sa propre approche avec carte blanche.',
   'S''appuyer sur des consignes et un cadre précis.'),
  (605, 'Sur un projet, je préfère créer le style et les visuels plutôt que vérifier que tout est carré.',
   'interest', 'A', 'C',
   'Créer le style, l''univers visuel et la dimension graphique d''un projet.',
   'Vérifier chaque détail pour que l''organisation du projet soit carrée.'),
  (606, 'Au quotidien, je préfère bouger sur le terrain plutôt que travailler au calme devant un écran.',
   'field_office', 'terrain', 'bureau',
   'Bouger sur le terrain et changer d''environnement au quotidien.',
   'Travailler au calme à un poste fixe devant un écran.'),
  (607, 'En sciences ou en techno, je préfère manipuler le matériel plutôt qu''analyser les résultats.',
   'interest', 'R', 'I',
   'Manipuler le matériel et réaliser les essais concrets.',
   'Analyser les mesures et interpréter les résultats.'),
  (608, 'Pour démarrer un projet, je préfère me lancer tout de suite plutôt que tout préparer à l''avance.',
   'risk_safety', 'audace', 'securite',
   'Se lancer tout de suite pour tester et ajuster en avançant.',
   'Tout préparer à l''avance avant de démarrer un projet.'),
  (609, 'Dans une équipe, je préfère prendre le lead et décider plutôt qu''écouter et accompagner chacun.',
   'interest', 'E', 'S',
   'Prendre l''initiative, trancher et entraîner une équipe.',
   'Écouter, soutenir et accompagner chaque personne dans l''équipe.'),
  (610, 'Pour créer un objet, je préfère concevoir les plans plutôt que le fabriquer de mes mains.',
   'hands_mind', 'tete', 'mains',
   'Concevoir les plans et réfléchir à la solution avant fabrication.',
   'Fabriquer et assembler concrètement l''objet de ses mains.'),
  (611, 'Dans un club, je préfère gérer les inscriptions et le planning plutôt qu''animer les séances.',
   'interest', 'C', 'S',
   'Organiser les inscriptions, le planning et le suivi d''une structure.',
   'Animer des séances et accompagner directement un groupe.'),
  (612, 'Face à un problème difficile, je préfère réfléchir à plusieurs plutôt que chercher seul.',
   'solo_team', 'equipe', 'solo',
   'Confronter les idées à plusieurs pour débloquer un problème.',
   'Réfléchir seul au calme pour résoudre un problème.'),
  (613, 'Pour réaliser une vidéo, je préfère creuser le sujet de fond plutôt que soigner le montage.',
   'interest', 'I', 'A',
   'Enquêter et creuser le contenu de fond d''un sujet.',
   'Créer la mise en scène, l''image et le montage.'),
  (614, 'Quand on me confie une mission, je préfère des étapes claires plutôt qu''improviser librement.',
   'creative_structured', 'structure', 'creatif',
   'Avancer avec une méthode structurée et des étapes claires.',
   'Improviser et adapter librement sa façon de faire.'),
  (615, 'Pour lancer une idée, je préfère imaginer le concept créatif plutôt que convaincre des partenaires.',
   'interest', 'A', 'E',
   'Concevoir l''identité créative et l''originalité d''un projet.',
   'Défendre le projet, négocier et convaincre des partenaires.'),
  (616, 'Pour mon futur métier, je préfère un lieu fixe et posé plutôt que des déplacements fréquents.',
   'field_office', 'bureau', 'terrain',
   'Exercer dans un cadre fixe, stable et posé.',
   'Se déplacer régulièrement sur différents lieux ou chantiers.'),
  (617, 'Dans un job d''été, je préfère bricoler et entretenir les lieux plutôt que gérer le suivi des stocks.',
   'interest', 'R', 'C',
   'Entretenir les lieux, bricoler et agir concrètement sur le matériel.',
   'Assurer le suivi des stocks, des commandes et du classement.'),
  (618, 'Pour mon avenir, je préfère une voie sûre et reconnue plutôt qu''un parcours atypique.',
   'risk_safety', 'securite', 'audace',
   'Privilégier une voie stable, reconnue et sécurisante.',
   'Choisir un parcours atypique ou indépendant.'),
  (619, 'Quand je maîtrise un sujet, je préfère l''expliquer aux autres plutôt que creuser encore plus loin.',
   'interest', 'S', 'I',
   'Expliquer, transmettre et aider les autres à comprendre un sujet.',
   'Approfondir et creuser un sujet complexe par curiosité.')
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
