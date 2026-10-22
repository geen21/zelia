import React, { useEffect, useRef, useState } from 'react'
import { PiLockKey } from 'react-icons/pi'
import { ORIGIN_LABELS, STATUS_LABELS } from './SchoolPortalFilters'

const VALUE_LABELS = { near_home: 'Près de chez moi', move_city: 'Changer de ville', both: 'Les deux', maths: 'Maths', francais: 'Français', anglais: 'Anglais', sciences: 'Sciences', eco: 'Éco', arts: 'Arts', numerique: 'Numérique', '1ere': '1ère', post_bac: 'Post-bac' }
const profileLabels = { first_name: 'Prénom', last_name: 'Nom', age: 'Âge', gender: 'Genre', department: 'Département', school: 'Établissement actuel', phone_number: 'Téléphone' }
const leadLabels = { classe_actuelle: 'Classe actuelle', niveau_vise: 'Niveau visé', departement: 'Département', budget: 'Budget', moyenne: 'Moyenne', preference_geo: 'Préférence géographique', matieres_fortes: 'Matières fortes' }

function readable(value) {
  if (value == null || value === '') return 'Non renseigné'
  if (Array.isArray(value)) return value.length ? value.map(readable).join(', ') : 'Non renseigné'
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key.replace(/_/g, ' ')} : ${readable(item)}`).join('\n')
  if (typeof value === 'string' && /^[\[{]/.test(value.trim())) {
    try { return readable(JSON.parse(value)) } catch (failure) { if (!(failure instanceof SyntaxError)) throw failure }
  }
  return VALUE_LABELS[value] || String(value)
}

function Facts({ values, labels }) {
  return <dl className="sp-facts">{Object.entries(labels).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{readable(values[key])}</dd></div>)}</dl>
}

export default function SchoolLeadDetail({ leadKey, initialLead, api, readOnly = false, onUpdated }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(initialLead?.note || '')
  const dirty = useRef(false)
  useEffect(() => {
    let active = true
    api.getLead(leadKey).then((response) => {
      if (active) {
        setData(response.data)
        if (!dirty.current) setNote(response.data.lead.note || '')
      }
    }, (failure) => { if (active) { setData(null); setError(failure.response?.data?.message || 'Impossible de charger le dossier.') } })
    return () => { active = false }
  }, [api, leadKey, revision])

  async function perform(action, success) {
    setBusy(true); setError(''); setMessage('')
    try {
      await action()
      setRevision((value) => value + 1)
      onUpdated()
      setMessage(success)
    } catch (failure) { setError(failure.response?.data?.message || 'Impossible de mettre à jour le dossier.') }
    finally { setBusy(false) }
  }

  return <section aria-label="Dossier élève">
    {error && <div className="sp-alert" role="alert">{error}{!data && <div className="sp-form-footer"><button className="sp-btn" onClick={() => { setError(''); setRevision((value) => value + 1) }}>Réessayer</button></div>}</div>}
    {message && <p className="sp-alert sp-alert-success" role="status">{message}</p>}
    {!data ? !error && <p role="status">Chargement du dossier…</p> : <>
      <div className="sp-detail-section">
        <div className="sp-section-head"><div><p className="sp-section-title">{data.lead.prenom} {data.lead.nom}</p><span className="sp-cell-secondary">Origine : {ORIGIN_LABELS[data.lead.origin]}</span></div><span className={`sp-badge sp-badge-${data.lead.origin}`}>{ORIGIN_LABELS[data.lead.origin]}</span></div>
        <label className="sp-field">Statut du dossier<select aria-label={`Statut du dossier de ${data.lead.prenom}`} value={data.lead.status} disabled={readOnly || busy} onChange={(event) => perform(() => api.updateLeadStatus(leadKey, { status: event.target.value }), 'Statut enregistré.')}>
          {Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
      </div>
      <div className="sp-detail-section"><h3>Coordonnées</h3><p>{data.lead.email}</p>
        {!readOnly && !data.lead.revealed && <div className="sp-form-footer"><button className="sp-btn" disabled={busy} onClick={() => perform(() => api.reveal(leadKey), 'Contact révélé.')}><PiLockKey aria-hidden="true" />Révéler le contact</button></div>}
      </div>
      <div className="sp-detail-section"><h3>Profil scolaire et projet</h3><Facts values={data.lead} labels={leadLabels} /></div>
      <div className="sp-detail-section"><h3>Formations demandées</h3>
        <ul className="sp-timeline">{data.lead.actions.map((action, index) => <li key={`${action.source}:${action.reference}:${index}`}>
          <strong>{action.title}</strong><span className="sp-cell-secondary">{action.campus || 'Campus non renseigné'} · {action.source === 'formation_france' ? 'Naturel' : 'Sponsorisé'}</span><span className="sp-cell-secondary">{new Date(action.date).toLocaleDateString('fr-FR')}</span>
        </li>)}</ul>
      </div>
      <div className="sp-detail-section">
        {!data.detail ? <p className="sp-notice"><PiLockKey aria-hidden="true" /><span>{data.detailLocked ? 'Révélez ce contact pour consulter son dossier autorisé.' : 'Dossier détaillé non autorisé. Seuls les contacts et champs historiques autorisés sont accessibles.'}</span></p> : <>
          <h3>Profil et coordonnées autorisés</h3><Facts values={data.detail.profile || {}} labels={Object.fromEntries(Object.keys(data.detail.profile || {}).map((key) => [key, profileLabels[key] || key.replace(/_/g, ' ')]))} />
          <div className="sp-detail-section"><h3>Informations d’orientation</h3>
            {data.detail.extraInfo.length ? <dl className="sp-answer-list">{data.detail.extraInfo.map((entry) => <div key={entry.question_id}><dt>{entry.question_text || entry.question_id}</dt><dd>{readable(entry.answer_text)}</dd></div>)}</dl> : <p className="sp-muted sp-small">Aucune information complémentaire enregistrée.</p>}
          </div>
          <div className="sp-detail-section"><h3>Questions et réponses</h3>
            {data.detail.answers.length ? <dl className="sp-answer-list">{data.detail.answers.map((answer, index) => <div key={`${answer.question_id}:${index}`}><dt>{answer.questions?.content || `Question ${answer.question_id}`}</dt><dd>{readable(answer.response)}</dd></div>)}</dl> : <p className="sp-muted sp-small">Aucune réponse enregistrée.</p>}
          </div>
          <div className="sp-detail-section"><h3>Bilan d’orientation enregistré</h3>
            {data.detail.analysis ? <div className="sp-prose">
              <p>{readable(data.detail.analysis.personality_analysis)}</p><p>{readable(data.detail.analysis.skills_assessment)}</p><h4>Métiers proposés</h4>
              {Array.isArray(data.detail.analysis.job_recommendations) ? <ul>{data.detail.analysis.job_recommendations.map((job, index) => <li key={index}>{typeof job === 'string' ? job : job.title || readable(job)}</li>)}</ul> : <p>{readable(data.detail.analysis.job_recommendations)}</p>}
              <h4>Formations proposées</h4>
              {Array.isArray(data.detail.analysis.study_recommendations) ? <ul>{data.detail.analysis.study_recommendations.map((study, index) => <li key={index}>{typeof study === 'string' ? study : study.degree || readable(study)}</li>)}</ul> : <p>{readable(data.detail.analysis.study_recommendations)}</p>}
            </div> : <p className="sp-muted sp-small">Aucun bilan enregistré.</p>}
          </div>
        </>}
      </div>
      <div className="sp-detail-section"><h3>Suivi de votre équipe</h3>
        <form onSubmit={(event) => { event.preventDefault(); perform(async () => { await api.updateLeadStatus(leadKey, { note }); dirty.current = false }, 'Note enregistrée.') }}>
          <label className="sp-field">Note interne<textarea aria-label="Note interne" value={note} maxLength={2000} disabled={readOnly || busy} onChange={(event) => { dirty.current = true; setNote(event.target.value); setMessage('') }} /></label>
          <div className="sp-note-count"><span>Visible uniquement par votre équipe</span><span>{note.length}/2000</span></div>
          {!readOnly && <div className="sp-form-footer"><button className="sp-btn sp-btn-primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer la note'}</button></div>}
        </form>
      </div>
    </>}
  </section>
}
