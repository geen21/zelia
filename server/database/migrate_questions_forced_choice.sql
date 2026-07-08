-- Migration: replace the 50 Oui/Non inscription questions with 20 forced-choice questions
-- Run this in the Supabase SQL editor.
--
-- 1) Adds an `options` JSONB column on public.questions (ordered pair of answer options).
-- 2) Renames the old questionnaire_type='inscription' rows to 'inscription_legacy_v1'
--    (kept so historical user_responses keep their FK + meaning).
-- 3) Inserts 20 new forced-choice questions (ids 200-219), 4 per axis:
--      hands_mind          : manuel/concret        vs analytique/reflexion
--      solo_team           : autonomie             vs collectif
--      creative_structured : creatif/spontane      vs structure/methodique
--      field_office        : terrain/mouvement     vs bureau/calme
--      risk_safety         : audace/prise de risque vs securite/preparation
--    `category` = axis id, `options` = [{label, value}, {label, value}] (value = pole slug),
--    `interpretations` keyed by the option LABEL (the client submits the label as the
--    response, which routes/analysis.js resolves via interpretations[response]).

BEGIN;

ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS options JSONB;

UPDATE public.questions
SET questionnaire_type = 'inscription_legacy_v1'
WHERE questionnaire_type = 'inscription';

INSERT INTO public.questions (id, content, category, questionnaire_type, options, interpretations) VALUES
-- === Axe hands_mind (mains vs tete) ===
(200, 'Ton projet idéal, ce serait plutôt...', 'hands_mind', 'inscription',
 '[{"label": "Construire un objet de A à Z", "value": "mains"}, {"label": "Résoudre une énigme complexe", "value": "tete"}]',
 '{"Construire un objet de A à Z": "Attirance pour le concret et le travail manuel : métiers de l''artisanat, du bâtiment, de la maintenance, du design produit ou de la restauration.", "Résoudre une énigme complexe": "Goût pour l''analyse et la réflexion : métiers de l''ingénierie, de la recherche, de l''informatique, du droit ou de la data."}'),
(201, 'Un samedi libre, tu préfères...', 'hands_mind', 'inscription',
 '[{"label": "Bricoler, cuisiner, créer de tes mains", "value": "mains"}, {"label": "Lire, débattre, comprendre un sujet", "value": "tete"}]',
 '{"Bricoler, cuisiner, créer de tes mains": "Besoin de manipuler et de voir un résultat tangible : métiers techniques, culinaires, artisanaux ou de production.", "Lire, débattre, comprendre un sujet": "Curiosité intellectuelle marquée : métiers de l''enseignement, du journalisme, de la stratégie ou de l''analyse."}'),
(202, 'En cours, tu accroches plus quand...', 'hands_mind', 'inscription',
 '[{"label": "On manipule, on teste, on fabrique", "value": "mains"}, {"label": "On analyse et on comprend la théorie", "value": "tete"}]',
 '{"On manipule, on teste, on fabrique": "Apprentissage par la pratique : filières professionnelles, technologiques, ateliers et alternance lui conviennent bien.", "On analyse et on comprend la théorie": "Apprentissage par les concepts : filières générales, classes préparatoires et université lui conviennent bien."}'),
(203, 'On te confie une mission, tu choisis...', 'hands_mind', 'inscription',
 '[{"label": "Réparer un truc cassé", "value": "mains"}, {"label": "Trouver pourquoi ça a cassé", "value": "tete"}]',
 '{"Réparer un truc cassé": "Orientation solution et geste technique : maintenance, mécanique, électrotechnique, prototypage.", "Trouver pourquoi ça a cassé": "Orientation diagnostic et investigation : qualité, R&D, audit, sciences, cybersécurité."}'),

-- === Axe solo_team (solo vs equipe) ===
(204, 'Pour un exposé, tu préfères...', 'solo_team', 'inscription',
 '[{"label": "Le faire en solo, tranquille", "value": "solo"}, {"label": "Le faire en groupe, à plusieurs cerveaux", "value": "equipe"}]',
 '{"Le faire en solo, tranquille": "Autonomie forte : métiers où l''on gère son propre périmètre (développeur, graphiste, artisan, chercheur, traducteur).", "Le faire en groupe, à plusieurs cerveaux": "Énergie collective : métiers de projet, d''équipe et de coordination (chef de projet, soignant, commercial, événementiel)."}'),
(205, 'Ta journée parfaite, c''est...', 'solo_team', 'inscription',
 '[{"label": "Un moment calme rien qu''à toi", "value": "solo"}, {"label": "Une journée entouré(e) de monde", "value": "equipe"}]',
 '{"Un moment calme rien qu''à toi": "Se ressource seul(e) : environnements de travail calmes, missions en autonomie, télétravail.", "Une journée entouré(e) de monde": "Se ressource au contact des autres : métiers relationnels, accueil, animation, vente, enseignement."}'),
(206, 'Quand tu réussis un truc...', 'solo_team', 'inscription',
 '[{"label": "Tu savoures dans ton coin", "value": "solo"}, {"label": "Tu fêtes ça avec les autres", "value": "equipe"}]',
 '{"Tu savoures dans ton coin": "Motivation intrinsèque : avance bien sur des objectifs personnels et des expertises pointues.", "Tu fêtes ça avec les autres": "Motivation partagée : s''épanouit dans les réussites collectives et les dynamiques d''équipe."}'),
(207, 'Dans un jeu, tu joues plutôt...', 'solo_team', 'inscription',
 '[{"label": "Solo, à ton rythme", "value": "solo"}, {"label": "En équipe, en vocal", "value": "equipe"}]',
 '{"Solo, à ton rythme": "Préfère maîtriser son rythme et ses décisions : métiers d''expertise individuelle.", "En équipe, en vocal": "Aime la coopération et la communication en direct : métiers d''équipe, coordination, esports, animation."}'),

-- === Axe creative_structured (creatif vs structure) ===
(208, 'Ton bureau ressemble à...', 'creative_structured', 'inscription',
 '[{"label": "Un joyeux bazar créatif", "value": "creatif"}, {"label": "Un espace rangé au carré", "value": "structure"}]',
 '{"Un joyeux bazar créatif": "Fonctionne à l''inspiration : métiers créatifs (design, arts, communication, contenu, mode).", "Un espace rangé au carré": "Fonctionne à l''organisation : métiers de gestion, logistique, comptabilité, administration, qualité."}'),
(209, 'Pour lancer un projet, tu commences par...', 'creative_structured', 'inscription',
 '[{"label": "Tester des idées au feeling", "value": "creatif"}, {"label": "Faire un plan étape par étape", "value": "structure"}]',
 '{"Tester des idées au feeling": "Démarche exploratoire et itérative : innovation, création, startup, prototypage.", "Faire un plan étape par étape": "Démarche méthodique : gestion de projet, ingénierie, planification, finance."}'),
(210, 'Tu préfères les consignes...', 'creative_structured', 'inscription',
 '[{"label": "Libres : carte blanche !", "value": "creatif"}, {"label": "Claires : un cadre précis", "value": "structure"}]',
 '{"Libres : carte blanche !": "A besoin de liberté pour donner le meilleur : métiers artistiques, entrepreneuriat, conception.", "Claires : un cadre précis": "A besoin d''un cadre pour exceller : métiers réglementés, technique normée, secteur public, banque."}'),
(211, 'Ton super-pouvoir, ce serait...', 'creative_structured', 'inscription',
 '[{"label": "Inventer ce qui n''existe pas", "value": "creatif"}, {"label": "Organiser n''importe quel chaos", "value": "structure"}]',
 '{"Inventer ce qui n''existe pas": "Imagination et originalité : création, innovation, direction artistique, écriture, R&D.", "Organiser n''importe quel chaos": "Rigueur et sens de l''organisation : opérations, supply chain, événementiel, gestion, administration."}'),

-- === Axe field_office (terrain vs bureau) ===
(212, 'Ton futur job de rêve se passe...', 'field_office', 'inscription',
 '[{"label": "Dehors, en mouvement", "value": "terrain"}, {"label": "Au calme, dans un bureau", "value": "bureau"}]',
 '{"Dehors, en mouvement": "Besoin de bouger : métiers de terrain (environnement, sport, agriculture, BTP, secours, tourisme).", "Au calme, dans un bureau": "Préfère un environnement posé : métiers de bureau (informatique, gestion, études, création numérique)."}'),
(213, 'Tu préfères apprendre...', 'field_office', 'inscription',
 '[{"label": "Sur le terrain, en vrai", "value": "terrain"}, {"label": "Dans les livres et les vidéos", "value": "bureau"}]',
 '{"Sur le terrain, en vrai": "Apprend en faisant : stages, alternance et immersion professionnelle sont ses meilleurs leviers.", "Dans les livres et les vidéos": "Apprend en étudiant : formations académiques et contenus théoriques lui réussissent."}'),
(214, 'Une super journée, c''est...', 'field_office', 'inscription',
 '[{"label": "Bouger, changer de lieu", "value": "terrain"}, {"label": "Un cocon fixe et confortable", "value": "bureau"}]',
 '{"Bouger, changer de lieu": "Aime la variété et le mouvement : métiers itinérants, transport, commerce terrain, reportage.", "Un cocon fixe et confortable": "Aime la stabilité du cadre de travail : métiers sédentaires et environnements maîtrisés."}'),
(215, 'Pour aider une asso, tu choisis...', 'field_office', 'inscription',
 '[{"label": "L''action sur place", "value": "terrain"}, {"label": "La gestion derrière l''écran", "value": "bureau"}]',
 '{"L''action sur place": "Engagement concret et humain : social, humanitaire, animation, santé, sécurité.", "La gestion derrière l''écran": "Engagement organisationnel : communication, gestion, collecte de fonds, web, coordination à distance."}'),

-- === Axe risk_safety (audace vs securite) ===
(216, 'Face à un choix important, tu...', 'risk_safety', 'inscription',
 '[{"label": "Fonces, tu verras bien !", "value": "audace"}, {"label": "Pèses le pour et le contre", "value": "securite"}]',
 '{"Fonces, tu verras bien !": "Goût du risque et de la décision rapide : entrepreneuriat, commerce, urgences, création.", "Pèses le pour et le contre": "Prudence et discernement : métiers d''analyse, de conseil, de gestion des risques, de santé."}'),
(217, 'Ton aventure idéale...', 'risk_safety', 'inscription',
 '[{"label": "Partir sans tout planifier", "value": "audace"}, {"label": "Un itinéraire bien préparé", "value": "securite"}]',
 '{"Partir sans tout planifier": "À l''aise avec l''imprévu : environnements changeants, startups, international, freelancing.", "Un itinéraire bien préparé": "A besoin de visibilité : parcours balisés, grandes structures, concours, fonction publique."}'),
(218, 'Un projet un peu fou se présente...', 'risk_safety', 'inscription',
 '[{"label": "Tu tentes, tant pis si ça rate", "value": "audace"}, {"label": "Tu assures tes arrières d''abord", "value": "securite"}]',
 '{"Tu tentes, tant pis si ça rate": "Voit l''échec comme un apprentissage : innovation, création d''entreprise, spectacle, sport.", "Tu assures tes arrières d''abord": "Avance par étapes sécurisées : banque, assurance, ingénierie, administration, santé."}'),
(219, 'Plus tard, tu te vois plutôt...', 'risk_safety', 'inscription',
 '[{"label": "Créer ta propre boîte", "value": "audace"}, {"label": "Un métier stable qui rassure", "value": "securite"}]',
 '{"Créer ta propre boîte": "Fibre entrepreneuriale : indépendance, création d''activité, pilotage de projets ambitieux.", "Un métier stable qui rassure": "Recherche de sécurité professionnelle : CDI, secteurs pérennes, métiers en tension, fonction publique."}')
ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  questionnaire_type = EXCLUDED.questionnaire_type,
  options = EXCLUDED.options,
  interpretations = EXCLUDED.interpretations;

COMMIT;
