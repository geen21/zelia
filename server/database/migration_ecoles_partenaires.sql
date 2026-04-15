-- Migration: Ecoles Partenaires & Contact Submissions
-- Run this after the existing setup.sql

-- Partner school formations table
CREATE TABLE IF NOT EXISTS ecoles_partenaires (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_name TEXT NOT NULL,
  formation_name TEXT NOT NULL,
  city TEXT NOT NULL,
  domain TEXT,
  diploma_level TEXT,
  description TEXT,
  link TEXT,
  contact_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User submissions (applications) to partner formations
CREATE TABLE IF NOT EXISTS contact_submitted (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  formation_id UUID NOT NULL REFERENCES ecoles_partenaires(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, formation_id)
);

-- RLS policies
ALTER TABLE ecoles_partenaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_submitted ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read formations
CREATE POLICY "Authenticated users can read formations"
  ON ecoles_partenaires FOR SELECT
  TO authenticated
  USING (true);

-- Users can read/insert their own submissions
CREATE POLICY "Users can read own submissions"
  ON contact_submitted FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own submissions"
  ON contact_submitted FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Service role can do everything
CREATE POLICY "Service role full access ecoles"
  ON ecoles_partenaires FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access contact"
  ON contact_submitted FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ecoles_city ON ecoles_partenaires(city);
CREATE INDEX IF NOT EXISTS idx_ecoles_school ON ecoles_partenaires(school_name);
CREATE INDEX IF NOT EXISTS idx_contact_user ON contact_submitted(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_formation ON contact_submitted(formation_id);

-- Seed data: MyDigitalSchool formations across 17 French cities
-- 20 formations x 17 cities = 340 rows

DO $$
DECLARE
  cities TEXT[] := ARRAY[
    'Angers', 'Bordeaux', 'Clermont-Ferrand', 'Grenoble', 'Laval',
    'Lille', 'Lyon', 'Montpellier', 'Nantes', 'Nice',
    'Paris', 'Rennes', 'Rouen', 'Saint-Quentin-en-Yvelines', 'Strasbourg',
    'Toulon', 'Toulouse'
  ];
  formations JSONB := '[
    {"name": "Bachelor Developpement Web", "domain": "Informatique", "level": "Bac+3", "desc": "Formation complete en developpement web front-end et back-end."},
    {"name": "Bachelor Marketing Digital", "domain": "Marketing", "level": "Bac+3", "desc": "Strategie digitale, SEO, reseaux sociaux et analytics."},
    {"name": "Bachelor Cybersecurite", "domain": "Informatique", "level": "Bac+3", "desc": "Protection des systemes d''information et securite reseau."},
    {"name": "Bachelor Data & IA", "domain": "Informatique", "level": "Bac+3", "desc": "Data science, machine learning et intelligence artificielle."},
    {"name": "Bachelor Design UX/UI", "domain": "Design", "level": "Bac+3", "desc": "Conception d''interfaces utilisateur et experience utilisateur."},
    {"name": "Bachelor Communication Digitale", "domain": "Communication", "level": "Bac+3", "desc": "Communication en ligne, content marketing et strategie editoriale."},
    {"name": "Bachelor E-commerce", "domain": "Commerce", "level": "Bac+3", "desc": "Vente en ligne, marketplaces et strategie e-commerce."},
    {"name": "Bachelor Gestion de Projet Digital", "domain": "Management", "level": "Bac+3", "desc": "Gestion de projets numeriques, methodes agiles et pilotage."},
    {"name": "Bachelor Audiovisuel & Motion Design", "domain": "Design", "level": "Bac+3", "desc": "Creation video, motion design et post-production."},
    {"name": "Bachelor Jeux Video", "domain": "Informatique", "level": "Bac+3", "desc": "Game design, developpement et production de jeux video."},
    {"name": "MBA Expert Developpement Web", "domain": "Informatique", "level": "Bac+5", "desc": "Expertise avancee en architectures web et DevOps."},
    {"name": "MBA Expert Marketing Digital", "domain": "Marketing", "level": "Bac+5", "desc": "Direction marketing digital, growth hacking et strategie data-driven."},
    {"name": "MBA Expert Cybersecurite", "domain": "Informatique", "level": "Bac+5", "desc": "Expert en securite des SI, audit et conformite."},
    {"name": "MBA Expert Data & IA", "domain": "Informatique", "level": "Bac+5", "desc": "Expertise en data engineering, deep learning et MLOps."},
    {"name": "MBA Expert UX Design", "domain": "Design", "level": "Bac+5", "desc": "Direction artistique digitale et recherche UX avancee."},
    {"name": "MBA Expert E-business", "domain": "Commerce", "level": "Bac+5", "desc": "Strategie e-business, transformation digitale et innovation."},
    {"name": "MBA Expert Chef de Projet Digital", "domain": "Management", "level": "Bac+5", "desc": "Direction de projets digitaux complexes et transformation."},
    {"name": "Preparatoire Numerique", "domain": "Informatique", "level": "Post-bac", "desc": "Annee preparatoire aux metiers du numerique."},
    {"name": "BTS SIO (SLAM)", "domain": "Informatique", "level": "Bac+2", "desc": "Solutions logicielles et applications metiers."},
    {"name": "BTS SIO (SISR)", "domain": "Informatique", "level": "Bac+2", "desc": "Solutions d''infrastructure et reseaux."}
  ]';
  city TEXT;
  formation JSONB;
BEGIN
  FOREACH city IN ARRAY cities LOOP
    FOR formation IN SELECT * FROM jsonb_array_elements(formations) LOOP
      INSERT INTO ecoles_partenaires (school_name, formation_name, city, domain, diploma_level, description)
      VALUES (
        'MyDigitalSchool',
        formation->>'name',
        city,
        formation->>'domain',
        formation->>'level',
        formation->>'desc'
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
