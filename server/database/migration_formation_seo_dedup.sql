-- Composite B-tree index to accelerate canonical formation resolution
-- across multi-year and duplicate Parcoursup imports in public.formation_france.
-- Safe and idempotent to run in Supabase SQL Editor.

CREATE INDEX IF NOT EXISTS idx_formation_france_uai_gta_annee_id
ON public.formation_france (etab_uai, gta, annee DESC NULLS LAST, id ASC);

NOTIFY pgrst, 'reload schema';
