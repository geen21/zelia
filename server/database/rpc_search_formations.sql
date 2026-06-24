-- Ce fichier contient les commandes SQL pour optimiser la recherche dans la table formation_france
-- et créer une fonction RPC pour une recherche plus rapide.
-- A exécuter dans l'éditeur SQL de Supabase.

-- 1. Activer l'extension pg_trgm pour la recherche de texte partielle rapide (si pas déjà active)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- PostgreSQL n'autorise dans un index d'expression que des fonctions IMMUTABLE.
-- array_to_string(text[], text) n'est pas marquée IMMUTABLE, donc on l'encapsule.
CREATE OR REPLACE FUNCTION public.formation_nm_text(p_nm text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT COALESCE(array_to_string(p_nm, ' '), '')
$$;

-- Texte de recherche combiné pour reproduire l'ancien fallback large sans générer
-- une requête PostgREST avec des dizaines de OR/ILIKE.
CREATE OR REPLACE FUNCTION public.formation_search_text(
    p_nm text[],
    p_nmc text,
    p_tc text,
    p_etab_nom text,
    p_code_formation text,
    p_commune text,
    p_departement text,
    p_region text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT LOWER(
        COALESCE(public.formation_nm_text(p_nm), '') || ' ' ||
        COALESCE(p_nmc, '') || ' ' ||
        COALESCE(p_tc, '') || ' ' ||
        COALESCE(p_etab_nom, '') || ' ' ||
        COALESCE(p_code_formation, '') || ' ' ||
        COALESCE(p_commune, '') || ' ' ||
        COALESCE(p_departement, '') || ' ' ||
        COALESCE(p_region, '')
    )
$$;

-- 2. Créer des index ESSENTIELS pour accélérer les recherches sur formation_france
-- Index GIN sur nmc (nom de la formation) pour la recherche textuelle ILIKE optimisée
CREATE INDEX IF NOT EXISTS idx_formation_france_nmc_trgm ON formation_france USING gin (nmc gin_trgm_ops);

-- Index GIN sur nm (libellé exact de formation) pour la recherche principale
CREATE INDEX IF NOT EXISTS idx_formation_france_nm_trgm ON formation_france USING gin (public.formation_nm_text(nm) gin_trgm_ops);

-- Index GIN sur etab_nom (nom de l'établissement)
CREATE INDEX IF NOT EXISTS idx_formation_france_etab_trgm ON formation_france USING gin (etab_nom gin_trgm_ops);

-- Index GIN sur tc (type de cursus) 
CREATE INDEX IF NOT EXISTS idx_formation_france_tc_trgm ON formation_france USING gin (tc gin_trgm_ops);

-- Index GIN sur commune et code de formation pour les recherches catalogue rapides
CREATE INDEX IF NOT EXISTS idx_formation_france_commune_trgm ON formation_france USING gin (commune gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_formation_france_code_formation_trgm ON formation_france USING gin (code_formation gin_trgm_ops);

-- Index GIN sur département/région quand le filtre arrive sous forme de texte libre
CREATE INDEX IF NOT EXISTS idx_formation_france_departement_trgm ON formation_france USING gin (departement gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_formation_france_region_trgm ON formation_france USING gin (region gin_trgm_ops);

-- Index sur le département pour les filtres géographiques
CREATE INDEX IF NOT EXISTS idx_formation_france_departement ON formation_france (departement);

-- Index sur la région
CREATE INDEX IF NOT EXISTS idx_formation_france_region ON formation_france (region);

-- Index composite sur annee + id pour le tri
CREATE INDEX IF NOT EXISTS idx_formation_france_annee_id ON formation_france (annee DESC NULLS LAST, id ASC);

-- Index GIN sur le texte combiné pour la recherche large et la similarité trigram
CREATE INDEX IF NOT EXISTS idx_formation_france_search_text_trgm
ON formation_france USING gin (
    public.formation_search_text(nm, nmc, tc, etab_nom, code_formation, commune, departement, region) gin_trgm_ops
);

-- 3. Créer la fonction RPC OPTIMISÉE pour la recherche de formations
-- Cette fonction remplace la requête complexe côté client par une procédure stockée performante
-- D'abord supprimer l'ancienne fonction si elle existe (nécessaire pour changer le type de retour)
DROP FUNCTION IF EXISTS search_formations(text[], text, text, int, int, text);
DROP FUNCTION IF EXISTS search_formations(text[], text, text, int, int);
DROP FUNCTION IF EXISTS search_formations(text[], text, text, int);

CREATE OR REPLACE FUNCTION search_formations(
    p_keywords text[] DEFAULT NULL,
    p_department text DEFAULT NULL,
    p_region text DEFAULT NULL,
    p_limit int DEFAULT 20,
    p_offset int DEFAULT 0,
    p_query text DEFAULT NULL
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
    code_formation text,
    score int
)
LANGUAGE plpgsql
AS $$
DECLARE
    clean_keywords text[];
    clean_query text;
    kw text;
    safe_limit int;
    safe_offset int;
    candidate_cap int;
BEGIN
    -- Nettoyer les mots-clés (enlever vides, trimmer)
    clean_keywords := ARRAY[]::text[];
    IF p_keywords IS NOT NULL THEN
        FOREACH kw IN ARRAY p_keywords
        LOOP
            kw := LOWER(TRIM(COALESCE(kw, '')));
            IF kw != '' AND LENGTH(kw) >= 2 AND NOT kw = ANY(clean_keywords) THEN
                clean_keywords := array_append(clean_keywords, LOWER(kw));
            END IF;
        END LOOP;
    END IF;

    clean_query := LOWER(TRIM(COALESCE(p_query, array_to_string(clean_keywords, ' '), '')));
    clean_query := REGEXP_REPLACE(clean_query, '[%_]+', ' ', 'g');
    clean_query := REGEXP_REPLACE(clean_query, '\s+', ' ', 'g');
    clean_query := LEFT(clean_query, 120);

    safe_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 120);
    safe_offset := GREATEST(COALESCE(p_offset, 0), 0);
    candidate_cap := LEAST(GREATEST(safe_offset + safe_limit + 80, 140), 1000);
    
    -- Limiter le nombre de mots-clés pour éviter les requêtes trop lourdes
    IF array_length(clean_keywords, 1) > 10 THEN
        clean_keywords := clean_keywords[1:10];
    END IF;
    
    IF COALESCE(array_length(clean_keywords, 1), 0) = 0 AND clean_query = '' THEN
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
            f.email,
            f.code_formation,
            0::int AS score
        FROM formation_france f
        WHERE
            (p_department IS NULL OR p_department = '' OR f.departement ILIKE '%' || p_department || '%' OR f.commune ILIKE '%' || p_department || '%')
            AND (p_region IS NULL OR p_region = '' OR f.region ILIKE '%' || p_region || '%')
            AND LOWER(f.etab_nom) NOT LIKE '%ecole primaire%'
            AND LOWER(f.etab_nom) NOT LIKE '%école primaire%'
            AND LOWER(f.etab_nom) NOT LIKE '%college %'
            AND LOWER(f.etab_nom) NOT LIKE '%collège %'
        ORDER BY f.annee DESC NULLS LAST, f.id ASC
        LIMIT safe_limit
        OFFSET safe_offset;
        RETURN;
    END IF;

    RETURN QUERY
    WITH keyword_terms AS (
        SELECT unnest(clean_keywords) AS term
    ),
    candidate_matches AS (
        SELECT f.id, 120 AS score
        FROM formation_france f
        WHERE clean_query <> ''
            AND public.formation_search_text(f.nm, f.nmc, f.tc, f.etab_nom, f.code_formation, f.commune, f.departement, f.region) LIKE '%' || clean_query || '%'
            AND (p_department IS NULL OR p_department = '' OR f.departement ILIKE '%' || p_department || '%' OR f.commune ILIKE '%' || p_department || '%')
            AND (p_region IS NULL OR p_region = '' OR f.region ILIKE '%' || p_region || '%')
            AND LOWER(f.etab_nom) NOT LIKE '%ecole primaire%'
            AND LOWER(f.etab_nom) NOT LIKE '%école primaire%'
            AND LOWER(f.etab_nom) NOT LIKE '%college %'
            AND LOWER(f.etab_nom) NOT LIKE '%collège %'

        UNION ALL
        SELECT f.id, 90 AS score
        FROM formation_france f
        JOIN keyword_terms kt ON public.formation_nm_text(f.nm) ILIKE '%' || kt.term || '%'
        WHERE (p_department IS NULL OR p_department = '' OR f.departement ILIKE '%' || p_department || '%' OR f.commune ILIKE '%' || p_department || '%')
            AND (p_region IS NULL OR p_region = '' OR f.region ILIKE '%' || p_region || '%')
            AND LOWER(f.etab_nom) NOT LIKE '%ecole primaire%'
            AND LOWER(f.etab_nom) NOT LIKE '%école primaire%'
            AND LOWER(f.etab_nom) NOT LIKE '%college %'
            AND LOWER(f.etab_nom) NOT LIKE '%collège %'

        UNION ALL
        SELECT f.id, 65 AS score
        FROM formation_france f
        JOIN keyword_terms kt ON f.code_formation ILIKE '%' || kt.term || '%'
        WHERE (p_department IS NULL OR p_department = '' OR f.departement ILIKE '%' || p_department || '%' OR f.commune ILIKE '%' || p_department || '%')
            AND (p_region IS NULL OR p_region = '' OR f.region ILIKE '%' || p_region || '%')
            AND LOWER(f.etab_nom) NOT LIKE '%ecole primaire%'
            AND LOWER(f.etab_nom) NOT LIKE '%école primaire%'
            AND LOWER(f.etab_nom) NOT LIKE '%college %'
            AND LOWER(f.etab_nom) NOT LIKE '%collège %'

        UNION ALL
        SELECT f.id, 55 AS score
        FROM formation_france f
        JOIN keyword_terms kt ON f.tc ILIKE '%' || kt.term || '%'
        WHERE (p_department IS NULL OR p_department = '' OR f.departement ILIKE '%' || p_department || '%' OR f.commune ILIKE '%' || p_department || '%')
            AND (p_region IS NULL OR p_region = '' OR f.region ILIKE '%' || p_region || '%')
            AND LOWER(f.etab_nom) NOT LIKE '%ecole primaire%'
            AND LOWER(f.etab_nom) NOT LIKE '%école primaire%'
            AND LOWER(f.etab_nom) NOT LIKE '%college %'
            AND LOWER(f.etab_nom) NOT LIKE '%collège %'

        UNION ALL
        SELECT f.id, 45 AS score
        FROM formation_france f
        JOIN keyword_terms kt ON f.nmc ILIKE '%' || kt.term || '%'
        WHERE (p_department IS NULL OR p_department = '' OR f.departement ILIKE '%' || p_department || '%' OR f.commune ILIKE '%' || p_department || '%')
            AND (p_region IS NULL OR p_region = '' OR f.region ILIKE '%' || p_region || '%')
            AND LOWER(f.etab_nom) NOT LIKE '%ecole primaire%'
            AND LOWER(f.etab_nom) NOT LIKE '%école primaire%'
            AND LOWER(f.etab_nom) NOT LIKE '%college %'
            AND LOWER(f.etab_nom) NOT LIKE '%collège %'

        UNION ALL
        SELECT f.id, 35 AS score
        FROM formation_france f
        JOIN keyword_terms kt ON f.etab_nom ILIKE '%' || kt.term || '%'
        WHERE (p_department IS NULL OR p_department = '' OR f.departement ILIKE '%' || p_department || '%' OR f.commune ILIKE '%' || p_department || '%')
            AND (p_region IS NULL OR p_region = '' OR f.region ILIKE '%' || p_region || '%')
            AND LOWER(f.etab_nom) NOT LIKE '%ecole primaire%'
            AND LOWER(f.etab_nom) NOT LIKE '%école primaire%'
            AND LOWER(f.etab_nom) NOT LIKE '%college %'
            AND LOWER(f.etab_nom) NOT LIKE '%collège %'

        UNION ALL
        SELECT f.id, 20 AS score
        FROM formation_france f
        JOIN keyword_terms kt ON f.commune ILIKE '%' || kt.term || '%'
            OR f.departement ILIKE '%' || kt.term || '%'
            OR f.region ILIKE '%' || kt.term || '%'
        WHERE (p_department IS NULL OR p_department = '' OR f.departement ILIKE '%' || p_department || '%' OR f.commune ILIKE '%' || p_department || '%')
            AND (p_region IS NULL OR p_region = '' OR f.region ILIKE '%' || p_region || '%')
            AND LOWER(f.etab_nom) NOT LIKE '%ecole primaire%'
            AND LOWER(f.etab_nom) NOT LIKE '%école primaire%'
            AND LOWER(f.etab_nom) NOT LIKE '%college %'
            AND LOWER(f.etab_nom) NOT LIKE '%collège %'

        UNION ALL
        SELECT f.id, 18 AS score
        FROM formation_france f
        WHERE LENGTH(clean_query) >= 4
            AND public.formation_search_text(f.nm, f.nmc, f.tc, f.etab_nom, f.code_formation, f.commune, f.departement, f.region) % clean_query
            AND (p_department IS NULL OR p_department = '' OR f.departement ILIKE '%' || p_department || '%' OR f.commune ILIKE '%' || p_department || '%')
            AND (p_region IS NULL OR p_region = '' OR f.region ILIKE '%' || p_region || '%')
            AND LOWER(f.etab_nom) NOT LIKE '%ecole primaire%'
            AND LOWER(f.etab_nom) NOT LIKE '%école primaire%'
            AND LOWER(f.etab_nom) NOT LIKE '%college %'
            AND LOWER(f.etab_nom) NOT LIKE '%collège %'
    ),
    ranked_matches AS (
        SELECT cm.id, SUM(cm.score)::int AS match_score
        FROM candidate_matches cm
        GROUP BY cm.id
        ORDER BY SUM(cm.score) DESC, cm.id ASC
        LIMIT candidate_cap
    )
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
        f.code_formation,
        rm.match_score AS score
    FROM ranked_matches rm
    JOIN formation_france f ON f.id = rm.id
    ORDER BY
        rm.match_score DESC,
        f.annee DESC NULLS LAST,
        f.id ASC
    LIMIT safe_limit
    OFFSET safe_offset;
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
    email text,
    code_formation text
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
        f.email,
        f.code_formation
    FROM formation_france f
    WHERE
        -- Filtre département (optionnel)
        (p_department IS NULL OR p_department = '' OR f.departement ILIKE '%' || p_department || '%')
        -- Recherche textuelle
        AND (
            clean_keyword = '' 
            OR public.formation_nm_text(f.nm) ILIKE '%' || clean_keyword || '%'
            OR f.nmc ILIKE '%' || clean_keyword || '%'
            OR f.tc ILIKE '%' || clean_keyword || '%'
            OR f.etab_nom ILIKE '%' || clean_keyword || '%'
            OR f.code_formation ILIKE '%' || clean_keyword || '%'
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

-- 6. Rafraîchir le cache de schéma PostgREST utilisé par Supabase RPC
NOTIFY pgrst, 'reload schema';

-- INSTRUCTIONS D'INSTALLATION:
-- 1. Exécuter ce script dans l'éditeur SQL de Supabase
-- 2. Les index prendront quelques minutes à se créer sur une grande table
-- 3. Tester avec: SELECT * FROM search_formations(ARRAY['informatique', 'master'], '75', NULL, 10);
