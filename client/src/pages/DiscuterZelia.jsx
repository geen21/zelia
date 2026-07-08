import React, { useEffect, useMemo, useState } from 'react'
import { analysisAPI, chatAPI, usersAPI } from '../lib/api'
import { resolveAvatarUrl } from '../lib/avatar'
import { buildContextualAdvisorMessage, buildUserContextSummary, normalizeExtraInfoEntries } from '../lib/userContext'

const DEFAULT_EXPERT_BUBBLES = [
  { id: 'default-developpeur-web', title: 'Développeur web', skills: ['code', 'produit', 'projets'] },
  { id: 'default-chef-projet', title: 'Chef de projet', skills: ['organisation', 'équipe', 'clients'] },
  { id: 'default-psychologue', title: 'Psychologue', skills: ['écoute', 'analyse', 'humain'] },
  { id: 'default-infirmier', title: 'Infirmier', skills: ['soin', 'rythme', 'relationnel'] }
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

export default function DiscuterZelia() {
  const [avatarUrl, setAvatarUrl] = useState(() => getStoredAvatarUrl() || buildAdvisorAvatarUrl())
  const [userContextSummary, setUserContextSummary] = useState('')
  const [recommendedJobs, setRecommendedJobs] = useState([])
  const [selectionJobs, setSelectionJobs] = useState([])
  const [selectedExpert, setSelectedExpert] = useState(null)
  const [expertLimitReached, setExpertLimitReached] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
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
        setRecommendedJobs(extractJobBubblesFromResults(results))
        setSelectionJobs(extractOrientationJobBubbles(entries))
        setUserContextSummary(buildUserContextSummary({ profile, results, extraInfos: entries }))
        if (resolvedAvatar) setAvatarUrl(resolvedAvatar)
      } catch {
        if (active && !avatarUrl) setAvatarUrl(buildAdvisorAvatarUrl())
      }
    })()
    return () => { active = false }
  }, [])

  const expertBubbles = useMemo(() => {
    const merged = mergeJobBubbles(selectionJobs, recommendedJobs).slice(0, 8)
    return merged.length ? merged : DEFAULT_EXPERT_BUBBLES
  }, [selectionJobs, recommendedJobs])

  const buildAdvisorContext = (expert = selectedExpert) => [
    userContextSummary,
    expert ? `Expert métier sélectionné: ${expert.title}. Angles utiles: ${(expert.skills || []).join(', ') || 'quotidien, études, débouchés'}.` : ''
  ].filter(Boolean).join('\n')

  const selectExpert = (expert) => {
    setSelectedExpert(expert)
    setExpertLimitReached(false)
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

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading || expertLimitReached) return
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
      setMessages((current) => [...current, {
        role: 'assistant',
        expertTitle: selectedExpert?.title || '',
        content: response?.data?.reply || "Je n'ai pas pu répondre pour le moment."
      }])
    } catch (error) {
      if (selectedExpert && error?.response?.status === 429) setExpertLimitReached(true)
      const content = error?.response?.status === 429
        ? `Tu as atteint la limite de questions pour ${selectedExpert?.title}. Choisis un autre métier pour continuer.`
        : "Je n'arrive pas à répondre maintenant. Tu peux choisir une bulle pour avancer."
      setMessages((current) => [...current, { role: 'assistant', expertTitle: selectedExpert?.title || '', content }])
    } finally {
      setLoading(false)
    }
  }

  const renderExpertBubble = (expert) => {
    const isActive = selectedExpert && normalizeBubbleKey(selectedExpert.title) === normalizeBubbleKey(expert.title)
    return (
      <button
        key={expert.id}
        type="button"
        className={`dz-expert-chip ${isActive ? 'is-active' : ''}`}
        onClick={() => selectExpert(expert)}
      >
        <i className="ph ph-briefcase" aria-hidden="true" />
        <span>
          <strong>{expert.title}</strong>
          {(expert.skills || []).length > 0 && <small>{expert.skills.join(' · ')}</small>}
        </span>
      </button>
    )
  }

  return (
    <div className="dz-page">
      <style>{styles}</style>

      <header className="dz-header">
        <img src={avatarUrl} alt="" aria-hidden="true" />
        <div>
          <p>Discuter avec Zélia</p>
          <h1>Une question ? Demande-moi directement.</h1>
        </div>
      </header>

      <div className="dz-messages" aria-live="polite">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`dz-message ${message.role}`}>
            {message.role === 'assistant' && <img src={avatarUrl} alt="" aria-hidden="true" />}
            <div className="dz-message-stack">
              {message.role === 'assistant' && message.expertTitle && <span>{message.expertTitle}</span>}
              <p>{message.content}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="dz-message assistant">
            <img src={avatarUrl} alt="" aria-hidden="true" />
            <div className="dz-message-stack">
              {selectedExpert && <span>{selectedExpert.title}</span>}
              <p>Zélia réfléchit...</p>
            </div>
          </div>
        )}
      </div>

      <div className="dz-expert-panel" aria-label="Experts métiers">
        <div className="dz-expert-header">
          <span>Experts métiers</span>
        </div>

        <div className="dz-expert-list">
          <button
            type="button"
            className={`dz-expert-chip is-general ${!selectedExpert ? 'is-active' : ''}`}
            onClick={() => selectExpert(null)}
          >
            <i className="ph ph-compass" aria-hidden="true" />
            <span>
              <strong>Général</strong>
              <small>orientation · choix · étapes</small>
            </span>
          </button>
          {expertBubbles.map(renderExpertBubble)}
        </div>
      </div>

      <footer className="dz-input">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') sendMessage() }}
          placeholder={expertLimitReached ? `Limite atteinte pour ${selectedExpert?.title}` : 'Demande à Zélia : CV, formation, métier, lettre...'}
        />
        <button type="button" onClick={() => sendMessage()} disabled={loading || !input.trim() || expertLimitReached} aria-label="Envoyer">
          <i className="ph ph-paper-plane-tilt" aria-hidden="true" />
        </button>
      </footer>
    </div>
  )
}

const styles = `
.dz-page {
  --dz-lime: #c1ff72;
  --dz-pink: #f68fff;
  --dz-ink: #111827;
  --dz-cream: #fffbf7;
  width: 100%;
  height: 100%;
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  font-family: "Bricolage Grotesque", -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
  color: #000;
}

.dz-header { display: flex; align-items: center; gap: 12px; flex: 0 0 auto; }
.dz-header img { width: 48px; height: 48px; border-radius: 14px; object-fit: contain; background: var(--dz-cream); border: 1px solid rgba(0,0,0,.08); }
.dz-header p { margin: 0; color: #6b7280; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .01em; }
.dz-header h1 { margin: 2px 0 0; font-size: 20px; font-weight: 800; }

.dz-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 2px;
  border: 1px solid rgba(0,0,0,.06);
  border-radius: 22px;
  background: #fff;
}
.dz-message { display: flex; align-items: flex-end; gap: 8px; padding: 0 12px; }
.dz-message:first-child { margin-top: 12px; }
.dz-message:last-child { margin-bottom: 12px; }
.dz-message.user { justify-content: flex-end; }
.dz-message img { width: 30px; height: 30px; border-radius: 10px; background: var(--dz-cream); border: 1px solid rgba(0,0,0,.08); flex: 0 0 auto; }
.dz-message-stack { max-width: min(560px, 82%); display: grid; gap: 3px; }
.dz-message.user .dz-message-stack { justify-items: end; }
.dz-message-stack span {
  width: fit-content;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid rgba(246,143,255,.4);
  border-radius: 999px;
  background: #fdeeff;
  color: #a83fae;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
}
.dz-message-stack p {
  margin: 0;
  border-radius: 16px;
  padding: 10px 14px;
  line-height: 1.42;
  font-size: 14px;
  background: var(--dz-cream);
  border: 1px solid rgba(0,0,0,.06);
}
.dz-message.user .dz-message-stack p { background: #000; color: #fff; border-color: #000; }

.dz-expert-panel { flex: 0 0 auto; display: grid; gap: 10px; border: 1px solid rgba(0,0,0,.06); border-radius: 22px; background: #fff; padding: 14px 16px; }
.dz-expert-header { display: flex; align-items: center; justify-content: space-between; }
.dz-expert-header span { color: var(--dz-ink); font-size: 12px; font-weight: 800; text-transform: uppercase; }
.dz-expert-list { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
.dz-expert-list::-webkit-scrollbar { display: none; }
.dz-expert-chip {
  min-height: 52px;
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  border: 2px solid rgba(0,0,0,.08);
  border-radius: 999px;
  background: #fff;
  color: var(--dz-ink);
  padding: 7px 14px 7px 8px;
  text-align: left;
  white-space: nowrap;
}
.dz-expert-chip:hover { border-color: #000; }
.dz-expert-chip.is-active { border-color: #000; background: #000; color: #fff; }
.dz-expert-chip.is-general { border-color: rgba(193,255,114,.7); background: #f8fff0; }
.dz-expert-chip.is-general.is-active { border-color: #000; background: #000; color: #fff; }
.dz-expert-chip i { width: 30px; height: 30px; border-radius: 999px; background: rgba(0,0,0,.05); display: grid; place-items: center; font-size: 16px; flex: 0 0 auto; }
.dz-expert-chip.is-active i { background: rgba(255,255,255,.15); }
.dz-expert-chip span { display: grid; gap: 1px; min-width: 0; }
.dz-expert-chip strong, .dz-expert-chip small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dz-expert-chip strong { font-size: 13px; font-weight: 800; }
.dz-expert-chip small { font-size: 10px; opacity: .78; }

.dz-input {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: 1fr 52px;
  gap: 10px;
}
.dz-input input {
  min-width: 0;
  height: 50px;
  border: 1px solid rgba(0,0,0,.1);
  border-radius: 999px;
  padding: 0 18px;
  outline: none;
  font: inherit;
  font-size: 14px;
  background: #fff;
}
.dz-input input:focus { border-color: #000; }
.dz-input button {
  height: 50px;
  border: 0;
  border-radius: 999px;
  background: #000;
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 19px;
}
.dz-input button:disabled { opacity: .45; }

@media (max-width: 640px) {
  .dz-page { gap: 10px; }
  .dz-header h1 { font-size: 17px; }
  .dz-expert-chip { min-height: 46px; }
}
`
