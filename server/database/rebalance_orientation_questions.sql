-- Rebalance orientation interpretations for existing databases.
-- Run this after migrate_questions_forced_choice.sql in the Supabase SQL editor.

BEGIN;

UPDATE public.questions
SET interpretations = jsonb_set(
  COALESCE(interpretations, '{}'::jsonb),
  ARRAY['Résoudre une énigme complexe'],
  to_jsonb('Goût pour l''analyse et la réflexion : métiers du droit, de la recherche, de la médecine, de l''ingénierie ou de la psychologie.'::text),
  true
)
WHERE id = 200;

UPDATE public.questions
SET interpretations = jsonb_set(
  COALESCE(interpretations, '{}'::jsonb),
  ARRAY['Trouver pourquoi ça a cassé'],
  to_jsonb('Orientation diagnostic et investigation : maintenance industrielle, diagnostic mécanique, inspection BTP, enquête ou analyse scientifique.'::text),
  true
)
WHERE id = 203;

UPDATE public.questions
SET interpretations = jsonb_set(
  COALESCE(interpretations, '{}'::jsonb),
  ARRAY['Le faire en solo, tranquille'],
  to_jsonb('Autonomie forte : métiers où l''on gère son propre périmètre (avocat, artisan, architecte, chercheur, traducteur).'::text),
  true
)
WHERE id = 204;

UPDATE public.questions
SET interpretations = jsonb_set(
  COALESCE(interpretations, '{}'::jsonb),
  ARRAY['Tester des idées au feeling'],
  to_jsonb('Démarche exploratoire et itérative : innovation, création, événementiel, prototypage, artisanat d''art.'::text),
  true
)
WHERE id = 209;

UPDATE public.questions
SET interpretations = jsonb_set(
  COALESCE(interpretations, '{}'::jsonb),
  ARRAY['Dehors, en mouvement'],
  to_jsonb('Besoin de bouger : métiers de terrain (BTP, transport, agriculture, environnement, secours, sport, tourisme).'::text),
  true
)
WHERE id = 212;

UPDATE public.questions
SET interpretations = jsonb_set(
  COALESCE(interpretations, '{}'::jsonb),
  ARRAY['Au calme, dans un bureau'],
  to_jsonb('Préfère un environnement posé : métiers de bureau (droit, comptabilité, gestion, rédaction, traduction, design).'::text),
  true
)
WHERE id = 212;

UPDATE public.questions
SET interpretations = jsonb_set(
  COALESCE(interpretations, '{}'::jsonb),
  ARRAY['La gestion derrière l''écran'],
  to_jsonb('Engagement organisationnel : communication, gestion, comptabilité, collecte de fonds, coordination à distance.'::text),
  true
)
WHERE id = 215;

UPDATE public.questions
SET interpretations = jsonb_set(
  COALESCE(interpretations, '{}'::jsonb),
  ARRAY['Partir sans tout planifier'],
  to_jsonb('À l''aise avec l''imprévu : environnements changeants, voyage, projets événementiels, international, indépendance.'::text),
  true
)
WHERE id = 217;

COMMIT;