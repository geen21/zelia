import React, { useEffect, useState } from 'react'
import { ORIGIN_LABELS } from './SchoolPortalFilters'

const readable = (value) => value == null || value === '' ? 'Non renseigné' : typeof value === 'object' ? JSON.stringify(value) : String(value)
const profileLabels = { first_name: 'Prénom', last_name: 'Nom', age: 'Âge', gender: 'Genre', department: 'Département', school: 'Établissement actuel', phone_number: 'Téléphone' }

export default function SchoolLeadDetail({ leadKey, api }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    api.getLead(leadKey).then((response) => { if (active) setData(response.data) },
      (failure) => { if (active) setError(failure.response?.data?.message || 'Impossible de charger le dossier.') })
    return () => { active = false }
  }, [api, leadKey])
  if (error) return <p role="alert">{error}</p>
  if (!data) return <p>Chargement du dossier…</p>
  return <section aria-label="Dossier élève">
    <h2 className="sp-section-title">Dossier de {data.lead.prenom}</h2>
    <p>Origine : {ORIGIN_LABELS[data.lead.origin]}</p>
    <dl>{Object.entries({ classe_actuelle: 'Classe actuelle', niveau_vise: 'Niveau visé', departement: 'Département', budget: 'Budget', moyenne: 'Moyenne', preference_geo: 'Préférence géographique', matieres_fortes: 'Matières fortes' }).map(([key, label]) => <React.Fragment key={key}><dt>{label}</dt><dd>{readable(data.lead[key])}</dd></React.Fragment>)}</dl>
    <ul>{data.lead.actions.map((action, index) => <li key={`${action.source}:${action.reference}:${index}`}>
      {action.title} — {action.campus || 'Campus non renseigné'} — {action.source === 'formation_france' ? 'Naturel' : 'Sponsorisé'} — {new Date(action.date).toLocaleDateString('fr-FR')}
    </li>)}</ul>
    {!data.detail ? <p>{data.detailLocked ? 'Révélez ce contact pour consulter son dossier autorisé.' : 'Dossier détaillé non autorisé. Seuls les contacts et champs historiques autorisés sont accessibles.'}</p> : <>
      <h3>Profil scolaire et coordonnées</h3>
      <dl>{Object.entries(data.detail.profile || {}).map(([key, value]) => <React.Fragment key={key}><dt>{profileLabels[key] || key}</dt><dd>{readable(value)}</dd></React.Fragment>)}</dl>
      <h3>Informations d’orientation</h3>
      {data.detail.extraInfo.length ? <dl>{data.detail.extraInfo.map((entry) => <React.Fragment key={entry.question_id}><dt>{entry.question_text || entry.question_id}</dt><dd>{readable(entry.answer_text)}</dd></React.Fragment>)}</dl> : <p>Aucune information complémentaire enregistrée.</p>}
      <h3>Questions et réponses</h3>
      {data.detail.answers.length ? <dl>{data.detail.answers.map((answer, index) => <React.Fragment key={`${answer.question_id}:${index}`}><dt>{answer.questions?.content || `Question ${answer.question_id}`}</dt><dd>{readable(answer.response)}</dd></React.Fragment>)}</dl> : <p>Aucune réponse enregistrée.</p>}
      <h3>Bilan d’orientation enregistré</h3>
      {data.detail.analysis ? <>
        <p>{readable(data.detail.analysis.personality_analysis)}</p><p>{readable(data.detail.analysis.skills_assessment)}</p>
        <h4>Métiers proposés</h4>
        {Array.isArray(data.detail.analysis.job_recommendations) ? <ul>{data.detail.analysis.job_recommendations.map((job, index) => <li key={index}>{typeof job === 'string' ? job : job.title || readable(job)}</li>)}</ul> : <p>{readable(data.detail.analysis.job_recommendations)}</p>}
        <h4>Formations proposées</h4>
        {Array.isArray(data.detail.analysis.study_recommendations) ? <ul>{data.detail.analysis.study_recommendations.map((study, index) => <li key={index}>{typeof study === 'string' ? study : study.degree || readable(study)}</li>)}</ul> : <p>{readable(data.detail.analysis.study_recommendations)}</p>}
      </> : <p>Aucun bilan enregistré.</p>}
    </>}
  </section>
}
