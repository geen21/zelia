BEGIN;

CREATE OR REPLACE FUNCTION public.backoffice_selections(
  p_query text DEFAULT '', p_source text DEFAULT 'all', p_limit int DEFAULT 50,
  p_offset int DEFAULT 0, p_user_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH latest AS MATERIALIZED (
    SELECT DISTINCT ON (info.user_id) info.user_id,info.answer_text,info.created_at
    FROM public.informations_complementaires info
    WHERE info.question_id = 'orientation_final_selection'
      AND (p_user_id IS NULL OR info.user_id = p_user_id)
    ORDER BY info.user_id,info.created_at DESC,info.id DESC
  ), orientation AS (
    SELECT latest.user_id::text || ':orientation:' || md5(coalesce(nullif(candidate->>'rawId',''),nullif(candidate->>'id',''),candidate::text)) AS id,
      latest.user_id,latest.created_at,'orientation'::text AS source,
      coalesce(nullif(candidate#>>'{detail,title}',''),nullif(candidate->>'title',''),candidate#>>'{raw,nm,0}',candidate#>>'{raw,nm}','Sans intitule') AS formation_name,
      coalesce(nullif(candidate#>>'{raw,etab_nom}',''),nullif(candidate#>>'{raw,school_name}',''),candidate->>'subtitle',candidate#>>'{detail,subtitle}') AS school_name,
      coalesce(candidate#>>'{raw,commune}',candidate->>'city') AS city,
      (CASE WHEN jsonb_typeof(candidate->'detail')='object' THEN candidate->'detail' ELSE '{}'::jsonb END)
        || jsonb_strip_nulls(jsonb_build_object('link',coalesce(
          nullif(btrim(candidate#>>'{detail,link}'),''),
          nullif(btrim(candidate#>>'{raw,fiche}'),''),
          nullif(btrim(candidate->>'fiche'),''),
          nullif(btrim(candidate#>>'{raw,link}'),''),
          nullif(btrim(candidate->>'link'),''),
          nullif(btrim(candidate#>>'{raw,etab_url}'),''),
          nullif(btrim(candidate->>'etab_url'),'')
        ))) AS detail,
      candidate->>'link' AS link,
      jsonb_strip_nulls(jsonb_build_object(
        'fiche',candidate#>'{raw,fiche}','link',candidate#>'{raw,link}','etab_url',candidate#>'{raw,etab_url}'
      )) AS raw,
      candidate->>'fiche' AS fiche,
      candidate->>'etab_url' AS etab_url
    FROM latest CROSS JOIN LATERAL jsonb_array_elements(public.backoffice_selected_candidates(latest.answer_text)) AS candidate
  ), choices AS (
    SELECT DISTINCT ON (id) * FROM orientation ORDER BY id,created_at DESC
  ), all_choices AS (
    SELECT * FROM choices
    UNION ALL
    SELECT submission.user_id::text || ':partner:' || submission.formation_id::text,
      submission.user_id,submission.submitted_at,'partner',partner.formation_name,partner.school_name,partner.city,
      jsonb_build_object('title',partner.formation_name,'subtitle',partner.school_name,'description',partner.description,'link',partner.link),
      partner.link,'{}'::jsonb,NULL::text,NULL::text
    FROM public.contact_submitted submission JOIN public.ecoles_partenaires partner ON partner.id = submission.formation_id
    WHERE p_user_id IS NULL OR submission.user_id = p_user_id
  ), filtered AS MATERIALIZED (
    SELECT choice.*,au.email,profile.first_name,profile.last_name
    FROM all_choices choice JOIN auth.users au ON au.id = choice.user_id
    LEFT JOIN public.profiles profile ON profile.id = choice.user_id
    WHERE (p_source = 'all' OR choice.source = p_source)
      AND (coalesce(p_query,'') = '' OR concat_ws(' ',choice.formation_name,choice.school_name,choice.city,au.email,profile.first_name,profile.last_name) ILIKE '%' || p_query || '%')
  ), page AS (
    SELECT * FROM filtered ORDER BY created_at DESC NULLS LAST,id
    LIMIT least(greatest(coalesce(p_limit,50),1),100) OFFSET greatest(coalesce(p_offset,0),0)
  )
  SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page),'[]'::jsonb),
    'total',(SELECT count(*) FROM filtered),'totalUsers',(SELECT count(DISTINCT user_id) FROM filtered));
$$;

REVOKE ALL ON FUNCTION public.backoffice_selections(text,text,int,int,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.backoffice_selections(text,text,int,int,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
