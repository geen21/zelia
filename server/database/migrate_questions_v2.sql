-- Migration: orientation questionnaire v2 (4-point scale, no duplicates, interests).
-- Run this in the Supabase SQL editor after migrate_questions_forced_choice.sql.
--
-- 1) Renames the v1 forced-choice questions (questionnaire_type='inscription', ids 200-219)
--    to 'inscription_legacy_v2' so historical user_responses keep their FK + meaning.
-- 2) Inserts 20 questions (ids 300-319, ordered for display so axes and interests alternate):
--    - 15 axis questions, 3 per axis (hands_mind, solo_team, creative_structured,
--      field_office, risk_safety). `category` = axis id, `options` = [{label, value: pole}].
--      Choices shown: "Plutôt A / Un peu A / Un peu B / Plutôt B". The client stores
--      "Plutôt : <label>" or "Un peu : <label>"; interpretations are keyed by the bare option
--      label (routes/analysis.js strips the strength prefix).
--      Interpretations are the v1 texts, unchanged, taken from the equivalent v1 question:
--      300<-200, 301<-204, 302<-210, 304<-212, 305<-216, 306<-202, 308<-207, 309<-211,
--      310<-214, 312<-217, 313<-203, 314<-205, 316<-208, 317<-215, 318<-219.
--    - 5 interest questions (RIASEC R, I, A, S, E), sent to the LLM only (the persona is
--      computed from the axes). `category` = 'interest',
--      `options` = 4 levels [{label, value: code, level}], interpretations keyed by level label.
--    Keep client/src/lib/questionScale.js and client/src/lib/personas.js aligned.

BEGIN;

ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS options JSONB;

UPDATE public.questions
SET questionnaire_type = 'inscription_legacy_v2'
WHERE questionnaire_type = 'inscription';

INSERT INTO public.questions (id, content, category, questionnaire_type, options, interpretations) VALUES
(300, 'Le cours ou l''atelier qui te tente le plus...', 'hands_mind', 'inscription',
 '[{"label": "Monter, réparer ou fabriquer quelque chose", "value": "mains"}, {"label": "Mener une expérience et analyser les résultats", "value": "tete"}]',
 '{"Monter, réparer ou fabriquer quelque chose": "Attirance pour le concret et le travail manuel : métiers de l''artisanat, du bâtiment, de la maintenance, du design produit ou de la restauration.", "Mener une expérience et analyser les résultats": "Goût pour l''analyse et la réflexion : métiers du droit, de la recherche, de la médecine, de l''ingénierie ou de la psychologie."}'),
(301, 'Pour un exposé noté, tu préfères...', 'solo_team', 'inscription',
 '[{"label": "Le préparer seul·e, à ta façon", "value": "solo"}, {"label": "Le préparer en groupe", "value": "equipe"}]',
 '{"Le préparer seul·e, à ta façon": "Autonomie forte : métiers où l''on gère son propre périmètre (avocat, artisan, architecte, chercheur, traducteur).", "Le préparer en groupe": "Énergie collective : métiers de projet, d''équipe et de coordination (chef de projet, soignant, commercial, événementiel)."}'),
(302, 'Pour un devoir, tu préfères des consignes...', 'creative_structured', 'inscription',
 '[{"label": "Libres : tu fais à ta façon", "value": "creatif"}, {"label": "Précises : tu sais exactement quoi rendre", "value": "structure"}]',
 '{"Libres : tu fais à ta façon": "A besoin de liberté pour donner le meilleur : métiers artistiques, entrepreneuriat, conception.", "Précises : tu sais exactement quoi rendre": "A besoin d''un cadre pour exceller : métiers réglementés, technique normée, secteur public, banque."}'),
(303, 'Ça te plairait de travailler avec des outils, des machines, des matériaux ou la nature ?', 'interest', 'inscription',
 '[{"label": "Pas du tout", "value": "R", "level": 0}, {"label": "Plutôt pas", "value": "R", "level": 1}, {"label": "Plutôt oui", "value": "R", "level": 2}, {"label": "Carrément", "value": "R", "level": 3}]',
 '{"Pas du tout": "Pas d''attrait pour le travail technique, manuel ou en lien avec la nature : artisanat, BTP, mécanique et agriculture peu motivants.", "Plutôt pas": "Attrait faible pour le travail technique, manuel ou en lien avec la nature.", "Plutôt oui": "Attrait pour le concret et la technique : artisanat, BTP, maintenance, mécanique, agriculture, environnement.", "Carrément": "Fort attrait pour le concret et la technique : artisanat, BTP, maintenance, mécanique, agriculture, environnement."}'),
(304, 'Ton futur métier se passe plutôt...', 'field_office', 'inscription',
 '[{"label": "Sur le terrain, en extérieur, en mouvement", "value": "terrain"}, {"label": "À un poste fixe, au calme", "value": "bureau"}]',
 '{"Sur le terrain, en extérieur, en mouvement": "Besoin de bouger : métiers de terrain (BTP, transport, agriculture, environnement, secours, sport, tourisme).", "À un poste fixe, au calme": "Préfère un environnement posé : métiers de bureau (droit, comptabilité, gestion, rédaction, traduction, design)."}'),
(305, 'Face à une décision importante, tu...', 'risk_safety', 'inscription',
 '[{"label": "Tranches vite et ajustes en route", "value": "audace"}, {"label": "Prends le temps de tout peser", "value": "securite"}]',
 '{"Tranches vite et ajustes en route": "Goût du risque et de la décision rapide : entrepreneuriat, commerce, urgences, création.", "Prends le temps de tout peser": "Prudence et discernement : métiers d''analyse, de conseil, de gestion des risques, de santé."}'),
(306, 'Tu comprends le mieux quand...', 'hands_mind', 'inscription',
 '[{"label": "Tu essaies toi-même, en manipulant", "value": "mains"}, {"label": "On t''explique pourquoi ça marche", "value": "tete"}]',
 '{"Tu essaies toi-même, en manipulant": "Apprentissage par la pratique : filières professionnelles, technologiques, ateliers et alternance lui conviennent bien.", "On t''explique pourquoi ça marche": "Apprentissage par les concepts : filières générales, classes préparatoires et université lui conviennent bien."}'),
(307, 'Ça te plairait d''aider, soigner, conseiller ou faire progresser des personnes ?', 'interest', 'inscription',
 '[{"label": "Pas du tout", "value": "S", "level": 0}, {"label": "Plutôt pas", "value": "S", "level": 1}, {"label": "Plutôt oui", "value": "S", "level": 2}, {"label": "Carrément", "value": "S", "level": 3}]',
 '{"Pas du tout": "Pas d''attrait pour les métiers centrés sur l''aide aux personnes : santé, social et enseignement peu motivants.", "Plutôt pas": "Attrait faible pour les métiers centrés sur l''aide aux personnes.", "Plutôt oui": "Attrait pour l''aide aux personnes : santé, social, enseignement, animation, conseil, accompagnement.", "Carrément": "Fort attrait pour l''aide aux personnes : santé, social, enseignement, animation, conseil, accompagnement."}'),
(308, 'Dans un projet de groupe, ton rôle naturel...', 'solo_team', 'inscription',
 '[{"label": "Avancer sur ta partie, en autonomie", "value": "solo"}, {"label": "Coordonner et motiver tout le monde", "value": "equipe"}]',
 '{"Avancer sur ta partie, en autonomie": "Préfère maîtriser son rythme et ses décisions : métiers d''expertise individuelle.", "Coordonner et motiver tout le monde": "Aime la coopération et la communication en direct : métiers d''équipe, coordination, esports, animation."}'),
(309, 'Pour organiser une fête, tu t''occupes de...', 'creative_structured', 'inscription',
 '[{"label": "La déco, la musique, l''ambiance", "value": "creatif"}, {"label": "La liste, le budget et le planning", "value": "structure"}]',
 '{"La déco, la musique, l''ambiance": "Imagination et originalité : création, innovation, direction artistique, écriture, R&D.", "La liste, le budget et le planning": "Rigueur et sens de l''organisation : opérations, supply chain, événementiel, gestion, administration."}'),
(310, 'Rester assis·e presque toute la journée...', 'field_office', 'inscription',
 '[{"label": "Impossible, j''ai besoin de bouger", "value": "terrain"}, {"label": "Pas un problème si le travail m''intéresse", "value": "bureau"}]',
 '{"Impossible, j''ai besoin de bouger": "Aime la variété et le mouvement : métiers itinérants, transport, commerce terrain, reportage.", "Pas un problème si le travail m''intéresse": "Aime la stabilité du cadre de travail : métiers sédentaires et environnements maîtrisés."}'),
(311, 'Ça te plairait de créer, dessiner, écrire, jouer, filmer ou composer ?', 'interest', 'inscription',
 '[{"label": "Pas du tout", "value": "A", "level": 0}, {"label": "Plutôt pas", "value": "A", "level": 1}, {"label": "Plutôt oui", "value": "A", "level": 2}, {"label": "Carrément", "value": "A", "level": 3}]',
 '{"Pas du tout": "Pas d''attrait pour la création et l''expression artistique : arts, design et audiovisuel peu motivants.", "Plutôt pas": "Attrait faible pour la création et l''expression artistique.", "Plutôt oui": "Attrait pour la création : design, arts, communication, audiovisuel, écriture, mode, spectacle.", "Carrément": "Fort attrait pour la création : design, arts, communication, audiovisuel, écriture, mode, spectacle."}'),
(312, 'Pour tes études, tu préfères...', 'risk_safety', 'inscription',
 '[{"label": "Un parcours original, même peu connu", "value": "audace"}, {"label": "Une voie reconnue qui ouvre des portes", "value": "securite"}]',
 '{"Un parcours original, même peu connu": "À l''aise avec l''imprévu : environnements changeants, voyage, projets événementiels, international, indépendance.", "Une voie reconnue qui ouvre des portes": "A besoin de visibilité : parcours balisés, grandes structures, concours, fonction publique."}'),
(313, 'À la fin d''une journée de travail, tu serais fier·e d''avoir...', 'hands_mind', 'inscription',
 '[{"label": "Fabriqué ou réparé un truc qui marche", "value": "mains"}, {"label": "Résolu un problème compliqué", "value": "tete"}]',
 '{"Fabriqué ou réparé un truc qui marche": "Orientation solution et geste technique : maintenance, mécanique, électrotechnique, prototypage.", "Résolu un problème compliqué": "Orientation diagnostic et investigation : maintenance industrielle, diagnostic mécanique, inspection BTP, enquête ou analyse scientifique."}'),
(314, 'Au travail, tu te verrais plutôt...', 'solo_team', 'inscription',
 '[{"label": "Expert·e de ton sujet, en autonomie", "value": "solo"}, {"label": "Au contact des gens toute la journée", "value": "equipe"}]',
 '{"Expert·e de ton sujet, en autonomie": "Se ressource seul(e) : environnements de travail calmes, missions en autonomie, télétravail.", "Au contact des gens toute la journée": "Se ressource au contact des autres : métiers relationnels, accueil, animation, vente, enseignement."}'),
(315, 'Ça te plairait de chercher, expérimenter, comprendre comment fonctionnent les choses (sciences, corps humain, numérique) ?', 'interest', 'inscription',
 '[{"label": "Pas du tout", "value": "I", "level": 0}, {"label": "Plutôt pas", "value": "I", "level": 1}, {"label": "Plutôt oui", "value": "I", "level": 2}, {"label": "Carrément", "value": "I", "level": 3}]',
 '{"Pas du tout": "Pas d''attrait pour les sciences et la démarche d''investigation : recherche et laboratoire peu motivants.", "Plutôt pas": "Attrait faible pour les sciences et la démarche d''investigation.", "Plutôt oui": "Attrait pour les sciences et l''investigation : recherche, médecine, ingénierie, informatique, laboratoire, data.", "Carrément": "Fort attrait pour les sciences et l''investigation : recherche, médecine, ingénierie, informatique, laboratoire, data."}'),
(316, 'Dans un job d''été en magasin, tu préférerais...', 'creative_structured', 'inscription',
 '[{"label": "Créer les visuels et la vitrine", "value": "creatif"}, {"label": "Gérer les stocks et les commandes", "value": "structure"}]',
 '{"Créer les visuels et la vitrine": "Fonctionne à l''inspiration : métiers créatifs (design, arts, communication, contenu, mode).", "Gérer les stocks et les commandes": "Fonctionne à l''organisation : métiers de gestion, logistique, comptabilité, administration, qualité."}'),
(317, 'Pour aider une association, tu choisis...', 'field_office', 'inscription',
 '[{"label": "Être sur place le jour J", "value": "terrain"}, {"label": "Gérer les inscriptions et la com en ligne", "value": "bureau"}]',
 '{"Être sur place le jour J": "Engagement concret et humain : social, humanitaire, animation, santé, sécurité.", "Gérer les inscriptions et la com en ligne": "Engagement organisationnel : communication, gestion, comptabilité, collecte de fonds, coordination à distance."}'),
(318, 'Plus tard, ton salaire idéal...', 'risk_safety', 'inscription',
 '[{"label": "Variable : plus tu réussis, plus tu gagnes", "value": "audace"}, {"label": "Fixe et sûr chaque mois", "value": "securite"}]',
 '{"Variable : plus tu réussis, plus tu gagnes": "Fibre entrepreneuriale : indépendance, création d''activité, pilotage de projets ambitieux.", "Fixe et sûr chaque mois": "Recherche de sécurité professionnelle : CDI, secteurs pérennes, métiers en tension, fonction publique."}'),
(319, 'Ça te plairait de convaincre, vendre, négocier ou diriger un projet ?', 'interest', 'inscription',
 '[{"label": "Pas du tout", "value": "E", "level": 0}, {"label": "Plutôt pas", "value": "E", "level": 1}, {"label": "Plutôt oui", "value": "E", "level": 2}, {"label": "Carrément", "value": "E", "level": 3}]',
 '{"Pas du tout": "Pas d''attrait pour la vente, la négociation ou le pilotage de projets : commerce et management peu motivants.", "Plutôt pas": "Attrait faible pour la vente, la négociation ou le pilotage de projets.", "Plutôt oui": "Attrait pour convaincre et entreprendre : commerce, vente, marketing, entrepreneuriat, management.", "Carrément": "Fort attrait pour convaincre et entreprendre : commerce, vente, marketing, entrepreneuriat, management, négociation."}')
ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  questionnaire_type = EXCLUDED.questionnaire_type,
  options = EXCLUDED.options,
  interpretations = EXCLUDED.interpretations;

COMMIT;
