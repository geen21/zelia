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
   'Démonter un objet pour comprendre une panne.', 'Étudier son schéma pour comprendre une panne.'),
  (601, 'Je préfère accompagner des patients pendant des soins plutôt que réparer du matériel en atelier.',
   'interest', 'S', 'R',
   'Accompagner des patients pendant des soins.', 'Réparer du matériel en atelier.'),
  (602, 'Je préfère avancer seul, quitte à bloquer, plutôt que caler mon rythme sur un groupe.',
   'solo_team', 'solo', 'equipe',
   'Avancer seul, quitte à rester bloqué.', 'Adapter son rythme à celui du groupe.'),
  (603, 'Je préfère refaire des mesures en labo plutôt que présenter une offre à des inconnus.',
   'interest', 'I', 'E',
   'Refaire des mesures en laboratoire.', 'Présenter une offre à des inconnus.'),
  (604, 'Je préfère inventer ma méthode, quitte à me tromper, plutôt que suivre un mode d''emploi.',
   'creative_structured', 'creatif', 'structure',
   'Inventer sa méthode, avec le risque de se tromper.', 'Suivre un mode d''emploi.'),
  (605, 'Pour un événement, je préfère refaire une affiche plutôt que vérifier le budget ligne par ligne.',
   'interest', 'A', 'C',
   'Retravailler une affiche pour un événement.', 'Vérifier le budget d''un événement ligne par ligne.'),
  (606, 'Je préfère me déplacer par tous les temps plutôt que rester assis au même endroit.',
   'field_office', 'terrain', 'bureau',
   'Se déplacer par tous les temps.', 'Travailler assis à un poste fixe.'),
  (607, 'Pour étudier une rivière, je préfère prélever dehors sous la pluie qu''analyser les données au calme.',
   'interest', 'R', 'I',
   'Faire des prélèvements dehors, même sous la pluie.', 'Analyser les données d''une rivière au calme.'),
  (608, 'Je préfère tester un outil nouveau, quitte à tout reprendre, plutôt que garder celui que je maîtrise.',
   'risk_safety', 'audace', 'securite',
   'Tester un outil nouveau, quitte à recommencer.', 'Garder un outil déjà maîtrisé.'),
  (609, 'Je préfère chercher des sponsors, malgré les refus, plutôt que réexpliquer un cours à un élève.',
   'interest', 'E', 'S',
   'Chercher des sponsors malgré les refus.', 'Réexpliquer un cours à un élève.'),
  (610, 'Je préfère vérifier les plans d''un objet plutôt que fabriquer et ajuster son prototype.',
   'hands_mind', 'tete', 'mains',
   'Vérifier les plans d''un objet.', 'Fabriquer et ajuster son prototype.'),
  (611, 'Je préfère vérifier des dossiers au calme plutôt qu''écouter des personnes et guider leurs démarches.',
   'interest', 'C', 'S',
   'Vérifier des dossiers au calme.', 'Écouter des personnes et les accompagner dans leurs démarches.'),
  (612, 'Je préfère chercher à plusieurs, même avec des interruptions, plutôt que rester seul au calme.',
   'solo_team', 'equipe', 'solo',
   'Chercher à plusieurs malgré les interruptions.', 'Chercher seul au calme.'),
  (613, 'Je préfère comprendre un résultat scientifique étrange plutôt que créer et remonter une vidéo.',
   'interest', 'I', 'A',
   'Comprendre un résultat scientifique inattendu.', 'Créer une vidéo et reprendre son montage.'),
  (614, 'Je préfère une commande très cadrée, même peu créative, plutôt qu''une demande ouverte.',
   'creative_structured', 'structure', 'creatif',
   'Suivre une commande très cadrée avec peu de liberté créative.', 'Répondre à une demande ouverte.'),
  (615, 'Pour une campagne, je préfère retravailler les visuels plutôt que convaincre des partenaires.',
   'interest', 'A', 'E',
   'Retravailler les visuels d''une campagne.', 'Convaincre des partenaires de soutenir une campagne.'),
  (616, 'Je préfère suivre un projet depuis un bureau plutôt que me déplacer souvent pour voir sur place.',
   'field_office', 'bureau', 'terrain',
   'Suivre un projet depuis un bureau.', 'Se déplacer souvent pour vérifier sur place.'),
  (617, 'Je préfère entretenir un potager, même salissant, plutôt que gérer les stocks et les commandes.',
   'interest', 'R', 'C',
   'Entretenir un potager malgré les tâches salissantes.', 'Gérer les stocks et les commandes.'),
  (618, 'À salaire égal, je préfère un projet connu, même répétitif, plutôt qu''un projet au résultat incertain.',
   'risk_safety', 'securite', 'audace',
   'Travailler sur un projet connu, même répétitif.', 'Travailler sur un projet au résultat incertain, à salaire égal.'),
  (619, 'Je préfère animer un groupe, même agité, plutôt que chercher une erreur dans un programme.',
   'interest', 'S', 'I',
   'Animer un groupe, même agité.', 'Chercher une erreur dans un programme.')
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
