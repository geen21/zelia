import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PiCheck, PiX } from 'react-icons/pi'
import { supabase } from '../lib/supabase'
import { ToolFeedback, ToolProgress, ToolResult } from './ToolExperience'
import ToolRanking from './ToolRanking'

export default function ToolScenarioGame({ situations, onSave, summary }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [finished, setFinished] = useState(false)
  const [saving, setSaving] = useState(false)
  const [order, setOrder] = useState([])
  const questionRef = useRef(null)
  const situation = situations[index]
  const correct = situation.type === 'drag'
    ? order.every((item, position) => item.id === situation.correctOrder[position])
    : selected === situation.correctIndex

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return
      if (error) throw error
      if (!data.user) navigate('/login')
    }).catch((loadError) => {
      console.error('Tool game access failed', loadError)
      if (active) setError('Impossible de charger le jeu. Recharge la page pour réessayer.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [navigate])

  useEffect(() => {
    setOrder(situation.type === 'drag' ? situation.options.map((item) => ({ id: item.id, label: item.text })) : [])
    if (index > 0) questionRef.current?.focus()
  }, [index, situation])

  const save = async () => {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await onSave()
      navigate('/app')
    } catch (saveError) {
      console.error('Tool game save failed', saveError)
      setError("Impossible d'enregistrer le jeu. Réessaie, ta progression est conservée.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="tool-state" role="status">Chargement du jeu…</p>
  return <div className="tool-stack">
    {error && <p className="tool-error" role="alert">{error}</p>}
    {finished ? <ToolResult title="Les cinq situations sont terminées !">
      <p>{summary}</p>
      <div className="tool-actions"><button type="button" className="tool-primary" disabled={saving} onClick={save}>{saving ? 'Enregistrement…' : 'Enregistrer et terminer'}</button></div>
    </ToolResult> : <section className="tool-panel">
      <ToolProgress current={index + 1} total={situations.length} label="Situation" />
      <p className="tool-game-heading">{situation.title}</p>
      <div className="tool-context"><strong>La situation</strong>{situation.context}</div>
      <h2 className="tool-question" ref={questionRef} tabIndex={-1}>{situation.question}</h2>
      {situation.type === 'drag'
        ? <>
          <ToolRanking items={order} onChange={setOrder} disabled={revealed} />
          {!revealed && <div className="tool-actions"><button type="button" className="tool-primary" onClick={() => setRevealed(true)}>Valider l'ordre</button></div>}
        </>
        : <div className="tool-choices" role="group" aria-label="Choisis ta réponse">
          {situation.options.map((option, position) => <button type="button" key={option}
            className={`tool-choice${selected === position ? ' is-selected' : ''}${revealed && position === situation.correctIndex ? ' is-correct' : revealed && selected === position ? ' is-incorrect' : ''}`}
            aria-pressed={selected === position} disabled={revealed} onClick={() => { setSelected(position); setRevealed(true) }}>
            <span className="tool-choice-key">{String.fromCharCode(65 + position)}</span><span>{option}</span>
            {revealed && position === situation.correctIndex && <PiCheck aria-label="Bonne réponse" />}
            {revealed && selected === position && !correct && <PiX aria-label="Réponse incorrecte" />}
          </button>)}
        </div>}
      {revealed && <>
        <ToolFeedback correct={correct}>{situation.explanation}</ToolFeedback>
        <div className="tool-actions"><button type="button" className="tool-primary" onClick={() => {
          if (index === situations.length - 1) setFinished(true)
          else setIndex(index + 1)
          setRevealed(false)
          setSelected(null)
        }}>{index < situations.length - 1 ? 'Situation suivante' : 'Voir le résultat'}</button></div>
      </>}
    </section>}
  </div>
}
