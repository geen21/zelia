import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ToolRanking from '../../components/ToolRanking'
import supabase from '../../lib/supabase'
import apiClient, { usersAPI } from '../../lib/api'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'

function sanitizeText(raw) {
  if (!raw) return ''
  return String(raw)
    .replace(/```(?:\w+)?\s*([\s\S]*?)```/g, '$1')
    .trim()
}

function parseJobList(raw) {
  const cleaned = sanitizeText(raw)
  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter(Boolean)
  return Array.from(new Set(lines))
}

function normalizeJobs(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((item) => {
      if (!item) return ''
      if (typeof item === 'string') return item.trim()
      if (typeof item === 'object') {
        return (item.title || item.intitule || item.name || item.role || '').trim()
      }
      return ''
    })
    .filter(Boolean)
}

export default function Niveau18() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          navigate('/login')
          return
        }

        const pRes = await usersAPI.getProfile().catch(() => null)
        if (!mounted) return
        const prof = pRes?.data?.profile || pRes?.data || null

        const homePreference = (prof?.home_preference || '').trim()
        const isQuestionnaire = homePreference.toLowerCase() === 'questionnaire'
        let jobs = []

        // Si home_preference est un métier spécifique (pas "questionnaire"), on génère des métiers similaires
        if (homePreference && !isQuestionnaire) {
          const message =
            `Propose 5 métiers similaires au métier suivant: "${homePreference}".\n` +
            `Contraintes STRICTES :\n` +
            `- Réponds uniquement par une liste de 5 métiers, un par ligne.\n` +
            `- Pas d'introduction, pas de numérotation si possible.`

          const resp = await apiClient.post('/chat/ai', {
            mode: 'advisor',
            advisorType: 'jobs-similar',
            message,
            history: []
          })

          const list = parseJobList(resp?.data?.reply || '')
          jobs = [homePreference, ...list].filter(Boolean).slice(0, 6)
        } else {
          // Pour les utilisateurs "questionnaire", récupérer depuis user_results avec questionnaire_type = 'inscription'
          try {
            let query = supabase
              .from('user_results')
              .select('job_recommendations')
              .eq('user_id', user.id)
            
            if (isQuestionnaire) {
              query = query.eq('questionnaire_type', 'inscription')
            }
            
            const { data: userResultsData } = await query
              .order('created_at', { ascending: false })
              .limit(1)
              .single()
            
            if (userResultsData?.job_recommendations) {
              let list = userResultsData.job_recommendations
              if (typeof list === 'string') {
                try { list = JSON.parse(list) } catch {}
              }
              jobs = normalizeJobs(list)
            }
          } catch {
            // Fallback to API
            try {
              const anal = await apiClient.get('/analysis/my-results', { headers: { 'Cache-Control': 'no-cache' }, params: { _: Date.now() } })
              const results = anal?.data?.results || {}
              jobs = normalizeJobs(results.jobRecommendations || results.job_recommandations || [])
            } catch {}
          }
          jobs = jobs.slice(0, 6)
        }

        if (jobs.length < 6) {
          const seed = jobs[0] || 'orientation'
          const resp = await apiClient.post('/chat/ai', {
            mode: 'advisor',
            advisorType: 'jobs-fill',
            message: `Propose ${6 - jobs.length} métiers liés à "${seed}". Réponds uniquement par des lignes simples.`,
            history: []
          })
          const list = parseJobList(resp?.data?.reply || '')
          jobs = [...jobs, ...list].filter(Boolean).slice(0, 6)
        }

        const mapped = jobs.map((label, idx) => ({ id: `job-${idx}`, label }))
        setItems(mapped)
      } catch (e) {
        console.error('Niveau18 load error', e)
        if (!mounted) return
        setError('Erreur de chargement')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  const onValidate = async () => {
    if (saving) return
    setSaving(true)
    setSaveError('')
    try {
      const ranking = items.map((item, idx) => ({ position: idx + 1, title: item.label }))
      const entries = [
        {
          question_id: 'niveau18_jobs_source',
          question_text: 'Métiers proposés',
          answer_text: JSON.stringify(items.map((item) => item.label))
        },
        ...ranking.map((row) => ({
          question_id: `niveau18_rank_${row.position}`,
          question_text: `Classement métier #${row.position}`,
          answer_text: row.title
        }))
      ]

      await usersAPI.saveExtraInfo(entries)
      await levelUp({ minLevel: 18, xpReward: XP_PER_LEVEL })
      navigate('/app')
    } catch (err) {
      console.error('Niveau18 save error', err)
      setSaveError("Impossible d'enregistrer ton classement pour le moment.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="inline-block w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
        <p className="mt-2 text-text-secondary">Chargement…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">{error}</div>
      </div>
    )
  }

  return (
    <div className="tool-stack">
      {saveError && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {saveError}
        </div>
      )}

      <section className="tool-panel">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-950">Ton ordre de préférence</h2>
          <span className="text-sm text-gray-500">{items.length} métiers</span>
        </div>

        {items.length > 0 ? (
          <ToolRanking items={items} onChange={setItems} disabled={saving} />
        ) : (
          <p className="rounded-lg bg-gray-50 px-4 py-5 text-sm text-gray-500">Aucun métier n’est disponible pour le moment.</p>
        )}

        <button
          type="button"
          onClick={onValidate}
          className="tool-primary mt-5 w-full"
          disabled={saving || items.length === 0}
        >
          {saving ? 'Enregistrement...' : 'Enregistrer mon classement'}
        </button>
      </section>

    </div>
  )
}