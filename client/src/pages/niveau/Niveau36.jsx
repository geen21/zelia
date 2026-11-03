import ToolScenarioGame from '../../components/ToolScenarioGame'
import { usersAPI } from '../../lib/api'
import { XP_PER_LEVEL, completeQuest, levelUp } from '../../lib/progression'

const SITUATIONS = [
  {
    id: 'pivot',
    title: 'Situation 1 : Le Pivot Technologique',
    type: 'truefalse',
    context: "Tu as passé deux jours à préparer une présentation sur un logiciel spécifique. Arrivé en réunion, ton tuteur te dit : \"On change d'outil, on passe sur cette nouvelle application dès maintenant\".",
    question: "L'adaptabilité, c'est accepter immédiatement le changement sans poser de questions, même si tu ne maîtrises pas le nouvel outil.",
    options: ['Vrai', 'Faux'],
    correctIndex: 1,
    explanation: "L'adaptabilité, c'est l'agilité, pas la soumission aveugle. La bonne réaction est d'accepter le changement tout en communiquant sur ses besoins."
  },
  {
    id: 'relation',
    title: "Situation 2 : L'Imprévu Relationnel",
    type: 'qcm',
    context: "Tu travailles en équipe sur un projet scolaire/pro. Un membre très investi quitte soudainement le groupe. L'ambiance devient tendue et le travail est bloqué.",
    question: "Quelle est l'attitude la plus adaptable ?",
    options: [
      'Maintenir le plan initial coûte que coûte en travaillant deux fois plus.',
      'Proposer une réunion d\'urgence pour redistribuer les rôles selon les forces de chacun.',
      'Attendre que le professeur ou le manager règle le problème.',
      'Te plaindre du départ du membre pour justifier un futur retard.'
    ],
    correctIndex: 1,
    explanation: "S'adapter, c'est savoir réorganiser les ressources disponibles face à une nouvelle contrainte."
  },
  {
    id: 'priority',
    title: 'Situation 3 : Hiérarchie des Priorités',
    type: 'drag',
    context: "Tu es en plein petit job d'été. Voici 4 événements qui surviennent en même temps.",
    question: "Range-les par ordre d'adaptation (du plus urgent au moins urgent).",
    options: [
      { id: 'A', text: "Ton manager te demande de l'aider sur une tâche qu'il n'avait pas prévue." },
      { id: 'B', text: 'Un client mécontent arrive avec une réclamation imprévue.' },
      { id: 'C', text: 'Tu reçois une notification pour une tâche que tu devais finir ce soir.' },
      { id: 'D', text: 'La connexion internet coupe, empêchant l\'usage de ta caisse/logiciel.' }
    ],
    correctOrder: ['D', 'B', 'A', 'C'],
    explanation: "L'adaptabilité commence par gérer le blocage technique majeur, puis l'urgence humaine, avant de réorganiser les consignes du manager et ses propres tâches."
  },
  {
    id: 'comfort',
    title: 'Situation 4 : Sortir de sa zone de confort',
    type: 'qcm',
    context: "Tu as postulé pour être vendeur. En arrivant, on te dit que l'équipe d'inventaire est en sous-effectif et on te demande d'aller compter des stocks en réserve toute la journée.",
    question: 'Ta réaction :',
    options: [
      "Désolé, j'ai été embauché pour vendre, pas pour compter des cartons.",
      "Pas de souci, je le fais, mais je vais traîner des pieds car c'est ennuyeux.",
      "C'est différent de ce qui était prévu, mais c'est l'occasion de voir l'envers du décor du magasin."
    ],
    correctIndex: 2,
    explanation: "C'est ce qu'on appelle le Growth Mindset. L'adaptabilité est une question de perception : voir une corvée comme un apprentissage."
  },
  {
    id: 'lateral',
    title: 'Situation 5 : La Pensée Latérale',
    type: 'qcm',
    context: "Tu dois livrer un colis important à vélo. Le pont principal est fermé pour travaux, et tu n'as plus de batterie sur ton GPS.",
    question: "Quelle action montre une capacité d'adaptation originale ?",
    options: [
      'Faire demi-tour et rentrer chez toi.',
      'Demander ton chemin à 3 passants différents pour croiser les informations.',
      'Chercher un plan papier dans une boulangerie ou un arrêt de bus à proximité.',
      'Suivre un autre cycliste en espérant qu\'il aille dans la même direction.'
    ],
    correctIndex: 2,
    explanation: "L'adaptabilité, c'est aussi savoir utiliser des outils low-tech quand la technologie te lâche."
  }
]

export default function Niveau36() {
  return <ToolScenarioGame situations={SITUATIONS} summary="Tu as travaillé ton adaptabilité. Garde ces réflexes pour les imprévus du quotidien." onSave={async () => {
    await usersAPI.saveExtraInfo([{
      question_id: 'niveau36_adaptability_completed',
      question_text: 'Soft skill : adaptabilité',
      answer_text: JSON.stringify({
        situationsCompleted: SITUATIONS.length,
        situationsSummary: SITUATIONS.map((situation) => situation.title).join(', '),
        completedAt: new Date().toISOString()
      })
    }])
    await levelUp({ minLevel: 36, xpReward: XP_PER_LEVEL })
    await completeQuest('tool:intelligence-emotionnelle')
  }} />
}
