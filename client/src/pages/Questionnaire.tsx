import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

export default function Questionnaire() {
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get('/api/questionnaire/questions')
        setQuestions(data)
      } catch (e: any) {
        setError('Échec du chargement des questions')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      const payload = { answers: Object.entries(answers).map(([qid, ans]) => ({ question_id: Number(qid), answer: ans })) }
      await axios.post('/api/questionnaire/submit', payload, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      // Generate results immediately
      await axios.post('/api/results/generate', { type: 'unified' }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      navigate('/app/results')
    } catch (e) {
      setError('Échec de l\'envoi')
    }
  }

  if (loading) return <div className="container"><p>Chargement...</p></div>

  return (
    <div className="aximo-all-section bg-light2">
      <div className="container" style={{paddingTop:'60px', paddingBottom:'60px'}}>
        <div className="aximo-section-title center clash-grotesk">
          <h2>Questionnaire</h2>
          <p>Réponds aux 50 questions suivantes.</p>
        </div>
        {error && <div className="text-danger text-center mb-3">{error}</div>}
        <form onSubmit={handleSubmit} className="aximo-contact-form">
      {questions.map((q, idx) => (
            <div className="row align-items-center mb-3" key={q.id}>
        <div className="col-md-8"><strong>{idx+1}. </strong>{q.contenu}</div>
              <div className="col-md-4">
                <select className="form-select" value={answers[q.id] || ''} onChange={e=>setAnswers(a=>({...a, [q.id]: e.target.value}))} required>
                  <option value="" disabled>Choisir...</option>
          <option value="Oui">Oui</option>
          <option value="Un peu">Un peu</option>
          <option value="Je ne sais pas">Je ne sais pas</option>
          <option value="Pas trop">Pas trop</option>
          <option value="Non">Non</option>
                </select>
              </div>
            </div>
          ))}
          <button type="submit" className="aximo-default-btn">
            <span className="aximo-label-up">Envoyer</span>
          </button>
        </form>
      </div>
    </div>
  )
}
