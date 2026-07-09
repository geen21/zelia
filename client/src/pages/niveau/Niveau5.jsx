import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import supabase from '../../lib/supabase'
import { usersAPI } from '../../lib/api'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'

function countWords(text) {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

function normalizeEnglishAnswer(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function includesAny(text, keywords) {
  const normalized = normalizeEnglishAnswer(text)
  return keywords.some((keyword) => normalized.includes(normalizeEnglishAnswer(keyword)))
}

function countSentences(text) {
  return String(text || '').split(/[.!?]+/).map((part) => part.trim()).filter(Boolean).length
}

function countUniqueWords(text) {
  return new Set(normalizeEnglishAnswer(text).split(/\s+/).filter((word) => word.length > 2)).size
}

function scoreOpenText(text, { minWords = 20, targetWords = 45, requireOpinion = false } = {}) {
  const words = countWords(text)
  const uniqueWords = countUniqueWords(text)
  const sentences = countSentences(text)
  const normalized = normalizeEnglishAnswer(text)
  let score = 0

  if (words >= minWords) score += 6
  if (words >= targetWords) score += 4
  if (sentences >= 2) score += 3
  if (sentences >= 4) score += 3
  if (uniqueWords >= 14) score += 3
  if (uniqueWords >= 28) score += 3
  if (includesAny(normalized, ['because', 'although', 'however', 'therefore', 'for example', 'in my opinion'])) score += 4
  if (includesAny(normalized, ['will', 'would', 'could', 'should', 'have been', 'used to'])) score += 3
  if (!/\b(i|you|he|she|we|they)\s+(is|am|are)\s+\w+ed\b/.test(normalized)) score += 2
  if (requireOpinion && includesAny(normalized, ['i think', 'i believe', 'in my opinion', 'important', 'useful', 'future'])) score += 4

  return Math.min(35, score)
}

const QUESTIONS = [
  {
    id: 'listening1',
    section: 'Listening',
    prompt: "What is John's job?",
    audioText: 'Hello, my name is John. I live in London and I work as a teacher. I like reading books and playing football.',
    placeholder: 'Your answer...'
  },
  {
    id: 'listening2',
    section: 'Listening',
    prompt: 'Where are they going?',
    audioText: 'The weather is sunny today. I am going to the park with my friends. We will have a picnic and play games.',
    placeholder: 'Your answer...'
  },
  {
    id: 'speaking1',
    section: 'Speaking',
    prompt: 'Describe your favorite hobby in English. Be as detailed as you can.',
    placeholder: 'Describe your hobby in at least 20 words...',
    minWords: 20
  },
  {
    id: 'reading1',
    section: 'Reading',
    text: 'Cats are popular pets. They are independent and playful. Many people love cats because they are cute and fun.',
    prompt: 'What are cats best described as? (Donne les adjectifs exacts du texte.)',
    placeholder: 'Donne les adjectifs exacts...'
  },
  {
    id: 'reading2',
    section: 'Reading',
    text: 'Maya missed the first train, so she arrived at the interview ten minutes late. She apologized and explained the situation politely.',
    prompt: 'Why was Maya late?',
    placeholder: 'Explain briefly in English...'
  },
  {
    id: 'writing1',
    section: 'Writing',
    prompt: 'Write a short paragraph about your daily routine. Use at least 5 sentences and try to link ideas with words like because, then, after or however.',
    placeholder: 'Write your paragraph...',
    minSentences: 5
  },
  {
    id: 'vocab1',
    section: 'Vocabulary',
    prompt: "What does 'happy' mean? Choose: a) sad, b) joyful, c) angry",
    placeholder: 'a, b, or c...'
  },
  {
    id: 'vocab2',
    section: 'Vocabulary',
    prompt: "What does 'reliable' mean? Choose: a) someone you can trust, b) very expensive, c) difficult to understand",
    placeholder: 'a, b, or c...'
  },
  {
    id: 'grammar1',
    section: 'Grammar',
    prompt: "Fill in the blank: 'I ___ to school every day.' (go, goes, going)",
    placeholder: 'Your answer...'
  },
  {
    id: 'grammar2',
    section: 'Grammar',
    prompt: "Fill in the blank: 'She has lived in Paris ___ 2020.' (for, since, during)",
    placeholder: 'Your answer...'
  },
  {
    id: 'conversation1',
    section: 'Conversation',
    prompt: 'What do you think about learning English? Why is it important for your future? Réponds en détaillant au moins 25 mots.',
    placeholder: 'Share your thoughts in at least 25 words...',
    minWords: 25
  }
]

const SECTIONS = [...new Set(QUESTIONS.map((q) => q.section))]

function validateAnswer(question, rawValue) {
  const value = (rawValue || '').trim()
  if (!value) return 'Réponse requise.'
  if (question.minWords) {
    const count = countWords(value)
    if (count < question.minWords) return `Écris au moins ${question.minWords} mots. (${count} pour l'instant)`
  }
  if (question.minSentences) {
    const sentences = countSentences(value)
    if (sentences < question.minSentences) return `Écris au moins ${question.minSentences} phrases. (${sentences} pour l'instant)`
  }
  return ''
}

function calculateEnglishAssessment(answers) {
  const listening = [
    includesAny(answers.listening1, ['teacher', 'professor']) ? 15 : 0,
    includesAny(answers.listening2, ['park', 'picnic']) ? 15 : 0
  ].reduce((sum, value) => sum + value, 0)

  const reading = [
    includesAny(answers.reading1, ['independent']) ? 7 : 0,
    includesAny(answers.reading1, ['playful']) ? 7 : 0,
    includesAny(answers.reading1, ['cute', 'fun']) ? 4 : 0,
    includesAny(answers.reading2, ['missed', 'train']) ? 12 : 0
  ].reduce((sum, value) => sum + value, 0)

  const vocabulary = [
    normalizeEnglishAnswer(answers.vocab1) === 'b' || includesAny(answers.vocab1, ['joyful']) ? 15 : 0,
    normalizeEnglishAnswer(answers.vocab2) === 'a' || includesAny(answers.vocab2, ['trust', 'can trust']) ? 15 : 0
  ].reduce((sum, value) => sum + value, 0)

  const grammar = [
    normalizeEnglishAnswer(answers.grammar1) === 'go' ? 15 : 0,
    normalizeEnglishAnswer(answers.grammar2) === 'since' ? 15 : 0
  ].reduce((sum, value) => sum + value, 0)

  const speaking = scoreOpenText(answers.speaking1, { minWords: 20, targetWords: 45 })
  const writing = scoreOpenText(answers.writing1, { minWords: 45, targetWords: 75 })
  const conversation = scoreOpenText(answers.conversation1, { minWords: 25, targetWords: 55, requireOpinion: true })
  const production = Math.min(70, speaking + Math.max(writing, conversation))
  const total = listening + reading + vocabulary + grammar + production

  const level = total < 45 ? 'A1'
    : total < 75 ? 'A2'
      : total < 110 ? 'B1'
        : total < 140 ? 'B2'
          : total < 165 ? 'C1'
            : 'C2'

  return {
    level,
    score: total,
    maxScore: 190,
    skills: { listening, reading, vocabulary, grammar, production }
  }
}

function getLevelMessage(level) {
  const messages = {
    A1: "Niveau A1 (débutant). L'anglais est essentiel pour ton avenir professionnel, car c'est la langue internationale des affaires. À ce niveau débutant, concentre-toi sur les bases : vocabulaire quotidien, phrases simples. Avec de la pratique régulière, tu progresseras rapidement vers des niveaux plus avancés qui ouvriront des opportunités internationales.",
    A2: "Niveau A2 (élémentaire). L'anglais est essentiel pour ton avenir professionnel, car c'est la langue internationale des affaires et de la technologie. À ce niveau élémentaire, tu peux déjà communiquer sur des sujets familiers. Continue à pratiquer pour atteindre B1 et améliorer ton employabilité sur le marché international.",
    B1: "Niveau B1 (intermédiaire). L'anglais est essentiel pour ton avenir professionnel, car c'est la langue internationale des affaires, de la technologie et de la communication. À ce niveau intermédiaire, tu peux discuter de sujets variés et comprendre des textes plus complexes. Cela te donne déjà un avantage compétitif ; vise B2 pour des opportunités encore plus élevées.",
    B2: "Niveau B2 (intermédiaire avancé). L'anglais est essentiel pour ton avenir professionnel, car c'est la langue internationale des affaires, de la technologie et de la communication. À ce niveau avancé, tu maîtrises la langue couramment. Cela ouvre des portes vers des postes internationaux et des carrières dans des entreprises multinationales. Continue à te perfectionner pour atteindre C1.",
    C1: "Niveau C1 (avancé). L'anglais est essentiel pour ton avenir professionnel, car c'est la langue internationale des affaires, de la technologie et de la communication. À ce niveau avancé, tu utilises l'anglais avec aisance et précision. Cela te positionne pour des rôles de leadership international et des opportunités dans des secteurs de pointe. Vise C2 pour une maîtrise totale.",
    C2: "Niveau C2 (maîtrise). L'anglais est essentiel pour ton avenir professionnel, car c'est la langue internationale des affaires, de la technologie et de la communication. À ce niveau expert, tu maîtrises parfaitement l'anglais. Cela te donne accès aux meilleures opportunités professionnelles mondiales, y compris dans des domaines spécialisés et innovants. Félicitations pour ce niveau exceptionnel !"
  }
  return messages[level] || `Niveau estimé : ${level}. Continue à pratiquer !`
}

function buildNiveau5ExtraInfoEntries({ answers, assessment }) {
  const entries = QUESTIONS.map((question) => ({
    question_id: `niv5_${question.id}`,
    question_text: question.prompt,
    answer_text: (answers?.[question.id] ?? '').toString()
  }))

  entries.push({
    question_id: 'niv5_english_level',
    question_text: "Niveau d'anglais (CEFR) calculé",
    answer_text: assessment.level
  })

  entries.push({
    question_id: 'niv5_english_assessment',
    question_text: "Score détaillé du test d'anglais",
    answer_text: JSON.stringify(assessment)
  })

  return entries
}

export default function Niveau5() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [answers, setAnswers] = useState({})
  const [touched, setTouched] = useState({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [assessment, setAssessment] = useState(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { navigate('/login'); return }
      } catch (e) {
        console.error(e)
        if (!mounted) return
        setError('Erreur de chargement')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  const speakText = useCallback((text) => {
    if (!text || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-US'
    utterance.rate = 0.85
    window.speechSynthesis.speak(utterance)
  }, [])

  const setAnswer = (id, value) => {
    setAnswers((prev) => ({ ...prev, [id]: value }))
  }

  const errorsById = useMemo(() => {
    const map = {}
    QUESTIONS.forEach((question) => {
      map[question.id] = validateAnswer(question, answers[question.id])
    })
    return map
  }, [answers])

  const canSubmit = useMemo(
    () => QUESTIONS.every((question) => !errorsById[question.id]),
    [errorsById]
  )

  async function handleSubmit() {
    setSubmitAttempted(true)
    if (!canSubmit || saving) return

    setSaving(true)
    setError('')
    try {
      const result = calculateEnglishAssessment(answers)
      setAssessment(result)

      try {
        const entries = buildNiveau5ExtraInfoEntries({ answers, assessment: result })
        await usersAPI.saveExtraInfo(entries)
      } catch (e) {
        console.warn('Persist Niveau5 extra info failed (non-blocking):', e)
      }

      try {
        await levelUp({ minLevel: 5, xpReward: XP_PER_LEVEL })
      } catch (e) {
        console.warn('Progression update failed (non-blocking):', e)
      }
    } catch (e) {
      console.error('English assessment failed', e)
      setError("Impossible de calculer ton niveau pour l'instant. Réessaie.")
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

  return (
    <div className="p-2 md:p-6">
      <style>{styles}</style>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="niv5-card">
          <div className="niv5-card-bar" />
          <h1 className="text-xl md:text-2xl font-bold mb-1">Test d'anglais</h1>
          <p className="text-text-secondary">
            Réponds à toutes les questions ci-dessous (listening, reading, writing, vocabulaire, grammaire) puis clique sur « Évaluer mon niveau ».
            Estimation indicative du niveau CECR (A1 à C2) — cela ne remplace pas un test officiel.
          </p>
        </div>

        {SECTIONS.map((section) => (
          <div key={section} className="niv5-card">
            <div className="niv5-card-bar" />
            <h2 className="text-lg font-bold mb-4">{section}</h2>
            <div className="space-y-5">
              {QUESTIONS.filter((question) => question.section === section).map((question) => {
                const value = answers[question.id] || ''
                const showError = (touched[question.id] || submitAttempted) && errorsById[question.id]
                return (
                  <div key={question.id} className="niv5-question">
                    {question.audioText && (
                      <button type="button" className="niv5-audio-btn" onClick={() => speakText(question.audioText)}>
                        <i className="ph ph-speaker-high" aria-hidden="true" />
                        Écouter l'audio
                      </button>
                    )}
                    {question.text && (
                      <p className="niv5-passage">“{question.text}”</p>
                    )}
                    <label className="niv5-prompt">{question.prompt}</label>
                    <textarea
                      className="niv5-textarea"
                      placeholder={question.placeholder}
                      value={value}
                      onChange={(e) => setAnswer(question.id, e.target.value)}
                      onBlur={() => setTouched((prev) => ({ ...prev, [question.id]: true }))}
                    />
                    {(question.minWords || question.minSentences) && (
                      <p className="niv5-hint">
                        {question.minWords ? `${countWords(value)} / ${question.minWords} mots minimum` : `${countSentences(value)} / ${question.minSentences} phrases minimum`}
                      </p>
                    )}
                    {showError && <p className="niv5-error">{errorsById[question.id]}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        <div className="niv5-card">
          <div className="niv5-card-bar accent-ink" />
          {error && <p className="niv5-error mb-3">{error}</p>}
          <button type="button" className="niv5-submit-btn" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Analyse en cours…' : "Évaluer mon niveau"}
          </button>
          {submitAttempted && !canSubmit && (
            <p className="niv5-error mt-3">Complète toutes les réponses (respecte les minimums de mots/phrases indiqués) avant de valider.</p>
          )}
        </div>

        {assessment && (
          <div className="niv5-card">
            <div className="niv5-card-bar accent-pink" />
            <h2 className="text-lg font-bold mb-3">Ton résultat</h2>
            <p className="niv5-result-text">{getLevelMessage(assessment.level)}</p>
            <div className="niv5-skills-grid">
              {Object.entries(assessment.skills).map(([skill, value]) => (
                <div key={skill} className="niv5-skill-tile">
                  <span>{skill}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const styles = `
.niv5-card {
  position: relative;
  background: #fff;
  border: 1px solid rgba(0,0,0,.06);
  border-radius: 24px;
  box-shadow: 0 22px 50px -28px rgba(0,0,0,.2), 0 2px 8px rgba(0,0,0,.04);
  padding: 22px;
}
.niv5-card-bar {
  position: absolute;
  top: 0;
  left: 26px;
  right: 26px;
  height: 5px;
  border-radius: 0 0 6px 6px;
  background: #c1ff72;
}
.niv5-card-bar.accent-ink { background: #111827; }
.niv5-card-bar.accent-pink { background: #f68fff; }
.niv5-question { border-top: 1px solid rgba(0,0,0,.06); padding-top: 16px; }
.niv5-question:first-child { border-top: none; padding-top: 0; }
.niv5-audio-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(0,0,0,.12);
  background: #fff;
  border-radius: 999px;
  padding: 8px 14px;
  font-weight: 700;
  font-size: 13px;
  margin-bottom: 10px;
}
.niv5-passage {
  font-style: italic;
  background: #fffbf7;
  border: 1px solid rgba(0,0,0,.06);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 10px;
}
.niv5-prompt { display: block; font-weight: 700; margin-bottom: 8px; }
.niv5-textarea {
  width: 100%;
  min-height: 90px;
  border: 1px solid rgba(0,0,0,.12);
  border-radius: 14px;
  padding: 12px 14px;
  outline: none;
  font: inherit;
  resize: vertical;
}
.niv5-textarea:focus { border-color: #000; }
.niv5-hint { margin-top: 6px; font-size: 12px; color: #6b7280; }
.niv5-error { margin-top: 6px; font-size: 13px; color: #dc2626; font-weight: 600; }
.niv5-submit-btn {
  width: 100%;
  min-height: 48px;
  border-radius: 999px;
  background: #c1ff72;
  border: none;
  font-weight: 800;
  font-size: 15px;
  cursor: pointer;
}
.niv5-submit-btn:disabled { opacity: .6; cursor: not-allowed; }
.niv5-result-text { white-space: pre-line; line-height: 1.6; margin-bottom: 16px; }
.niv5-skills-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
@media (min-width: 640px) { .niv5-skills-grid { grid-template-columns: repeat(5, 1fr); } }
.niv5-skill-tile {
  background: #fffbf7;
  border: 1px solid rgba(0,0,0,.06);
  border-radius: 14px;
  padding: 10px;
  text-align: center;
}
.niv5-skill-tile span { display: block; text-transform: uppercase; font-size: 11px; color: #6b7280; margin-bottom: 4px; }
.niv5-skill-tile strong { font-size: 18px; }
`
