import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PiCheck, PiX } from 'react-icons/pi'
import { supabase } from '../lib/supabase'
import { ToolFeedback, ToolProgress, ToolResult } from './ToolExperience'

export default function ToolStatisticsQuiz({ questions, onSave }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState(null)
  const [answers, setAnswers] = useState([])
  const [revealed, setRevealed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [completed, setCompleted] = useState(false)
  const questionRef = useRef(null)
  const question = questions[index]
  const score = answers.filter(Boolean).length

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return
      if (error) throw error
      if (!data.user) navigate('/login')
    }).catch((loadError) => {
      console.error('Tool quiz access failed', loadError)
      if (active) setError('Impossible de charger le quiz. Recharge la page pour réessayer.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [navigate])

  useEffect(() => {
    if (index > 0) questionRef.current?.focus()
  }, [index])

  const advance = async () => {
    if (saving) return
    if (index < questions.length - 1) {
      setIndex(index + 1)
      setSelected(null)
      setRevealed(false)
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(score)
      setCompleted(true)
    } catch (saveError) {
      console.error('Tool quiz save failed', saveError)
      setError("Impossible d'enregistrer ton score. Réessaie, tes réponses sont conservées.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="tool-state" role="status">Chargement du quiz…</p>
  if (completed) return <ToolResult title={`Score enregistré : ${score}/${questions.length}`}>
    <p>Chaque réponse est une occasion d'apprendre. Tu peux refaire le quiz pour revoir les explications.</p>
    <div className="tool-actions">
      <button type="button" className="tool-secondary" onClick={() => {
        setIndex(0); setSelected(null); setAnswers([]); setRevealed(false); setCompleted(false)
      }}>Refaire le quiz</button>
      <Link to="/app/outils" className="tool-primary">Retour aux outils</Link>
    </div>
  </ToolResult>

  return <div className="tool-stack">
    {error && <p className="tool-error" role="alert">{error}</p>}
    <section className="tool-panel">
      <ToolProgress current={index + 1} total={questions.length} />
      <div className="tool-stat-layout">
        <aside className="tool-stat" aria-label={`Chiffre à décrypter : ${question.stat} %`}>
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <circle cx="100" cy="100" r="76" fill="none" stroke="#e2e8d8" strokeWidth="22" />
            <circle cx="100" cy="100" r="76" fill="none" stroke="#87b955" strokeWidth="22" strokeDasharray={`${question.stat / 100 * 477.52} 477.52`} strokeLinecap="round" transform="rotate(-90 100 100)" />
            <text x="100" y="107" textAnchor="middle" fill="#111827" fontSize="32" fontWeight="800">{question.stat}%</text>
          </svg>
          <p>Source : {question.source}</p>
        </aside>
        <div>
          <h2 className="tool-question" ref={questionRef} tabIndex={-1}>{question.question}</h2>
          <div className="tool-choices" role="group" aria-label="Choisis ta réponse">
            {question.options.map((option) => {
              const correct = option.id === question.correct
              const chosen = selected === option.id
              return <button type="button" key={option.id} aria-pressed={chosen} disabled={revealed}
                className={`tool-choice${chosen ? ' is-selected' : ''}${revealed && correct ? ' is-correct' : revealed && chosen ? ' is-incorrect' : ''}`}
                onClick={() => setSelected(option.id)}>
                <span className="tool-choice-key">{option.id}</span><span>{option.text}</span>
                {revealed && correct && <PiCheck aria-label="Bonne réponse" />}
                {revealed && chosen && !correct && <PiX aria-label="Réponse incorrecte" />}
              </button>
            })}
          </div>
          {revealed && <ToolFeedback correct={selected === question.correct}>{question.explanation}</ToolFeedback>}
          <div className="tool-actions">
            {revealed
              ? <button type="button" className="tool-primary" onClick={advance} disabled={saving}>{saving ? 'Enregistrement…' : index < questions.length - 1 ? 'Question suivante' : 'Enregistrer mon score'}</button>
              : <button type="button" className="tool-primary" disabled={!selected} onClick={() => {
                setAnswers([...answers, selected === question.correct])
                setRevealed(true)
              }}>Vérifier ma réponse</button>}
          </div>
        </div>
      </div>
    </section>
  </div>
}
