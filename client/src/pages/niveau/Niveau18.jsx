import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import supabase from '../../lib/supabase'
import apiClient, { usersAPI } from '../../lib/api'
import { buildAvatarFromProfile } from '../../lib/avatar'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'

const DIALOGUE = [
  { text: 'On va peaufiner pour savoir si ton métier qui te correspond est vraiment le bon.', durationMs: 1700 },
  { text: 'On va classer ensemble les métiers du meilleur au pire.', durationMs: 1500 },
  { text: "C'est parti!", durationMs: 800 }
]

function useTypewriter(message, durationMs) {
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)
  const intervalRef = useRef(null)
  const timeoutRef = useRef(null)

  useEffect(() => {
    const full = message || ''
    setText('')
    setDone(false)
    let i = 0
    const step = Math.max(15, Math.floor((durationMs || 1500) / Math.max(1, full.length)))
    intervalRef.current = setInterval(() => {
      i += 1
      setText(full.slice(0, i))
      if (i >= full.length) clearInterval(intervalRef.current)
    }, step)
    timeoutRef.current = setTimeout(() => {
      clearInterval(intervalRef.current)
      setText(full)
      setDone(true)
    }, Math.max(durationMs || 1500, (full.length + 1) * step))

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [message, durationMs])

  const skip = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setText(message || '')
    setDone(true)
  }

  return { text, done, skip }
}

function SortableItem({ id, label, index }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`touch-none flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm ${isDragging ? 'opacity-70' : ''}`}
      onTouchStart={(e) => e.preventDefault()}
      {...attributes}
      {...listeners}
    >
      <div className="w-7 h-7 rounded-full bg-black text-white flex items-center justify-center text-xs font-semibold">{index + 1}</div>
      <div className="flex-1 font-medium text-gray-900">{label}</div>
      <div className="text-gray-400 text-sm">⇅</div>
    </div>
  )
}

function sanitizeText(raw) {
  if (!raw) return ''
  return String(raw)
    .replace(/```[\s\S]*?```/g, '')
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
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [items, setItems] = useState([])
  const [showSuccess, setShowSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  const [step, setStep] = useState(0)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 0, tolerance: 5 } })
  )

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
        setProfile(prof)
        setAvatarUrl(buildAvatarFromProfile(prof, user.id))

        const homePreference = (prof?.home_preference || '').trim()
        let jobs = []

        if (homePreference) {
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
          try {
            const anal = await apiClient.get('/analysis/my-results', { headers: { 'Cache-Control': 'no-cache' }, params: { _: Date.now() } })
            const results = anal?.data?.results || {}
            const list = normalizeJobs(results.jobRecommendations || results.job_recommandations || [])
            jobs = list
          } catch {
            try {
              const latest = await apiClient.get('/results/latest', { headers: { 'Cache-Control': 'no-cache' }, params: { _: Date.now() } })
              const simple = latest?.data?.results?.analysis || latest?.data?.results || {}
              const list = normalizeJobs(simple.jobRecommendations || simple.job_recommandations || simple.career_matches || [])
              jobs = list
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

  const current = DIALOGUE[Math.min(step, DIALOGUE.length - 1)]
  const { text: typed, done: typedDone, skip } = useTypewriter(current?.text || '', current?.durationMs || 1200)
  const started = step >= DIALOGUE.length

  const onNext = () => {
    if (!typedDone) {
      skip()
      return
    }
    setStep((prev) => Math.min(prev + 1, DIALOGUE.length))
  }

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setItems((prev) => {
      const oldIndex = prev.findIndex((it) => it.id === active.id)
      const newIndex = prev.findIndex((it) => it.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  const onValidate = async () => {
    if (saving) return
    setSaving(true)
    try {
      const ranking = items.map((item, idx) => ({ position: idx + 1, title: item.label }))
      const entries = [
        {
          question_id: 'niveau18_jobs_source',
          question_text: 'Métiers proposés (Niveau 18)',
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
      setShowSuccess(true)
    } catch (err) {
      console.error('Niveau18 save error', err)
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
    <div className="p-4 md:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <img
              src={avatarUrl}
              alt="Avatar"
              className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 lg:w-52 lg:h-52 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white mx-auto md:mx-0"
            />
            <div className="flex-1 w-full">
              <div className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full">
                <div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">
                  {typed}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              {!started && (
                <button
                  type="button"
                  onClick={onNext}
                  className="mt-4 px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
                >
                  {step < DIALOGUE.length - 1 ? 'Suivant' : 'Commencer'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white">🏅</div>
            <h2 className="text-xl font-bold">Classement des métiers</h2>
          </div>

          {!started && (
            <div className="text-text-secondary">Lis le dialogue puis lance-toi dans le classement.</div>
          )}

          {started && (
            <>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={items.map((it) => it.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3 touch-none">
                    {items.map((item, idx) => (
                      <SortableItem key={item.id} id={item.id} label={item.label} index={idx} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              <button
                type="button"
                onClick={onValidate}
                className="mt-4 w-full px-4 py-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200 disabled:opacity-60"
                disabled={saving || items.length === 0}
              >
                {saving ? 'Validation…' : 'Valider mon classement'}
              </button>
            </>
          )}
        </div>
      </div>

      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce">🏆</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 18 réussi !</h3>
            <p className="text-text-secondary mb-4">Ton classement est validé.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={() => navigate('/app/activites')}
                className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200"
              >
                Retour aux activités
              </button>
              <button
                type="button"
                onClick={() => navigate('/app/niveau/19')}
                className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200"
              >
                Passer au niveau suivant
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}