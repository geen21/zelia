-- Ce fichier contient les commandes SQL pour optimiser la recherche dans la table metiers_france
-- et créer une fonction RPC pour une recherche plus rapide.
-- A exécuter dans l'éditeur SQL de Supabase.

-- 1. Activer l'extension pg_trgm pour la recherche de texte partielle rapide (si pas déjà active)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Créer des index ESSENTIELS pour accélérer les recherches sur 230k entrées
-- Index GIN sur l'intitulé pour la recherche textuelle ILIKE optimisée
CREATE INDEX IF NOT EXISTS idx_metiers_france_intitule_trgm ON metiers_france USING gin (intitule gin_trgm_ops);

-- Index composite CRITIQUE sur dateactualisation + id pour le tri (évite scan complet)
CREATE INDEX IF NOT EXISTS idx_metiers_france_dateact_id ON metiers_france (dateactualisation DESC NULLS LAST, id DESC);

-- Index sur la date d'actualisation seule pour les filtres temporels
CREATE INDEX IF NOT EXISTS idx_metiers_france_dateactualisation ON metiers_france (dateactualisation DESC);

-- Index pour les filtres communs (optionnel mais recommandé)
CREATE INDEX IF NOT EXISTS idx_metiers_france_typecontrat ON metiers_france (typecontrat);
CREATE INDEX IF NOT EXISTS idx_metiers_france_alternance ON metiers_france (alternance);

-- 3. Créer la fonction RPC OPTIMISÉE pour la recherche
-- Cette fonction remplace la requête complexe côté client par une procédure stockée performante
DROP FUNCTION IF EXISTS search_metiers(text, text, boolean, text, integer, integer);
CREATE OR REPLACE FUNCTION search_metiers(
    search_term text DEFAULT NULL,
    p_typecontrat text DEFAULT NULL,
    p_alternance boolean DEFAULT NULL,
    p_location text DEFAULT NULL,
    p_limit int DEFAULT 20,
    p_offset int DEFAULT 0
)
RETURNS TABLE (
    id bigint,
    intitule text,
    romecode text,
    dateactualisation timestamp,
    typecontrat text,
    lieutravail_libelle text,
    entreprise_nom text
)
LANGUAGE plpgsql
AS $$
DECLARE
    clean_term text;
    date_limit timestamp;
BEGIN
    -- Nettoyer et normaliser le terme de recherche
    clean_term := TRIM(COALESCE(search_term, ''));
    
    -- CRITIQUE: Toujours limiter la fenêtre temporelle pour éviter full scan sur 230k entrées
    IF clean_term != '' AND LENGTH(clean_term) <= 4 THEN
        -- Requêtes courtes: fenêtre de 60 jours
        date_limit := NOW() - INTERVAL '60 days';
    ELSIF clean_term != '' THEN
        -- Requêtes longues: fenêtre de 90 jours
        date_limit := NOW() - INTERVAL '90 days';
    ELSE
        -- Pas de recherche: fenêtre de 14 jours seulement
        date_limit := NOW() - INTERVAL '14 days';
    END IF;
    
    RETURN QUERY
    SELECT
        m.id,
        m.intitule,
        m.romecode,
        m.dateactualisation,
        m.typecontrat,
        m.lieutravail_libelle,
        m.entreprise_nom
    FROM metiers_france m
    WHERE
        -- Filtre temporel OBLIGATOIRE pour limiter le scan
        m.dateactualisation >= date_limit
        -- Recherche textuelle
        AND (clean_term = '' OR m.intitule ILIKE '%' || clean_term || '%')
        -- Filtres optionnels
        AND (p_typecontrat IS NULL OR m.typecontrat = p_typecontrat)
        AND (p_alternance IS NULL OR m.alternance = p_alternance)
        AND (p_location IS NULL OR p_location = '' OR m.lieutravail_libelle ILIKE '%' || p_location || '%')
    ORDER BY
        m.dateactualisation DESC NULLS LAST,
        m.id DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- 4. VACUUM ANALYZE pour mettre à jour les statistiques de la table
-- Ceci aide le planificateur de requêtes PostgreSQL à choisir les meilleurs index
-- A exécuter périodiquement (par exemple hebdomadairement via un cron job)
-- VACUUM ANALYZE metiers_france;
