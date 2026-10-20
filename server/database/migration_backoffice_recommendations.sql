BEGIN;

CREATE INDEX IF NOT EXISTS idx_backoffice_recommendations
  ON public.informations_complementaires(user_id,created_at DESC,id DESC)
  WHERE question_id = 'orientation_recommendations';

CREATE OR REPLACE FUNCTION public.backoffice_recommended_candidates(p_answer text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE payload jsonb;
BEGIN
  BEGIN
    payload := p_answer::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN RETURN '[]'::jsonb;
  END;
  IF jsonb_typeof(payload) = 'object' THEN payload := payload->'candidates'; END IF;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'array' THEN RETURN '[]'::jsonb; END IF;
  RETURN (SELECT coalesce(jsonb_agg(candidate),'[]'::jsonb)
    FROM jsonb_array_elements(payload) AS candidate
    WHERE candidate->>'type' = 'formation');
END;
$$;

CREATE OR REPLACE FUNCTION public.backoffice_recommendations(
  p_query text DEFAULT '', p_source text DEFAULT 'all', p_limit int DEFAULT 50,
  p_offset int DEFAULT 0, p_user_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH latest AS MATERIALIZED (
    SELECT DISTINCT ON (info.user_id) info.user_id,info.answer_text,info.created_at
    FROM public.informations_complementaires info
    WHERE info.question_id IN ('orientation_recommendations','orientation_final_selection')
      AND (p_user_id IS NULL OR info.user_id = p_user_id)
    ORDER BY info.user_id,info.created_at DESC,info.id DESC
  ), recommendations AS (
    SELECT latest.user_id::text || ':recommendation:' ||
      md5(coalesce(nullif(candidate->>'id',''),nullif(candidate->>'rawId',''),candidate::text)) AS id,
      latest.user_id,latest.created_at,
      CASE WHEN candidate->>'sourceTable' = 'ecoles_partenaires'
        OR candidate->'partner' = 'true'::jsonb OR candidate->>'id' LIKE 'partner-%'
        THEN 'partner' ELSE 'national' END AS source,
      coalesce(nullif(candidate#>>'{detail,title}',''),nullif(candidate->>'title',''),
        candidate#>>'{raw,formation_name}',candidate#>>'{raw,nm,0}',candidate#>>'{raw,nmc}','Sans intitule') AS formation_name,
      coalesce(nullif(candidate->>'schoolName',''),nullif(candidate#>>'{raw,school_name}',''),
        nullif(candidate#>>'{raw,etab_nom}',''),candidate->>'subtitle',candidate#>>'{detail,subtitle}') AS school_name,
      coalesce(candidate->>'city',candidate#>>'{raw,city}',candidate#>>'{raw,commune}') AS city,
      jsonb_strip_nulls(jsonb_build_object(
        'link',coalesce(nullif(candidate#>>'{detail,link}',''),candidate->>'link',candidate#>>'{raw,link}',candidate#>>'{raw,fiche}',candidate#>>'{raw,etab_url}'),
        'description',coalesce(candidate#>>'{detail,description}',candidate->>'description')
      )) AS detail
    FROM latest CROSS JOIN LATERAL jsonb_array_elements(public.backoffice_recommended_candidates(latest.answer_text)) AS candidate
  ), unique_recommendations AS (
    SELECT DISTINCT ON (id) * FROM recommendations ORDER BY id
  ), filtered AS MATERIALIZED (
    SELECT recommendation.*,au.email,profile.first_name,profile.last_name
    FROM unique_recommendations recommendation JOIN auth.users au ON au.id = recommendation.user_id
    LEFT JOIN public.profiles profile ON profile.id = recommendation.user_id
    WHERE (p_source = 'all' OR recommendation.source = p_source)
      AND (coalesce(p_query,'') = '' OR concat_ws(' ',recommendation.formation_name,recommendation.school_name,
        recommendation.city,au.email,profile.first_name,profile.last_name) ILIKE '%' || p_query || '%')
  ), page AS (
    SELECT * FROM filtered ORDER BY created_at DESC NULLS LAST,(source = 'partner') DESC,id
    LIMIT least(greatest(coalesce(p_limit,50),1),100) OFFSET greatest(coalesce(p_offset,0),0)
  )
  SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page),'[]'::jsonb),
    'total',(SELECT count(*) FROM filtered),'totalUsers',(SELECT count(DISTINCT user_id) FROM filtered));
$$;

REVOKE ALL ON FUNCTION public.backoffice_recommended_candidates(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.backoffice_recommendations(text,text,int,int,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.backoffice_recommendations(text,text,int,int,uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
