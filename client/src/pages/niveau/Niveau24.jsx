import ToolStatisticsQuiz from '../../components/ToolStatisticsQuiz'
import { usersAPI } from '../../lib/api'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'

const QUIZ_DATA = [
  {
    id: 1,
    stat: 30,
    color: '#ef4444', // red
    source: 'superfutur.fr/reorientation-etudiant',
    question: 'Que représente ce pourcentage selon toi ?',
    options: [
      { id: 'A', text: "Le pourcentage de personnes qui apprécient leurs études" },
      { id: 'B', text: "Le pourcentage de personnes qui abandonnent leurs études la 1ère année" },
      { id: 'C', text: "Le pourcentage de personnes qui n'aiment pas Zélia" }
    ],
    correct: 'B',
    explanation: "30% des étudiants ne vont pas au-delà de leur 1ère année d'études supérieures."
  },
  {
    id: 2,
    stat: 40,
    color: '#f59e0b', // orange
    source: 'onisep.fr',
    question: 'Et celui-ci, que représente-t-il ?',
    options: [
      { id: 'A', text: "Le pourcentage d'étudiants qui se réorientent après le bac" },
      { id: 'B', text: "Le pourcentage d'étudiants qui partent à l'étranger" },
      { id: 'C', text: "Le pourcentage d'étudiants satisfaits de leur orientation" }
    ],
    correct: 'A',
    explanation: "Environ 40% des étudiants changent de filière ou se réorientent dans les 2 premières années après le bac."
  },
  {
    id: 3,
    stat: 65,
    color: '#22c55e', // green
    source: 'cereq.fr',
    question: 'Dernier graphique ! Que représente ce pourcentage ?',
    options: [
      { id: 'A', text: "Le pourcentage de jeunes qui trouvent un emploi stable 3 ans après leur diplôme" },
      { id: 'B', text: "Le pourcentage d'étudiants qui font des études longues" },
      { id: 'C', text: "Le pourcentage de bacheliers qui poursuivent des études supérieures" }
    ],
    correct: 'C',
    explanation: "Environ 65% des bacheliers poursuivent des études dans l'enseignement supérieur."
  }
]

export default function Niveau24() {
  return <ToolStatisticsQuiz questions={QUIZ_DATA} onSave={async (score) => {
    await usersAPI.saveExtraInfo([
      { question_id: 'niveau24_quiz_score', question_text: 'Score quiz orientation', answer_text: `${score}/${QUIZ_DATA.length} bonnes réponses` },
      { question_id: 'niveau24_quiz_completed', question_text: 'Quiz statistiques complété', answer_text: 'Oui' }
    ])
    await levelUp({ minLevel: 24, xpReward: XP_PER_LEVEL })
  }} />
}
