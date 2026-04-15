-- Seed data: MyDigitalSchool formations (340 rows)
-- 17 cities × 20 formations per city
-- Run AFTER migration_ecoles_partenaires.sql (table must exist)

-- Clear existing data
DELETE FROM contact_submitted;
DELETE FROM ecoles_partenaires;

DO $$
DECLARE
  cities TEXT[] := ARRAY[
    'Angers', 'Annecy', 'Bordeaux', 'Caen', 'Grenoble',
    'Lille', 'Lyon', 'Melun', 'Montpellier', 'Nancy',
    'Nantes', 'Nice', 'Paris', 'Rennes', 'St-Quentin-en-Yvelines',
    'Toulouse', 'Vannes'
  ];
  formations JSONB := '[
    {"name": "Bachelor Digital Design",          "level": "Bac+2", "info": "Pré-requis: Bac, Alt. possible"},
    {"name": "Bachelor Informatique",            "level": "Bac+2", "info": "Pré-requis: Bac, Alt. possible"},
    {"name": "Bachelor Marketing Digital",       "level": "Bac+2", "info": "Pré-requis: Bac, Alt. possible"},
    {"name": "BTS SIO",                          "level": "Bac+2", "info": "Pré-requis: Bac, Alt. possible"},
    {"name": "Bachelor Chargé d''Affaires Web",  "level": "Bac+3", "info": "Pré-requis: Bac+2, Alt. majoritaire"},
    {"name": "Bachelor Chef de Projet Digital",  "level": "Bac+3", "info": "Pré-requis: Bac+2, Alt. majoritaire"},
    {"name": "Bachelor Création Numérique",      "level": "Bac+3", "info": "Pré-requis: Bac+2, Alt. majoritaire"},
    {"name": "Bachelor Cyber & Réseau",          "level": "Bac+3", "info": "Pré-requis: Bac+2, Alt. majoritaire"},
    {"name": "Bachelor Data Analyst & IA",       "level": "Bac+3", "info": "Pré-requis: Bac+2, Alt. majoritaire"},
    {"name": "Bachelor Développeur Web",         "level": "Bac+3", "info": "Pré-requis: Bac+2, Alt. majoritaire"},
    {"name": "Bachelor UX/UI Design",            "level": "Bac+3", "info": "Pré-requis: Bac+2, Alt. majoritaire"},
    {"name": "Bachelor Webmarketing",            "level": "Bac+3", "info": "Pré-requis: Bac+2, Alt. majoritaire"},
    {"name": "MBA Big Data & IA",                "level": "Bac+5", "info": "Pré-requis: Bac+3, Alternance"},
    {"name": "MBA Cyber & Réseau",               "level": "Bac+5", "info": "Pré-requis: Bac+3, Alternance"},
    {"name": "MBA Développeur Full-Stack",       "level": "Bac+5", "info": "Pré-requis: Bac+3, Alternance"},
    {"name": "MBA Direction Artistique Digitale","level": "Bac+5", "info": "Pré-requis: Bac+3, Alternance"},
    {"name": "MBA Entrepreneuriat & Digital",    "level": "Bac+5", "info": "Pré-requis: Bac+3, Alternance"},
    {"name": "MBA Expert Marketing Digital",     "level": "Bac+5", "info": "Pré-requis: Bac+3, Alternance"},
    {"name": "MBA Lead UX/UI Designer",          "level": "Bac+5", "info": "Pré-requis: Bac+3, Alternance"},
    {"name": "MBA Management Projet Digital",    "level": "Bac+5", "info": "Pré-requis: Bac+3, Alternance"}
  ]';
  city TEXT;
  formation JSONB;
BEGIN
  FOREACH city IN ARRAY cities LOOP
    FOR formation IN SELECT * FROM jsonb_array_elements(formations) LOOP
      INSERT INTO ecoles_partenaires (school_name, formation_name, city, diploma_level, description)
      VALUES (
        'MyDigitalSchool',
        formation->>'name',
        city,
        formation->>'level',
        formation->>'info'
      );
    END LOOP;
  END LOOP;
END $$;
