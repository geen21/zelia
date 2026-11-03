import { useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  PiArrowLeft, PiBrain, PiBriefcase, PiChartLineUp, PiChartPie, PiChatDots, PiChatsCircle,
  PiCheckCircle, PiCompass, PiEnvelope, PiFileText, PiGraduationCap, PiHeart, PiIdentificationCard, PiInfo,
  PiMagnifyingGlass, PiMicrophone, PiPath, PiPuzzlePiece, PiSmiley, PiSortAscending,
  PiSignOut, PiSpinnerGap, PiStar, PiToolbox, PiTranslate, PiTrendUp, PiVideoCamera, PiWrench
} from 'react-icons/pi'
import './ToolExperience.css'

const TOOL_ICONS = {
  'ph-video': PiVideoCamera, 'ph-brain': PiBrain, 'ph-translate': PiTranslate,
  'ph-magnifying-glass': PiMagnifyingGlass, 'ph-briefcase': PiBriefcase,
  'ph-file-text': PiFileText, 'ph-identification-card': PiIdentificationCard,
  'ph-sort-ascending': PiSortAscending, 'ph-trend-up': PiTrendUp, 'ph-chart-pie': PiChartPie,
  'ph-info': PiInfo, 'ph-microphone': PiMicrophone, 'ph-chats-circle': PiChatsCircle,
  'ph-path': PiPath, 'ph-star': PiStar, 'ph-envelope': PiEnvelope, 'ph-heart': PiHeart,
  'ph-compass': PiCompass, 'ph-chat-circle-dots': PiChatDots, 'ph-toolbox': PiToolbox,
  'ph-graduation-cap': PiGraduationCap, 'ph-chart-line-up': PiChartLineUp,
  'ph-sign-out': PiSignOut, 'ph-spinner-gap': PiSpinnerGap,
  'ph-smiley': PiSmiley, 'ph-puzzle-piece': PiPuzzlePiece, 'ph-chat-dots': PiChatDots
}

export function ToolIcon({ name, ...props }) {
  const Icon = TOOL_ICONS[name] || PiWrench
  return <Icon aria-hidden="true" focusable="false" {...props} />
}

export function ToolProgress({ current, total, label = 'Question' }) {
  return (
    <div className="tool-progress">
      <div className="tool-progress-label"><span>{label} {current} sur {total}</span><span>{Math.round(current / total * 100)} %</span></div>
      <div className="tool-progress-track" role="progressbar" aria-label={`Progression : ${label.toLowerCase()}`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={current}>
        <span style={{ width: `${current / total * 100}%` }} />
      </div>
    </div>
  )
}

export function ToolFeedback({ correct, children }) {
  return <div className={`tool-feedback${correct ? ' is-correct' : ''}`} role="status">
    <strong>{correct ? 'Bien joué !' : 'À retenir'}</strong>
    <p>{children}</p>
  </div>
}

export function ToolResult({ title, children }) {
  return <section className="tool-panel tool-result" role="status">
    <PiCheckCircle size={36} aria-hidden="true" focusable="false" />
    <h2>{title}</h2>
    {children}
  </section>
}

export default function ToolExperience({ tool, children }) {
  const rootRef = useRef(null)
  useLayoutEffect(() => {
    rootRef.current?.closest('main')?.scrollTo({ top: 0, behavior: 'instant' })
  }, [])
  return <div ref={rootRef} className="tool-experience">
    <Link to="/app/outils" className="tool-back"><PiArrowLeft aria-hidden="true" />Retour aux outils</Link>
    <header className="tool-header">
      <span className="tool-header-icon"><ToolIcon name={tool.icon} size={30} /></span>
      <div>
        <p className="tool-eyebrow">{tool.category}</p>
        <h1>{tool.title}</h1>
        <p className="tool-description">{tool.description}</p>
      </div>
    </header>
    <div className="tool-body">{children}</div>
  </div>
}
