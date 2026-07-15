import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { analysisAPI, usersAPI } from '../lib/api'
import { resolveAvatarUrl } from '../lib/avatar'
import { normalizeExtraInfoEntries } from '../lib/userContext'
import { ORIENTATION_VIDEO_COMPLETION_ID, ORIENTATION_VIDEO_ITEMS, ORIENTATION_VIDEO_TOOL_PATH } from '../lib/videoToolSequence'

const ORIENTATION_VIDEO_DONE_IDS = ORIENTATION_VIDEO_ITEMS.map((video) => video.questionId)

const ACTIONS = [
  { id: 'jobs-ranking', label: 'Classement des métiers', detail: 'Classe les métiers proposés selon tes préférences.', to: '/app/outils/classement-metiers', icon: 'ph-sort-ascending', doneIds: ['niveau18_rank_1'] },
  { id: 'orientation-videos', label: 'Vidéo orientation', detail: "Découvre les contenus utiles pour construire ton orientation.", to: ORIENTATION_VIDEO_TOOL_PATH, icon: 'ph-video', doneIds: [ORIENTATION_VIDEO_COMPLETION_ID], doneAllIds: ORIENTATION_VIDEO_DONE_IDS },
  { id: 'orientation-quiz', label: 'Quiz stat orientation', detail: "Teste tes repères sur l'orientation après le bac.", to: '/app/outils/quiz-orientation', icon: 'ph-chart-pie', doneIds: ['niveau24_quiz_completed'] },
  { id: 'personality', label: 'Découvre tes domaines de prédilection', detail: 'Explore tes préférences et tes points forts.', to: '/app/outils/personnalite', icon: 'ph-brain', donePrefixes: ['mbti_', 'niveau4_'] },
  { id: 'future-letter', label: 'Lettre à soi-même', detail: 'Écris à la personne que tu seras dans cinq ans.', to: '/app/outils/lettre-futur', icon: 'ph-envelope', doneIds: ['niveau33_letter_completed'] },
  { id: 'english', label: "Teste ton niveau d'anglais", detail: 'Évalue ton niveau et identifie tes prochaines priorités.', to: '/app/outils/anglais', icon: 'ph-translate', doneIds: ['niv5_english_level'] },
  { id: 'cv', label: 'Prépare ton CV', detail: 'Génère automatiquement un CV structuré à partir de tes informations.', to: '/app/outils/cv', icon: 'ph-identification-card', doneIds: ['niveau17_cv_data', 'niveau17_cv_pdf_url'] },
  { id: 'letter', label: 'Prépare ta lettre de motivation', detail: 'Génère automatiquement une lettre adaptée à ton projet.', to: '/app/lettre', icon: 'ph-file-text', doneIds: ['lettre_generated', 'niveau14_letter_generated'] },
  { id: 'parcoursup', label: 'Comprends Parcoursup', detail: 'Retrouve les informations essentielles pour préparer tes vœux.', to: '/app/outils/parcoursup', icon: 'ph-info', doneIds: ['niveau26_parcoursup_read'] },
  { id: 'pitch', label: 'Entraîne-toi à pitcher', detail: 'Prépare une présentation claire et convaincante.', to: '/app/outils/pitch', icon: 'ph-microphone', doneIds: ['niveau28_pitch_rating'] },
  { id: 'interview', label: 'Simule un entretien', detail: "Entraîne-toi à répondre aux questions d'un entretien.", to: '/app/outils/entretien', icon: 'ph-chats-circle', doneIds: ['niveau29_interview_done'] }
]

// Curated activity roadmap shown on the dashboard header.
const DASHBOARD_STEPS = [
  { actionId: 'jobs-ranking', title: 'Classement des métiers', timeMin: 5, points: 25 },
  { actionId: 'orientation-videos', title: 'Vidéo orientation', timeMin: 8, points: 25 },
  { actionId: 'orientation-quiz', title: 'Quiz stat orientation', timeMin: 4, points: 20 },
  { actionId: 'personality', title: 'Découvre tes domaines de prédilection', timeMin: 8, points: 35 },
  { actionId: 'future-letter', title: 'Lettre à soi-même', timeMin: 5, points: 20 },
  { actionId: 'english', title: "Teste ton niveau d'anglais", timeMin: 6, points: 25 },
  { actionId: 'cv', title: 'Prépare ton CV', timeMin: 10, points: 50 },
  { actionId: 'letter', title: 'Prépare ta lettre de motivation', timeMin: 8, points: 35 },
  { actionId: 'parcoursup', title: 'Comprends Parcoursup', timeMin: 5, points: 20 },
  { actionId: 'pitch', title: 'Entraîne-toi à pitcher', timeMin: 6, points: 30 },
  { actionId: 'interview', title: 'Simule un entretien', timeMin: 10, points: 45 }
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
  const [firstName, setFirstName] = useState('')
  const [extraInfoEntries, setExtraInfoEntries] = useState([])
  const [hasResults, setHasResults] = useState(false)

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
        setFirstName(profile?.first_name || profile?.prenom || '')
        setHasResults(Boolean(results))
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

  const dashboardSteps = useMemo(() => (
    DASHBOARD_STEPS.map((step) => ({ ...step, action: actionsById[step.actionId] })).filter((step) => step.action)
  ), [actionsById])

  const dashboardDoneCount = useMemo(() => (
    dashboardSteps.filter((step) => step.action.done).length
  ), [dashboardSteps])

  const dashboardNextIndex = useMemo(() => (
    dashboardSteps.findIndex((step) => !step.action.done)
  ), [dashboardSteps])

  const dashboardProgressPercent = dashboardSteps.length
    ? Math.round((dashboardDoneCount / dashboardSteps.length) * 100)
    : 0

  const handleAction = (action) => {
    navigate(action.to)
  }

  return (
    <div className="dash-home">
      <style>{styles}</style>

      <section className="dash-card dash-greeting">
        <div className="dash-greeting-row">
          <img className="dash-avatar" src={avatarUrl} alt="Avatar" />
          <div className="dash-greeting-text">
            <h1>Salut {firstName || 'toi'} !</h1>
            <p>Ton parcours sur-mesure t'attend</p>
          </div>
          <Link to="/app/profile" className="dash-edit-btn" aria-label="Modifier mon profil" title="Modifier mon profil">
            <i className="ph ph-pencil-simple" aria-hidden="true" />
          </Link>
        </div>

        <div className="dash-progress">
          <div className="dash-progress-labels">
            <span>Progression</span>
            <span>{dashboardDoneCount}/{dashboardSteps.length} étapes</span>
          </div>
          <div className="dash-progress-track"><span style={{ width: `${dashboardProgressPercent}%` }} /></div>
        </div>

        <nav className="dash-pill-nav" aria-label="Navigation rapide">
          <Link to="/app/outils" className="dash-pill">
            <i className="ph ph-wrench" aria-hidden="true" />
            <span>Outils</span>
          </Link>
          <Link to="/app/formations" className="dash-pill">
            <i className="ph ph-graduation-cap" aria-hidden="true" />
            <span>Formations</span>
          </Link>
          <Link to="/app/results" className="dash-pill">
            <i className="ph ph-chart-line-up" aria-hidden="true" />
            <span>Résultats</span>
          </Link>
        </nav>
      </section>

      <Link to="/app/discuter" className="dash-card dash-chat-cta">
        <img src={avatarUrl} alt="" aria-hidden="true" />
        <div className="dash-chat-cta-text">
          <p>Discuter avec Zélia</p>
          <h2>Une question ? Pose-la directement à ta conseillère.</h2>
        </div>
        <span className="dash-chat-cta-btn">
          <i className="ph ph-chat-circle-dots" aria-hidden="true" />
          Ouvrir la discussion
        </span>
      </Link>

      <section className="dash-card dash-timeline-card">
        <h2>Crée ton avenir !</h2>
        <p>Apprends à te connaître un peu plus à chaque étape pour cibler les études et les métiers qui te correspondent vraiment.</p>
        <ol className="dash-timeline">
          {dashboardSteps.map((step, index) => {
            const status = step.action.done ? 'done' : index === dashboardNextIndex ? 'next' : 'upcoming'
            const markerIcon = status === 'done' ? 'ph-check' : status === 'next' ? 'ph-play-fill' : step.action.icon
            return (
              <li key={step.actionId} className={`dash-step is-${status}`}>
                <button
                  type="button"
                  className="dash-step-marker"
                  onClick={() => handleAction(step.action)}
                  aria-label={status === 'done' ? `${step.title}, terminé` : step.title}
                >
                  <i className={`ph ${markerIcon}`} aria-hidden="true" />
                </button>
                <div className="dash-step-body">
                  <strong>{step.title}</strong>
                  {status === 'done' ? (
                    step.actionId === 'bilan'
                      ? <Link to="/app/results" className="dash-step-cta">Revoir mes résultats</Link>
                      : <span className="dash-step-done-tag"><i className="ph ph-check-circle" aria-hidden="true" />Terminé</span>
                  ) : (
                    <div className="dash-step-meta">
                      <span><i className="ph ph-clock" aria-hidden="true" />{step.timeMin} min</span>
                      <span><i className="ph ph-star" aria-hidden="true" />+{step.points} pts</span>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}

const styles = `
.dash-home {
  --dash-lime: #c1ff72;
  --dash-pink: #f68fff;
  --dash-ink: #111827;
  --dash-cream: #fffbf7;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-bottom: 24px;
  font-family: "Bricolage Grotesque", -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
  color: #000;
}

.dash-card {
  position: relative;
  background: #fff;
  border: 1px solid rgba(0,0,0,.06);
  border-radius: 28px;
  box-shadow: 0 26px 60px -30px rgba(0,0,0,.22), 0 2px 10px rgba(0,0,0,.04);
  padding: clamp(20px, 4vw, 32px);
}
.dash-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 30px;
  right: 30px;
  height: 6px;
  border-radius: 0 0 8px 8px;
  background: var(--dash-lime);
}

/* ---------- Greeting card ---------- */
.dash-greeting { display: grid; gap: 20px; }
.dash-greeting-row { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 14px; }
.dash-avatar {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  object-fit: contain;
  background: var(--dash-cream);
  border: 1px solid rgba(0,0,0,.08);
}
.dash-greeting-text h1 { margin: 0; font-size: 24px; font-weight: 800; line-height: 1.1; }
.dash-greeting-text p { margin: 4px 0 0; color: #6b7280; font-size: 14px; }
.dash-edit-btn {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid rgba(0,0,0,.1);
  background: #fff;
  color: #000;
  display: inline-grid;
  place-items: center;
  font-size: 17px;
  transition: background .15s ease, transform .15s ease;
}
.dash-edit-btn:hover { background: var(--dash-lime); transform: translateY(-1px); }
.dash-progress { display: grid; gap: 8px; }
.dash-progress-labels { display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 700; color: var(--dash-ink); }
.dash-progress-track { height: 10px; border-radius: 999px; background: rgba(0,0,0,.08); overflow: hidden; }
.dash-progress-track span { display: block; height: 100%; background: var(--dash-lime); border-radius: inherit; transition: width .3s ease; }
.dash-pill-nav { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.dash-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 72px;
  border-radius: 18px;
  background: #000;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  transition: transform .15s ease;
}
.dash-pill:hover { transform: translateY(-2px); }
.dash-pill i { font-size: 22px; color: var(--dash-lime); }

/* ---------- Timeline card ---------- */
.dash-timeline-card h2 { margin: 0 0 6px; font-size: 26px; font-weight: 800; }
.dash-timeline-card > p { margin: 0 0 18px; color: #4b5563; font-size: 14px; line-height: 1.5; }
.dash-timeline { list-style: none; margin: 0; padding: 0; }
.dash-step {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
  padding: 12px 0;
  position: relative;
}
.dash-step:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 19px;
  top: 52px;
  bottom: -12px;
  width: 2px;
  background: rgba(0,0,0,.08);
}
.dash-step.is-done:not(:last-child)::after { background: var(--dash-lime); }
.dash-step-marker {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  display: inline-grid;
  place-items: center;
  font-size: 17px;
  border: 2px solid rgba(0,0,0,.1);
  background: #f3f4f6;
  color: #6b7280;
  cursor: pointer;
  z-index: 1;
  transition: transform .15s ease;
}
.dash-step-marker:hover { transform: scale(1.06); }
.dash-step.is-done .dash-step-marker { background: var(--dash-lime); border-color: #a7ec4e; color: var(--dash-ink); }
.dash-step.is-next .dash-step-marker { background: var(--dash-pink); border-color: #e859d9; color: #000; width: 48px; height: 48px; font-size: 19px; }
.dash-step-body { display: grid; gap: 6px; align-content: center; min-width: 0; }
.dash-step strong { font-size: 15px; font-weight: 700; color: var(--dash-ink); overflow-wrap: anywhere; }
.dash-step.is-upcoming strong { color: #9ca3af; font-weight: 600; }
.dash-step.is-next strong { color: #000; font-size: 16px; }
.dash-step-meta { display: flex; gap: 8px; flex-wrap: wrap; }
.dash-step-meta span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 24px;
  padding: 3px 10px;
  border-radius: 999px;
  background: #f3f4f6;
  color: #4b5563;
  font-size: 11px;
  font-weight: 800;
}
.dash-step-meta span i { font-size: 13px; }
.dash-step.is-next .dash-step-meta span { background: #fdeeff; color: #a83fae; }
.dash-step-cta {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 4px 14px;
  border-radius: 999px;
  background: var(--dash-lime);
  color: #000;
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
}
.dash-step-done-tag { display: inline-flex; align-items: center; gap: 5px; color: #16a34a; font-size: 12px; font-weight: 800; }

/* ---------- Chat CTA card ---------- */
.dash-chat-cta {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 16px;
  text-decoration: none;
  color: inherit;
  transition: transform .15s ease;
}
.dash-chat-cta:hover { transform: translateY(-2px); }
.dash-chat-cta img { width: 48px; height: 48px; border-radius: 14px; object-fit: contain; background: var(--dash-cream); border: 1px solid rgba(0,0,0,.08); }
.dash-chat-cta-text p { margin: 0; color: #6b7280; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .01em; }
.dash-chat-cta-text h2 { margin: 2px 0 0; font-size: 17px; font-weight: 800; }
.dash-chat-cta-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 18px;
  border-radius: 999px;
  background: #000;
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
}
.dash-chat-cta-btn i { font-size: 17px; color: var(--dash-lime); }

@media (max-width: 640px) {
  .dash-home { gap: 12px; }
  .dash-card { padding: 18px; border-radius: 22px; }
  .dash-avatar { width: 52px; height: 52px; }
  .dash-greeting-text h1 { font-size: 20px; }
  .dash-greeting-text p { font-size: 12px; }
  .dash-pill { min-height: 62px; font-size: 12px; }
  .dash-timeline-card h2 { font-size: 21px; }
  .dash-step-marker { width: 34px; height: 34px; font-size: 15px; }
  .dash-step.is-next .dash-step-marker { width: 40px; height: 40px; font-size: 17px; }
  .dash-step:not(:last-child)::after { left: 16px; }
  .dash-chat-cta { grid-template-columns: auto 1fr; }
  .dash-chat-cta-btn { display: none; }
}
`
