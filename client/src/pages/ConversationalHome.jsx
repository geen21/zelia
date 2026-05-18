import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { analysisAPI, chatAPI, usersAPI } from '../lib/api'
import { resolveAvatarUrl } from '../lib/avatar'
import { buildContextualAdvisorMessage, buildUserContextSummary, normalizeExtraInfoEntries } from '../lib/userContext'
import { ORIENTATION_VIDEO_COMPLETION_ID, ORIENTATION_VIDEO_ITEMS, ORIENTATION_VIDEO_TOOL_PATH } from '../lib/videoToolSequence'

const ORIENTATION_VIDEO_DONE_IDS = ORIENTATION_VIDEO_ITEMS.map((video) => video.questionId)
const CUSTOM_JOB_BUBBLES_STORAGE_KEY = 'zelia_custom_job_bubbles'
const DEFAULT_PERSONA_QUOTA_LIMIT = 5

const DEFAULT_EXPERT_BUBBLES = [
  { id: 'default-developpeur-web', title: 'Développeur web', skills: ['code', 'produit', 'projets'] },
  { id: 'default-chef-projet', title: 'Chef de projet', skills: ['organisation', 'équipe', 'clients'] },
  { id: 'default-psychologue', title: 'Psychologue', skills: ['écoute', 'analyse', 'humain'] },
  { id: 'default-infirmier', title: 'Infirmier', skills: ['soin', 'rythme', 'relationnel'] }
]

const ACTIONS = [
  { id: 'bilan', label: 'Mon bilan', detail: 'Relire ton analyse et tes pistes principales.', to: '/app/results', icon: 'ph-sparkle', doneWhen: 'hasResults' },
  { id: 'formations', label: 'Formations et écoles', detail: 'Explorer les formations et écoles qui peuvent te correspondre.', to: '/app/formations', icon: 'ph-graduation-cap', doneIds: ['orientation_final_selection', 'niveau21_filieres', 'niveau22_preference', 'niveau23_schools'] },
  { id: 'jobs', label: 'Métiers', detail: 'Comparer des métiers et opportunités.', to: '/app/emplois', icon: 'ph-briefcase', donePrefixes: ['niveau18_rank_'] },
  { id: 'cv', label: 'CV', detail: 'Zélia te pose les bonnes questions puis génère ton CV.', to: '/app/outils/cv', icon: 'ph-identification-card', doneIds: ['niveau17_cv_data', 'niveau17_cv_pdf_url'] },
  { id: 'letter', label: 'Lettre', detail: 'Créer une lettre claire pour une formation ou un métier.', to: '/app/lettre', icon: 'ph-file-text', doneIds: ['lettre_generated', 'niveau14_letter_generated'] },
  { id: 'english', label: "Anglais", detail: 'Évaluer ton niveau et savoir quoi travailler.', to: '/app/outils/anglais', icon: 'ph-translate', doneIds: ['niv5_english_level'] },
  { id: 'personality', label: 'Personnalité', detail: 'Faire le test de personnalité approfondi.', to: '/app/outils/personnalite', icon: 'ph-brain', donePrefixes: ['mbti_', 'niveau4_'] },
  { id: 'orientation-videos', label: 'Vidéos orientation', detail: 'Suivre toutes les vidéos utiles du parcours au même endroit.', to: ORIENTATION_VIDEO_TOOL_PATH, icon: 'ph-video', doneIds: [ORIENTATION_VIDEO_COMPLETION_ID], doneAllIds: ORIENTATION_VIDEO_DONE_IDS },
  { id: 'parcoursup', label: 'Parcoursup', detail: 'Revoir les infos importantes sur Parcoursup.', to: '/app/outils/parcoursup', icon: 'ph-info', doneIds: ['niveau26_parcoursup_read'] },
  { id: 'pitch', label: 'Pitch oral', detail: "T'entraîner à te présenter clairement.", to: '/app/outils/pitch', icon: 'ph-microphone', doneIds: ['niveau28_pitch_rating'] },
  { id: 'interview', label: 'Entretien', detail: "Faire une simulation d'entretien avec Zélia.", to: '/app/outils/entretien', icon: 'ph-chats-circle', doneIds: ['niveau29_interview_done'] },
  { id: 'stress', label: 'Gérer son stress', detail: 'Comprendre ton profil et tester des exercices anti-stress.', to: '/app/outils/stress', icon: 'ph-heart', doneIds: ['niveau34_stress_profile'] },
  { id: 'softskills', label: 'Soft skills', detail: 'Travailler adaptabilité et intelligence émotionnelle.', to: '/app/outils/intelligence-emotionnelle', icon: 'ph-smiley', doneIds: ['niveau36_adaptability_completed'] },
  { id: 'problem', label: 'Problèmes', detail: 'T’entraîner à résoudre des situations concrètes.', to: '/app/outils/resolution-problemes', icon: 'ph-puzzle-piece', doneIds: ['niveau38_problem_solving_completed'] },
  { id: 'chat', label: 'Communauté', detail: 'Discuter avec les autres utilisateurs de Zélia.', to: '/app/chat', icon: 'ph-chats', doneIds: ['niveau13_chat_discovered', 'niveau13_messages_sent'] }
]

const ACTION_GROUPS = [
  { id: 'main', label: 'Essentiel', actionIds: ['bilan', 'formations', 'jobs'] },
  { id: 'documents', label: 'Documents', actionIds: ['cv', 'letter'] },
  { id: 'tests', label: 'Tests', actionIds: ['english', 'personality'] },
  { id: 'videos', label: 'Vidéos', actionIds: ['orientation-videos'] },
  { id: 'prep', label: 'Préparation', actionIds: ['parcoursup', 'pitch', 'interview'] },
  { id: 'skills', label: 'Compétences', actionIds: ['stress', 'softskills', 'problem', 'chat'] }
]

function buildAdvisorAvatarUrl() {
  const params = new URLSearchParams({
    seed: 'zelia-home-advisor',
    size: '180',
    radius: '18',
    backgroundType: 'solid',
    backgroundColor: 'fffbf7'
  })
  return `https://api.dicebear.com/9.x/lorelei/svg?${params.toString()}`
}

function getStoredAvatarUrl() {
  try {
    return localStorage.getItem('avatar_url') || ''
  } catch {
    return ''
  }
}

function cleanBubbleText(value, maxLength = 90) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text
}

function normalizeBubbleKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseMaybeJson(value) {
  if (!value || typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function normalizeSkillList(value) {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[;,]/)
      : []

  return rawItems
    .map((item) => cleanBubbleText(item, 34))
    .filter(Boolean)
    .filter((item, index, array) => array.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index)
    .slice(0, 3)
}

function normalizeJobBubble(item, index = 0, source = 'recommended') {
  if (!item) return null
  const title = typeof item === 'string'
    ? cleanBubbleText(item, 64)
    : cleanBubbleText(item.title || item.name || item.label || item.metier || item.intitule || item.job || '', 64)

  if (!title) return null

  const skills = typeof item === 'object'
    ? normalizeSkillList(item.skills || item.competences || item.tags || item.focus || item.description)
    : []

  return {
    id: `${source}-${normalizeBubbleKey(title) || index}`,
    title,
    skills,
    source,
    custom: source === 'custom'
  }
}

function mergeJobBubbles(...groups) {
  const seen = new Set()
  const merged = []
  groups.flat().filter(Boolean).forEach((bubble, index) => {
    const normalized = normalizeJobBubble(bubble, index, bubble.source || 'recommended')
    if (!normalized) return
    const key = normalizeBubbleKey(normalized.title)
    if (!key || seen.has(key)) return
    seen.add(key)
    merged.push(normalized)
  })
  return merged
}

function extractJobBubblesFromResults(results) {
  const sources = [
    results?.jobRecommendations,
    results?.job_recommendations,
    results?.inscriptionResults?.jobRecommendations,
    results?.inscriptionResults?.job_recommendations,
    results?.mbtiResults?.jobRecommendations,
    results?.mbtiResults?.job_recommendations
  ]

  return mergeJobBubbles(...sources.filter(Array.isArray).map((items) => items.map((item, index) => normalizeJobBubble(item, index, 'recommended'))))
}

function extractOrientationJobBubbles(extraInfoEntries) {
  const finalEntry = extraInfoEntries.find((entry) => String(entry?.question_id || '').toLowerCase() === 'orientation_final_selection')
  const parsed = parseMaybeJson(finalEntry?.answer_text)
  const candidates = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.candidates)
      ? parsed.candidates
      : []

  const jobs = candidates
    .filter((candidate) => {
      const raw = candidate?.raw && typeof candidate.raw === 'object' ? candidate.raw : {}
      const type = String(candidate?.type || raw.type || '').toLowerCase()
      const sourceTable = String(candidate?.sourceTable || raw.sourceTable || raw.source_table || '').toLowerCase()
      return type === 'metier' || sourceTable.includes('metiers')
    })
    .map((candidate, index) => {
      const raw = candidate?.raw && typeof candidate.raw === 'object' ? candidate.raw : {}
      const detail = candidate?.detail && typeof candidate.detail === 'object' ? candidate.detail : {}
      return normalizeJobBubble({
        title: detail.title || candidate?.title || raw.intitule,
        skills: detail.tags || raw.secteuractivitelibelle || raw.typecontrat
      }, index, 'selection')
    })

  return mergeJobBubbles(jobs)
}

function loadCustomJobBubbles() {
  try {
    const parsed = parseMaybeJson(localStorage.getItem(CUSTOM_JOB_BUBBLES_STORAGE_KEY))
    return Array.isArray(parsed)
      ? mergeJobBubbles(parsed.map((item, index) => normalizeJobBubble(item, index, 'custom'))).slice(0, 6)
      : []
  } catch {
    return []
  }
}

function saveCustomJobBubbles(bubbles) {
  try {
    localStorage.setItem(CUSTOM_JOB_BUBBLES_STORAGE_KEY, JSON.stringify(bubbles))
  } catch {
    // Local persistence is optional.
  }
}

function isActionDone(action, extraInfoEntries, hasResults) {
  if (action.doneWhen === 'hasResults' && hasResults) return true
  const ids = new Set(extraInfoEntries.map((entry) => String(entry?.question_id || '').toLowerCase()))
  if (action.doneAllIds?.length && action.doneAllIds.every((id) => ids.has(id.toLowerCase()))) return true
  if (action.doneIds?.some((id) => ids.has(id.toLowerCase()))) return true
  return action.donePrefixes?.some((prefix) => [...ids].some((id) => id.startsWith(prefix.toLowerCase()))) || false
}

export default function ConversationalHome() {
  const navigate = useNavigate()
  const [avatarUrl, setAvatarUrl] = useState(() => getStoredAvatarUrl() || buildAdvisorAvatarUrl())
  const [userContextSummary, setUserContextSummary] = useState('')
  const [extraInfoEntries, setExtraInfoEntries] = useState([])
  const [recommendedJobs, setRecommendedJobs] = useState([])
  const [selectionJobs, setSelectionJobs] = useState([])
  const [customJobBubbles, setCustomJobBubbles] = useState(() => loadCustomJobBubbles())
  const [selectedExpert, setSelectedExpert] = useState(null)
  const [personaQuotas, setPersonaQuotas] = useState({})
  const [expertCustomizerOpen, setExpertCustomizerOpen] = useState(false)
  const [customJobTitle, setCustomJobTitle] = useState('')
  const [customJobFocus, setCustomJobFocus] = useState('')
  const [hasResults, setHasResults] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [toolsPanelOpen, setToolsPanelOpen] = useState(false)
  const [openActionGroup, setOpenActionGroup] = useState('main')
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Je suis Zélia, ta conseillère d'orientation. Maintenant on peut t'aider pour plein de choses !"
    },
    {
      role: 'assistant',
      content: 'Choisis une bulle ou demande-moi directement ce que tu veux faire.'
    }
  ])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [profileRes, userRes, extraRes, resultsRes] = await Promise.all([
          usersAPI.getProfile().catch(() => null),
          usersAPI.getCurrentUser().catch(() => null),
          usersAPI.getExtraInfo().catch(() => null),
          analysisAPI.getMyResults().catch(() => null)
        ])
        if (!active) return
        const profile = profileRes?.data?.profile || profileRes?.data || null
        const userId = userRes?.data?.user?.id || profile?.id || 'zelia'
        const results = resultsRes?.data?.results || null
        const entries = normalizeExtraInfoEntries(extraRes)
        const resolvedAvatar = resolveAvatarUrl({ profile, analysis: results, seed: userId })
        setExtraInfoEntries(entries)
        setRecommendedJobs(extractJobBubblesFromResults(results))
        setSelectionJobs(extractOrientationJobBubbles(entries))
        setHasResults(Boolean(results))
        setUserContextSummary(buildUserContextSummary({ profile, results, extraInfos: entries }))
        if (resolvedAvatar) setAvatarUrl(resolvedAvatar)
      } catch {
        if (active && !avatarUrl) setAvatarUrl(buildAdvisorAvatarUrl())
      }
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    if (!selectedExpert?.title) return () => { active = false }

    chatAPI.getPersonaQuota(selectedExpert.title)
      .then((response) => {
        if (!active || !response?.data?.quota) return
        setPersonaQuotas((current) => ({
          ...current,
          [normalizeBubbleKey(selectedExpert.title)]: response.data.quota
        }))
      })
      .catch(() => null)

    return () => { active = false }
  }, [selectedExpert?.title])

  const actions = useMemo(() => (
    ACTIONS.map((action) => ({
      ...action,
      done: isActionDone(action, extraInfoEntries, hasResults)
    }))
  ), [extraInfoEntries, hasResults])

  const actionsById = useMemo(() => (
    Object.fromEntries(actions.map((action) => [action.id, action]))
  ), [actions])

  const groupedActions = useMemo(() => (
    ACTION_GROUPS.map((group) => ({
      ...group,
      actions: group.actionIds.map((id) => actionsById[id]).filter(Boolean)
    }))
  ), [actionsById])

  const activeActionGroup = useMemo(() => (
    groupedActions.find((group) => group.id === openActionGroup) || groupedActions[0]
  ), [groupedActions, openActionGroup])

  const completedActionsCount = useMemo(() => (
    actions.filter((action) => action.done).length
  ), [actions])

  const selectedExpertKey = selectedExpert ? normalizeBubbleKey(selectedExpert.title) : ''
  const selectedExpertQuota = selectedExpertKey ? personaQuotas[selectedExpertKey] : null
  const selectedExpertLimitReached = Boolean(selectedExpert && selectedExpertQuota?.remaining === 0)

  const expertBubbles = useMemo(() => {
    const merged = mergeJobBubbles(customJobBubbles, selectionJobs, recommendedJobs).slice(0, 8)
    return merged.length ? merged : DEFAULT_EXPERT_BUBBLES
  }, [customJobBubbles, selectionJobs, recommendedJobs])

  const buildAdvisorContext = () => [
    userContextSummary,
    selectedExpert ? `Expert métier sélectionné: ${selectedExpert.title}. Angles utiles: ${(selectedExpert.skills || []).join(', ') || 'quotidien, études, débouchés'}.` : ''
  ].filter(Boolean).join('\n')

  const selectExpert = (expert) => {
    setSelectedExpert(expert)
    setMessages((current) => [
      ...current,
      {
        role: 'assistant',
        expertTitle: expert?.title || '',
        content: expert
          ? `Très bien, je prends la casquette ${expert.title}. On peut parler du quotidien, des études, du salaire ou des débouchés.`
          : "Je reviens en conseiller général d'orientation."
      }
    ])
  }

  const addCustomJobBubble = () => {
    const bubble = normalizeJobBubble({ title: customJobTitle, skills: customJobFocus }, Date.now(), 'custom')
    if (!bubble) return

    setCustomJobBubbles((current) => {
      const next = mergeJobBubbles([bubble], current).filter((item) => item.custom).slice(0, 6)
      saveCustomJobBubbles(next)
      return next
    })
    setCustomJobTitle('')
    setCustomJobFocus('')
    setExpertCustomizerOpen(false)
    selectExpert(bubble)
  }

  const removeCustomJobBubble = (bubble) => {
    setCustomJobBubbles((current) => {
      const next = current.filter((item) => normalizeBubbleKey(item.title) !== normalizeBubbleKey(bubble.title))
      saveCustomJobBubbles(next)
      return next
    })
    if (selectedExpert && normalizeBubbleKey(selectedExpert.title) === normalizeBubbleKey(bubble.title)) {
      setSelectedExpert(null)
    }
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return
    if (selectedExpertLimitReached) {
      setMessages((current) => [...current, {
        role: 'assistant',
        expertTitle: selectedExpert?.title || '',
        content: `Tu as utilisé tes ${selectedExpertQuota?.limit || DEFAULT_PERSONA_QUOTA_LIMIT} questions pour ${selectedExpert?.title}. Choisis un autre métier pour continuer.`
      }])
      return
    }
    setInput('')
    const nextMessages = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    setLoading(true)
    try {
      const response = await chatAPI.aiChat({
        mode: selectedExpert ? 'persona' : 'advisor',
        advisorType: selectedExpert?.title || 'home-orientation-assistant',
        persona: selectedExpert ? { title: selectedExpert.title, skills: selectedExpert.skills || [] } : undefined,
        jobTitles: expertBubbles.map((expert) => expert.title),
        message: buildContextualAdvisorMessage(text, buildAdvisorContext()),
        history: nextMessages.slice(-10).map((message) => ({ role: message.role, content: message.content }))
      })
      if (selectedExpert && response?.data?.quota) {
        setPersonaQuotas((current) => ({
          ...current,
          [normalizeBubbleKey(selectedExpert.title)]: response.data.quota
        }))
      }
      setMessages((current) => [...current, { role: 'assistant', expertTitle: selectedExpert?.title || '', content: response?.data?.reply || "Je n'ai pas pu répondre pour le moment." }])
    } catch (error) {
      if (selectedExpert && error?.response?.data?.quota) {
        setPersonaQuotas((current) => ({
          ...current,
          [normalizeBubbleKey(selectedExpert.title)]: error.response.data.quota
        }))
      }
      const content = error?.response?.status === 429
        ? `Tu as utilisé tes ${error.response.data?.quota?.limit || DEFAULT_PERSONA_QUOTA_LIMIT} questions pour ${selectedExpert?.title}. Choisis un autre métier pour continuer.`
        : "Je n'arrive pas à répondre maintenant. Tu peux choisir une bulle pour avancer."
      setMessages((current) => [...current, { role: 'assistant', expertTitle: selectedExpert?.title || '', content }])
    } finally {
      setLoading(false)
    }
  }

  const handleAction = (action) => {
    setMessages((current) => [
      ...current,
      { role: 'user', content: action.label },
      { role: 'assistant', content: action.detail }
    ])
    navigate(action.to)
  }

  const toggleActionGroup = (groupId) => {
    setOpenActionGroup(groupId)
  }

  const renderActionButton = (action) => (
    <button
      key={action.id}
      type="button"
      className={action.done ? 'is-done' : ''}
      onClick={() => handleAction(action)}
      aria-label={action.done ? `${action.label}, réalisé` : action.label}
    >
      <i className={`ph ${action.icon}`} aria-hidden="true" />
      <span className="conversation-action-label">{action.label}</span>
      {action.done && <span className="conversation-action-check" aria-hidden="true"><i className="ph ph-check" /></span>}
    </button>
  )

  const renderExpertBubble = (expert) => {
    const isActive = selectedExpert && normalizeBubbleKey(selectedExpert.title) === normalizeBubbleKey(expert.title)
    const quota = personaQuotas[normalizeBubbleKey(expert.title)]
    const quotaText = quota
      ? `${quota.remaining}/${quota.limit} questions`
      : `${DEFAULT_PERSONA_QUOTA_LIMIT} questions max`
    return (
      <div key={expert.id} className="conversation-expert-row">
        <button
          type="button"
          className={`conversation-expert-bubble ${isActive ? 'is-active' : ''} ${expert.custom ? 'is-custom' : ''}`}
          onClick={() => selectExpert(expert)}
        >
          <i className="ph ph-briefcase" aria-hidden="true" />
          <span>
            <strong>{expert.title}</strong>
            {(expert.skills || []).length > 0 && <small>{expert.skills.join(' · ')}</small>}
            <small className="conversation-expert-quota">{quotaText}</small>
          </span>
        </button>
        {expert.custom && (
          <button
            type="button"
            className="conversation-expert-remove"
            onClick={() => removeCustomJobBubble(expert)}
            aria-label={`Retirer ${expert.title}`}
          >
            <i className="ph ph-x" aria-hidden="true" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="conversation-home">
      <style>{styles}</style>
      <section className="conversation-shell">
        <header className="conversation-header">
          <img src={avatarUrl} alt="Avatar Zélia" />
          <div>
            <p>Zélia, ta conseillère d'orientation</p>
            <h1>Maintenant on peut t'aider pour plein de choses !</h1>
          </div>
        </header>

        <div className="conversation-body">
          <div className="conversation-messages" aria-live="polite">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`conversation-message ${message.role}`}>
                {message.role === 'assistant' && <img src={avatarUrl} alt="" aria-hidden="true" />}
                <div className="conversation-message-stack">
                  {message.role === 'assistant' && message.expertTitle && <span>{message.expertTitle}</span>}
                  <p>{message.content}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="conversation-message assistant">
                <img src={avatarUrl} alt="" aria-hidden="true" />
                <div className="conversation-message-stack">
                  {selectedExpert && <span>{selectedExpert.title}</span>}
                  <p>Zélia réfléchit...</p>
                </div>
              </div>
            )}
          </div>

          <aside className="conversation-expert-panel" aria-label="Experts métiers">
            <div className="conversation-expert-header">
              <span>Experts métiers</span>
              <button
                type="button"
                onClick={() => setExpertCustomizerOpen((current) => !current)}
                aria-label="Personnaliser les bulles métiers"
              >
                <i className="ph ph-sliders-horizontal" aria-hidden="true" />
              </button>
            </div>

            <div className="conversation-expert-list">
              <div className="conversation-expert-row">
                <button
                  type="button"
                  className={`conversation-expert-bubble is-general ${!selectedExpert ? 'is-active' : ''}`}
                  onClick={() => selectExpert(null)}
                >
                  <i className="ph ph-compass" aria-hidden="true" />
                  <span>
                    <strong>Général</strong>
                    <small>orientation · choix · étapes</small>
                  </span>
                </button>
              </div>
              {expertBubbles.map(renderExpertBubble)}
            </div>

            {expertCustomizerOpen && (
              <div className="conversation-expert-customizer">
                <input
                  value={customJobTitle}
                  onChange={(event) => setCustomJobTitle(event.target.value)}
                  placeholder="Métier"
                />
                <input
                  value={customJobFocus}
                  onChange={(event) => setCustomJobFocus(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') addCustomJobBubble() }}
                  placeholder="Sujets"
                />
                <button type="button" onClick={addCustomJobBubble} disabled={!customJobTitle.trim()}>
                  Ajouter
                </button>
              </div>
            )}
          </aside>
        </div>

        <div className="conversation-actions conversation-actions-desktop">
          {actions.map(renderActionButton)}
        </div>

        <div className="conversation-action-groups">
          <section className="conversation-toolbox">
            <button
              type="button"
              className="conversation-toolbox-toggle"
              onClick={() => setToolsPanelOpen((current) => !current)}
              aria-expanded={toolsPanelOpen}
            >
              <span>Outils</span>
              <span className="conversation-toolbox-meta">{completedActionsCount}/{actions.length}</span>
              <i className={`ph ${toolsPanelOpen ? 'ph-caret-up' : 'ph-caret-down'}`} aria-hidden="true" />
            </button>
            {toolsPanelOpen && (
              <div className="conversation-toolbox-content">
                <div className="conversation-action-tabs" role="tablist" aria-label="Catégories d'outils">
                  {groupedActions.map((group) => {
                    const doneCount = group.actions.filter((action) => action.done).length
                    const isActive = activeActionGroup?.id === group.id
                    return (
                      <button
                        key={group.id}
                        type="button"
                        className={isActive ? 'is-active' : ''}
                        onClick={() => toggleActionGroup(group.id)}
                        role="tab"
                        aria-selected={isActive}
                      >
                        <span>{group.label}</span>
                        <small>{doneCount}/{group.actions.length}</small>
                      </button>
                    )
                  })}
                </div>
                <div className="conversation-actions conversation-actions-mobile">
                  {(activeActionGroup?.actions || []).map(renderActionButton)}
                </div>
              </div>
            )}
          </section>
        </div>

        <footer className="conversation-input">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') sendMessage() }}
            placeholder={selectedExpertLimitReached ? `Limite atteinte pour ${selectedExpert?.title}` : 'Demande à Zélia : CV, formation, métier, lettre...'}
          />
          <button type="button" onClick={sendMessage} disabled={loading || !input.trim() || selectedExpertLimitReached} aria-label="Envoyer">
            <i className="ph ph-paper-plane-tilt" aria-hidden="true" />
          </button>
        </footer>
      </section>
    </div>
  )
}

const styles = `
.conversation-home {
  height: 100%;
  min-height: 0;
  display: grid;
  justify-items: center;
  align-items: stretch;
  width: 100%;
}
.conversation-shell {
  width: min(100%, 1480px);
  height: 100%;
  min-height: 0;
  max-height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  gap: 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 18px;
  box-shadow: 0 12px 30px rgba(15,23,42,.05);
  overflow: hidden;
}
.conversation-header {
  display: flex;
  gap: 14px;
  align-items: center;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 16px;
}
.conversation-header img {
  width: 72px;
  height: 72px;
  border-radius: 8px;
  background: #fffbf7;
  border: 1px solid #e5e7eb;
}
.conversation-header p {
  margin: 0 0 4px;
  color: #6b7280;
  font-size: 13px;
  font-weight: 600;
}
.conversation-header h1 {
  margin: 0;
  font-size: 24px;
  line-height: 1.15;
  font-weight: 650;
  letter-spacing: 0;
}
.conversation-body {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 14px;
}
.conversation-messages {
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px;
}
.conversation-message {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.conversation-message.user {
  justify-content: flex-end;
}
.conversation-message-stack {
  max-width: min(560px, 76%);
  display: grid;
  gap: 3px;
}
.conversation-message.user .conversation-message-stack {
  justify-items: end;
}
.conversation-message-stack span {
  width: fit-content;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid #dbeafe;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
}
.conversation-message img {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: #fffbf7;
  border: 1px solid #e5e7eb;
  flex: 0 0 auto;
}
.conversation-message p {
  max-width: none;
  margin: 0;
  border-radius: 8px;
  padding: 9px 11px;
  line-height: 1.42;
  font-size: 14px;
  background: #fff;
  border: 1px solid #f1f5f9;
}
.conversation-message.user p {
  background: #111827;
  color: #fff;
  border-color: #111827;
}
.conversation-expert-panel {
  min-height: 0;
  max-height: 100%;
  overflow-y: auto;
  align-self: stretch;
  display: grid;
  align-content: start;
  gap: 10px;
  border-left: 1px solid #e0f2fe;
  padding: 2px 0 2px 14px;
}
.conversation-expert-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.conversation-expert-header span {
  color: #0f172a;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0;
}
.conversation-expert-header button {
  width: 32px;
  height: 32px;
  border: 1px solid #dbeafe;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  display: grid;
  place-items: center;
}
.conversation-expert-list {
  display: grid;
  gap: 8px;
}
.conversation-expert-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
}
.conversation-expert-bubble {
  min-height: 54px;
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  border: 1px solid #c7d2fe;
  border-radius: 999px;
  background: #eef2ff;
  color: #172554;
  padding: 7px 13px 7px 8px;
  text-align: left;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.7);
}
.conversation-expert-bubble:hover {
  border-color: #6366f1;
  background: #e0e7ff;
}
.conversation-expert-bubble.is-active {
  border-color: #111827;
  background: #111827;
  color: #fff;
}
.conversation-expert-bubble.is-custom {
  border-color: #f9a8d4;
  background: #fdf2f8;
  color: #831843;
}
.conversation-expert-bubble.is-custom.is-active {
  border-color: #831843;
  background: #831843;
  color: #fff;
}
.conversation-expert-bubble.is-general {
  border-color: #d1fae5;
  background: #ecfdf5;
  color: #064e3b;
}
.conversation-expert-bubble.is-general.is-active {
  border-color: #064e3b;
  background: #064e3b;
  color: #fff;
}
.conversation-expert-bubble i {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: rgba(255,255,255,.86);
  color: #4f46e5;
  display: grid;
  place-items: center;
  font-size: 18px;
}
.conversation-expert-bubble.is-active i {
  color: #111827;
}
.conversation-expert-bubble span {
  min-width: 0;
  display: grid;
  gap: 1px;
}
.conversation-expert-bubble strong,
.conversation-expert-bubble small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conversation-expert-bubble strong {
  font-size: 13px;
  font-weight: 800;
}
.conversation-expert-bubble small {
  font-size: 11px;
  opacity: .78;
}
.conversation-expert-bubble .conversation-expert-quota {
  opacity: .95;
  font-weight: 800;
}
.conversation-expert-remove {
  width: 28px;
  height: 28px;
  border: 1px solid #fbcfe8;
  border-radius: 999px;
  background: #fff;
  color: #be185d;
  display: grid;
  place-items: center;
  font-size: 14px;
}
.conversation-expert-customizer {
  display: grid;
  gap: 7px;
  border: 1px dashed #c7d2fe;
  border-radius: 8px;
  background: #f8fafc;
  padding: 8px;
}
.conversation-expert-customizer input {
  min-width: 0;
  height: 36px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  padding: 0 10px;
  font-size: 13px;
  outline: none;
}
.conversation-expert-customizer input:focus {
  border-color: #111827;
}
.conversation-expert-customizer button {
  height: 36px;
  border: 0;
  border-radius: 999px;
  background: #4f46e5;
  color: #fff;
  font-size: 13px;
  font-weight: 800;
}
.conversation-expert-customizer button:disabled {
  opacity: .45;
}
.conversation-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 8px;
}
.conversation-action-groups {
  display: none;
}
.conversation-actions button {
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 7px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  color: #111827;
  padding: 8px 9px;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  position: relative;
}
.conversation-actions button:hover {
  border-color: #c1ff72;
  background: #f8fff0;
}
.conversation-actions button.is-done {
  border-color: #bbf7d0;
  background: #f7fff9;
}
.conversation-actions i {
  color: #f68fff;
  font-size: 18px;
  flex: 0 0 auto;
}
.conversation-action-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conversation-action-check {
  margin-left: auto;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #c1ff72;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}
.conversation-action-check i {
  color: #111827;
  font-size: 12px;
}
.conversation-input {
  display: grid;
  grid-template-columns: 1fr 48px;
  gap: 10px;
  border-top: 1px solid #f1f5f9;
  padding-top: 14px;
}
.conversation-input input {
  min-width: 0;
  height: 48px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0 14px;
  outline: none;
}
.conversation-input input:focus {
  border-color: #000;
}
.conversation-input button {
  height: 48px;
  border: 0;
  border-radius: 8px;
  background: #000;
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 20px;
}
.conversation-input button:disabled {
  opacity: .45;
}
@media (max-width: 640px) {
  .conversation-home {
    justify-items: center;
  }
  .conversation-shell {
    width: 100%;
    padding: 10px;
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    gap: 8px;
  }
  .conversation-header {
    gap: 10px;
    padding-bottom: 10px;
  }
  .conversation-header h1 {
    font-size: 18px;
  }
  .conversation-header p {
    font-size: 12px;
  }
  .conversation-header img {
    width: 50px;
    height: 50px;
  }
  .conversation-body {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 8px;
  }
  .conversation-expert-panel {
    order: -1;
    border-left: 0;
    border-bottom: 1px solid #e0f2fe;
    padding: 0 0 8px;
    gap: 7px;
    overflow: hidden;
  }
  .conversation-expert-list {
    display: flex;
    gap: 7px;
    overflow-x: auto;
    padding-bottom: 1px;
    scrollbar-width: none;
  }
  .conversation-expert-list::-webkit-scrollbar {
    display: none;
  }
  .conversation-expert-row {
    flex: 0 0 auto;
    width: min(220px, 78vw);
  }
  .conversation-expert-bubble {
    min-height: 48px;
    width: 100%;
    padding: 6px 11px 6px 7px;
  }
  .conversation-expert-bubble i {
    width: 30px;
    height: 30px;
    font-size: 16px;
  }
  .conversation-expert-customizer {
    grid-template-columns: 1fr;
  }
  .conversation-messages {
    padding: 2px;
  }
  .conversation-actions-desktop {
    display: none;
  }
  .conversation-action-groups {
    display: grid;
    gap: 0;
  }
  .conversation-toolbox {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #fff;
    overflow: hidden;
  }
  .conversation-toolbox-toggle {
    width: 100%;
    min-height: 34px;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 0;
    background: #fff;
    color: #111827;
    padding: 7px 9px;
    font-size: 12px;
    font-weight: 700;
    text-align: left;
  }
  .conversation-toolbox-toggle i {
    margin-left: auto;
    color: #6b7280;
    font-size: 16px;
  }
  .conversation-toolbox-meta {
    margin-left: auto;
    color: #6b7280;
    font-size: 12px;
    font-weight: 600;
  }
  .conversation-toolbox-content {
    display: grid;
    gap: 6px;
    padding-bottom: 7px;
  }
  .conversation-action-tabs {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 0 7px;
    scrollbar-width: none;
  }
  .conversation-action-tabs::-webkit-scrollbar {
    display: none;
  }
  .conversation-action-tabs button {
    height: 30px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #fff;
    color: #111827;
    padding: 0 9px;
    font-size: 12px;
    font-weight: 650;
  }
  .conversation-action-tabs button.is-active {
    border-color: #111827;
    background: #111827;
    color: #fff;
  }
  .conversation-action-tabs small {
    color: inherit;
    opacity: .7;
    font-size: 11px;
    font-weight: 650;
  }
  .conversation-actions-mobile {
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    padding: 0 7px;
  }
  .conversation-actions-mobile button {
    min-height: 36px;
    padding: 7px 8px;
    font-size: 12px;
  }
  .conversation-input {
    grid-template-columns: 1fr 42px;
    gap: 8px;
    padding-top: 8px;
  }
  .conversation-input input,
  .conversation-input button {
    height: 42px;
  }
}
@media (min-width: 1024px) {
  .conversation-shell {
    padding: 20px 22px;
  }
  .conversation-actions {
    display: flex;
    overflow-x: auto;
    gap: 8px;
    padding-bottom: 2px;
    scrollbar-width: thin;
  }
  .conversation-actions button {
    flex: 0 0 auto;
    min-width: 126px;
    max-width: 178px;
  }
  .conversation-messages {
    padding: 8px 6px;
  }
  .conversation-message-stack {
    max-width: min(720px, 68%);
  }
}
`
