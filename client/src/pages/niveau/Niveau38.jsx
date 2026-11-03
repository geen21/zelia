import ToolScenarioGame from '../../components/ToolScenarioGame'
import { usersAPI } from '../../lib/api'
import { XP_PER_LEVEL, completeQuest, levelUp } from '../../lib/progression'

const SITUATIONS = [
  {
    id: 'analysis',
    title: "Situation 1 : L'analyse",
    type: 'qcm',
    context: "Tu travailles dans un café. C’est le coup de feu, il y a 10 personnes qui attendent, et soudain, la machine à café tombe en panne et fuit partout.",
    question: "Quelle est ta toute première réaction pour résoudre ce problème efficacement ?",
    options: [
      "Commencer à éponger l'eau immédiatement.",
      "S'excuser auprès des clients et appeler un réparateur.",
      "Identifier la source de la fuite et couper l'arrivée d'eau/électricité.",
      "Paniquer et demander au collègue de gérer."
    ],
    correctIndex: 2,
    explanation: "Avant de réparer ou de communiquer, il faut stopper l'aggravation du problème (confinement)."
  },
  {
    id: 'priorization',
    title: "Situation 2 : Priorisation",
    type: 'drag',
    context: "Tu es stagiaire en communication. Ton maître de stage te confie 4 tâches à faire en 1h avant une réunion importante.",
    question: "Classe-les de la plus prioritaire (1) à la moins urgente (4).",
    options: [
      { id: 'A', text: "Commander les pizzas pour le déjeuner de demain." },
      { id: 'B', text: "Imprimer et agrafer les 10 dossiers pour la réunion de dans 1h." },
      { id: 'C', text: "Répondre à un commentaire sur Instagram datant d'hier." },
      { id: 'D', text: "Corriger une faute d'orthographe sur la présentation qui va être projetée à la réunion." }
    ],
    correctOrder: ['D', 'B', 'C', 'A'],
    explanation: "L'impact immédiat sur la réunion est la priorité absolue (Erreur visuelle > Logistique immédiate)."
  },
  {
    id: 'critical',
    title: "Situation 3 : Pensée critique",
    type: 'truefalse',
    context: "On te confie une mission : « Augmenter les ventes de glaces du magasin ». Tu remarques que les ventes baissent quand il pleut.",
    question: "En résolution de problème, une corrélation signifie forcément une causalité.",
    options: ['Vrai', 'Faux'],
    correctIndex: 1,
    explanation: "Il peut y avoir d'autres causes. Il faut toujours vérifier ses hypothèses."
  },
  {
    id: 'creativity',
    title: "Situation 4 : Créativité",
    type: 'qcm',
    context: "Tu organises une soirée étudiante. Le DJ annule à 2h de l'évènement. Tu n'as pas de budget supplémentaire.",
    question: "Quelle solution illustre le mieux la débrouillardise ?",
    options: [
      "Annuler la soirée.",
      "Brancher un téléphone avec une playlist collaborative où chaque invité peut ajouter un titre.",
      "Emprunter de l'argent pour payer un DJ de luxe en urgence.",
      "Mettre la radio en espérant que ça plaise."
    ],
    correctIndex: 1,
    explanation: "C'est une solution à coût zéro qui transforme un problème en animation interactive."
  },
  {
    id: 'decision',
    title: "Situation 5 : Prise de décision",
    type: 'qcm',
    context: "Tu travailles en équipe sur un projet. Un membre ne rend pas sa partie à temps, ce qui bloque tout le monde.",
    question: "Le chef de projet te demande qui est responsable. Que fais-tu ?",
    options: [
      "Tu le dénonces directement pour te protéger.",
      "Tu ignores le message et tu attends que ça passe.",
      "Tu proposes une solution collective sans pointer du doigt."
    ],
    correctIndex: 2,
    explanation: "La résolution de problème en entreprise est souvent relationnelle. L'objectif est le résultat, pas le coupable."
  }
]

export default function Niveau38() {
  return <ToolScenarioGame situations={SITUATIONS} summary="Analyser, prioriser, vérifier ses hypothèses : garde ces réflexes pour tes prochains projets." onSave={async () => {
    await usersAPI.saveExtraInfo([{
      question_id: 'niveau38_problem_solving_completed',
      question_text: 'Résolution de problèmes (situations)',
      answer_text: JSON.stringify({
        situationsCompleted: SITUATIONS.length,
        situationsSummary: SITUATIONS.map((situation) => situation.title).join(', '),
        completedAt: new Date().toISOString()
      })
    }])
    await levelUp({ minLevel: 38, xpReward: XP_PER_LEVEL })
    await completeQuest('tool:resolution-problemes')
  }} />
}
