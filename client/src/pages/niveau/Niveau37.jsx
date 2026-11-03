import ToolStatisticsQuiz from '../../components/ToolStatisticsQuiz'
import { usersAPI } from '../../lib/api'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'

const QUIZ_DATA = [
  {
    id: 1,
    stat: 78,
    color: '#22c55e',
    source: 'linkedin.com / talent insights',
    question: 'Que représente ce pourcentage selon toi ?',
    options: [
      { id: 'A', text: 'La part des recruteurs qui regardent aussi les soft skills au-delà du diplôme.' },
      { id: 'B', text: 'La part des élèves qui changent de lycée.' },
      { id: 'C', text: 'La part des métiers sans travail en équipe.' }
    ],
    correct: 'A',
    explanation: 'Les compétences comportementales comme la communication, l\'organisation ou l\'adaptabilité comptent fortement dans le recrutement.'
  },
  {
    id: 2,
    stat: 44,
    color: '#f59e0b',
    source: 'worldeconomicforum.org',
    question: 'Et celui-ci, à quoi correspond-il ?',
    options: [
      { id: 'A', text: 'La part de ton temps de sommeil en terminale.' },
      { id: 'B', text: 'Le pourcentage de compétences qui devraient évoluer dans de nombreux métiers dans les prochaines années.' },
      { id: 'C', text: 'Le pourcentage de notes au-dessus de 15.' }
    ],
    correct: 'B',
    explanation: 'Les métiers évoluent vite. Développer ses compétences transférables aide à rester à l\'aise face aux changements.'
  },
  {
    id: 3,
    stat: 69,
    color: '#3b82f6',
    source: 'coursera.org / job skills reports',
    question: 'Dernier graphique : que peut représenter ce chiffre ?',
    options: [
      { id: 'A', text: 'La part des recruteurs qui valorisent les preuves concrètes de compétence : projets, expériences, réalisations.' },
      { id: 'B', text: 'La part des étudiants qui détestent apprendre.' },
      { id: 'C', text: 'La part des métiers sans outils numériques.' }
    ],
    correct: 'A',
    explanation: 'Une compétence a plus de valeur quand tu peux la montrer avec une expérience concrète, même petite.'
  }
]

export default function Niveau37() {
  return <ToolStatisticsQuiz questions={QUIZ_DATA} onSave={async (score) => {
    await usersAPI.saveExtraInfo([
      { question_id: 'niveau37_skills_quiz_score', question_text: 'Score quiz compétences', answer_text: `${score}/${QUIZ_DATA.length} bonnes réponses` },
      { question_id: 'niveau37_skills_quiz_completed', question_text: 'Quiz compétences complété', answer_text: JSON.stringify({ score: `${score}/${QUIZ_DATA.length}`, completedAt: new Date().toISOString() }) }
    ])
    await levelUp({ minLevel: 37, xpReward: XP_PER_LEVEL })
  }} />
}
