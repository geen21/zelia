import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { analysisAPI, chatAPI, usersAPI } from '../lib/api'
import { resolveAvatarUrl } from '../lib/avatar'
import { buildContextualAdvisorMessage, buildUserContextSummary, normalizeExtraInfoEntries } from '../lib/userContext'
import { ORIENTATION_VIDEO_COMPLETION_ID, ORIENTATION_VIDEO_ITEMS, ORIENTATION_VIDEO_TOOL_PATH } from '../lib/videoToolSequence'

const ORIENTATION_VIDEO_DONE_IDS = ORIENTATION_VIDEO_ITEMS.map((video) => video.questionId)

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
  { id: 'chat', label: 'Communauté', detail: 'Discuter avec Zélia ou la communauté.', to: '/app/chat', icon: 'ph-chats', doneIds: ['niveau13_chat_discovered', 'niveau13_messages_sent'] }
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
        setHasResults(Boolean(results))
        setUserContextSummary(buildUserContextSummary({ profile, results, extraInfos: entries }))
        if (resolvedAvatar) setAvatarUrl(resolvedAvatar)
      } catch {
        if (active && !avatarUrl) setAvatarUrl(buildAdvisorAvatarUrl())
      }
    })()
    return () => { active = false }
  }, [])

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

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const nextMessages = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    setLoading(true)
    try {
      const response = await chatAPI.aiChat({
        mode: 'advisor',
        advisorType: 'home-orientation-assistant',
        message: buildContextualAdvisorMessage(text, userContextSummary),
        history: nextMessages.slice(-10)
      })
      setMessages((current) => [...current, { role: 'assistant', content: response?.data?.reply || "Je n'ai pas pu répondre pour le moment." }])
    } catch (error) {
      setMessages((current) => [...current, { role: 'assistant', content: "Je n'arrive pas à répondre maintenant. Tu peux choisir une bulle pour avancer." }])
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

        <div className="conversation-messages" aria-live="polite">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`conversation-message ${message.role}`}>
              {message.role === 'assistant' && <img src={avatarUrl} alt="" aria-hidden="true" />}
              <p>{message.content}</p>
            </div>
          ))}
          {loading && (
            <div className="conversation-message assistant">
              <img src={avatarUrl} alt="" aria-hidden="true" />
              <p>Zélia réfléchit...</p>
            </div>
          )}
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
            placeholder="Demande à Zélia : CV, formation, métier, lettre..."
          />
          <button type="button" onClick={sendMessage} disabled={loading || !input.trim()} aria-label="Envoyer">
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
.conversation-message img {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: #fffbf7;
  border: 1px solid #e5e7eb;
  flex: 0 0 auto;
}
.conversation-message p {
  max-width: min(560px, 76%);
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
  .conversation-message p {
    max-width: min(720px, 68%);
  }
}
`
