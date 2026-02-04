-- Ce fichier contient les commandes SQL pour optimiser la recherche dans la table formation_france
-- et créer une fonction RPC pour une recherche plus rapide.
-- A exécuter dans l'éditeur SQL de Supabase.

-- 1. Activer l'extension pg_trgm pour la recherche de texte partielle rapide (si pas déjà active)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Créer des index ESSENTIELS pour accélérer les recherches sur formation_france
-- Index GIN sur nmc (nom de la formation) pour la recherche textuelle ILIKE optimisée
CREATE INDEX IF NOT EXISTS idx_formation_france_nmc_trgm ON formation_france USING gin (nmc gin_trgm_ops);

-- Index GIN sur etab_nom (nom de l'établissement)
CREATE INDEX IF NOT EXISTS idx_formation_france_etab_trgm ON formation_france USING gin (etab_nom gin_trgm_ops);

-- Index GIN sur tc (type de cursus) 
CREATE INDEX IF NOT EXISTS idx_formation_france_tc_trgm ON formation_france USING gin (tc gin_trgm_ops);

-- Index sur le département pour les filtres géographiques
CREATE INDEX IF NOT EXISTS idx_formation_france_departement ON formation_france (departement);

-- Index sur la région
CREATE INDEX IF NOT EXISTS idx_formation_france_region ON formation_france (region);

-- Index composite sur annee + id pour le tri
CREATE INDEX IF NOT EXISTS idx_formation_france_annee_id ON formation_france (annee DESC NULLS LAST, id ASC);

-- 3. Créer la fonction RPC OPTIMISÉE pour la recherche de formations
-- Cette fonction remplace la requête complexe côté client par une procédure stockée performante
-- D'abord supprimer l'ancienne fonction si elle existe (nécessaire pour changer le type de retour)
DROP FUNCTION IF EXISTS search_formations(text[], text, text, int);

CREATE OR REPLACE FUNCTION search_formations(
    p_keywords text[] DEFAULT NULL,
    p_department text DEFAULT NULL,
    p_region text DEFAULT NULL,
    p_limit int DEFAULT 20,
    p_offset int DEFAULT 0
)
RETURNS TABLE (
    id bigint,
    nmc text,
    nm text[],
    etab_nom text,
    etab_uai text,
    region text,
    departement text,
    commune text,
    tc text,
    tf text[],
    fiche text,
    etab_url text,
    annee text,
    image text,
    email text,
    score int
)
LANGUAGE plpgsql
AS $$
DECLARE
    clean_keywords text[];
    kw text;
BEGIN
    -- Nettoyer les mots-clés (enlever vides, trimmer)
    clean_keywords := ARRAY[]::text[];
    IF p_keywords IS NOT NULL THEN
        FOREACH kw IN ARRAY p_keywords
        LOOP
            kw := TRIM(COALESCE(kw, ''));
            IF kw != '' AND LENGTH(kw) >= 2 THEN
                clean_keywords := array_append(clean_keywords, LOWER(kw));
            END IF;
        END LOOP;
    END IF;
    
    -- Limiter le nombre de mots-clés pour éviter les requêtes trop lourdes
    IF array_length(clean_keywords, 1) > 10 THEN
        clean_keywords := clean_keywords[1:10];
    END IF;
    
    RETURN QUERY
    WITH scored_formations AS (
        SELECT
            f.id,
            f.nmc,
            f.nm,
            f.etab_nom,
            f.etab_uai,
            f.region,
            f.departement,
            f.commune,
            f.tc,
            f.tf,
            f.fiche,
            f.etab_url,
            f.annee,
            f.image,
            f.email,
            -- Calcul du score de pertinence
            (
                SELECT COALESCE(SUM(
                    CASE 
                        WHEN LOWER(f.nmc) LIKE '%' || k || '%' THEN 6
                        ELSE 0
                    END +
                    CASE 
                        WHEN LOWER(f.tc) LIKE '%' || k || '%' THEN 4
                        ELSE 0
                    END +
                    CASE 
                        WHEN LOWER(f.etab_nom) LIKE '%' || k || '%' THEN 2
                        ELSE 0
                    END +
                    CASE 
                        WHEN LOWER(f.commune) LIKE '%' || k || '%' THEN 1
                        ELSE 0
                    END
                ), 0)
                FROM unnest(clean_keywords) AS k
            )::int AS match_score
        FROM formation_france f
        WHERE
            -- Filtre département (optionnel)
            (p_department IS NULL OR p_department = '' OR f.departement ILIKE '%' || p_department || '%')
            -- Filtre région (optionnel)
            AND (p_region IS NULL OR p_region = '' OR f.region ILIKE '%' || p_region || '%')
            -- Au moins un mot-clé doit matcher si des mots-clés sont fournis
            AND (
                array_length(clean_keywords, 1) IS NULL 
                OR array_length(clean_keywords, 1) = 0
                OR EXISTS (
                    SELECT 1 FROM unnest(clean_keywords) AS k
                    WHERE 
                        LOWER(f.nmc) LIKE '%' || k || '%'
                        OR LOWER(f.tc) LIKE '%' || k || '%'
                        OR LOWER(f.etab_nom) LIKE '%' || k || '%'
                )
            )
            -- Exclure les écoles primaires et collèges
            AND LOWER(f.etab_nom) NOT LIKE '%ecole primaire%'
            AND LOWER(f.etab_nom) NOT LIKE '%école primaire%'
            AND LOWER(f.etab_nom) NOT LIKE '%college %'
            AND LOWER(f.etab_nom) NOT LIKE '%collège %'
    )
    SELECT 
        sf.id,
        sf.nmc,
        sf.nm,
        sf.etab_nom,
        sf.etab_uai,
        sf.region,
        sf.departement,
        sf.commune,
        sf.tc,
        sf.tf,
        sf.fiche,
        sf.etab_url,
        sf.annee,
        sf.image,
        sf.email,
        sf.match_score AS score
    FROM scored_formations sf
    WHERE sf.match_score > 0 OR array_length(clean_keywords, 1) IS NULL OR array_length(clean_keywords, 1) = 0
    ORDER BY
        sf.match_score DESC,
        sf.annee DESC NULLS LAST,
        sf.id ASC
    LIMIT LEAST(p_limit, 50)
    OFFSET p_offset;
END;
$$;

-- 4. Créer une version simplifiée pour la recherche sans scoring (plus rapide)
-- D'abord supprimer l'ancienne fonction si elle existe (nécessaire pour changer le type de retour)
DROP FUNCTION IF EXISTS search_formations_simple(text, text, int);

CREATE OR REPLACE FUNCTION search_formations_simple(
    p_keyword text DEFAULT NULL,
    p_department text DEFAULT NULL,
    p_limit int DEFAULT 20
)
RETURNS TABLE (
    id bigint,
    nmc text,
    nm text[],
    etab_nom text,
    etab_uai text,
    region text,
    departement text,
    commune text,
    tc text,
    tf text[],
    fiche text,
    etab_url text,
    annee text,
    image text,
    email text
)
LANGUAGE plpgsql
AS $$
DECLARE
    clean_keyword text;
BEGIN
    clean_keyword := LOWER(TRIM(COALESCE(p_keyword, '')));
    
    RETURN QUERY
    SELECT
        f.id,
        f.nmc,
        f.nm,
        f.etab_nom,
        f.etab_uai,
        f.region,
        f.departement,
        f.commune,
        f.tc,
        f.tf,
        f.fiche,
        f.etab_url,
        f.annee,
        f.image,
        f.email
    FROM formation_france f
    WHERE
        -- Filtre département (optionnel)
        (p_department IS NULL OR p_department = '' OR f.departement ILIKE '%' || p_department || '%')
        -- Recherche textuelle
        AND (
            clean_keyword = '' 
            OR f.nmc ILIKE '%' || clean_keyword || '%'
            OR f.tc ILIKE '%' || clean_keyword || '%'
            OR f.etab_nom ILIKE '%' || clean_keyword || '%'
        )
        -- Exclure les écoles primaires et collèges
        AND LOWER(f.etab_nom) NOT LIKE '%ecole primaire%'
        AND LOWER(f.etab_nom) NOT LIKE '%école primaire%'
        AND LOWER(f.etab_nom) NOT LIKE '%college %'
        AND LOWER(f.etab_nom) NOT LIKE '%collège %'
    ORDER BY
        f.annee DESC NULLS LAST,
        f.id ASC
    LIMIT LEAST(p_limit, 50);
END;
$$;

-- 5. VACUUM ANALYZE pour mettre à jour les statistiques de la table
-- Ceci aide le planificateur de requêtes PostgreSQL à choisir les meilleurs index
-- A exécuter après avoir créé les index
-- VACUUM ANALYZE formation_france;

-- INSTRUCTIONS D'INSTALLATION:
-- 1. Exécuter ce script dans l'éditeur SQL de Supabase
-- 2. Les index prendront quelques minutes à se créer sur une grande table
-- 3. Tester avec: SELECT * FROM search_formations(ARRAY['informatique', 'master'], '75', NULL, 10);
