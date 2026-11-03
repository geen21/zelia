import React, { useCallback, useEffect, useState } from 'react'
import { usersAPI } from '../lib/api'
import { SCHOOL_SHARING_VERSION } from '../lib/schoolSharing'
import './SchoolSharingSettings.css'

export default function SchoolSharingSettings() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const load = useCallback(async () => {
    const response = await usersAPI.getSchoolSharing()
    setData(response.data)
  }, [])
  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      await load()
    } catch (failure) {
      setError(failure.response?.data?.message || 'Impossible de charger les autorisations de partage.')
    } finally {
      setLoading(false)
    }
  }, [load])
  useEffect(() => { reload() }, [reload])
  async function change(action, message) {
    setSaving(true)
    setError('')
    setStatus('')
    try { await action(); await load(); setStatus(message) } catch (failure) {
      setError(failure.response?.data?.message || 'Impossible de modifier le partage.')
    } finally { setSaving(false) }
  }
  const granted = Boolean(data?.consent && !data.consent.revoked_at)
  return (
    <section id="profile-sharing" className="school-sharing" aria-label="Partage avec les écoles" aria-busy={saving || loading}>
      <header className="ss-heading">
        <div>
          <p className="ss-eyebrow">04 / C'est toi qui décides</p>
          <h2>Mes autorisations</h2>
          <p>Tes données, tes choix. Tu gardes la main.</p>
        </div>
        <span className="ss-shield"><i className="ph ph-shield-check" aria-hidden="true" /></span>
      </header>
      <p className="ss-intro">Les écoles que tu sollicites peuvent recevoir tes coordonnées et les informations autorisées. À toi de choisir si elles peuvent aussi accéder à ton dossier d'orientation détaillé.</p>
      {error && <div className="ss-message ss-message--error" role="alert">{error}{!data && <button type="button" disabled={loading} onClick={reload}>Réessayer</button>}</div>}
      {(saving || status) && <p className="ss-message" role="status">{saving ? 'Enregistrement du partage…' : status}</p>}
      {!data ? (!error && <p className="ss-loading" role="status">Chargement des autorisations…</p>) : (
        <>
          <div className="ss-consent">
            <label className="ss-consent-label">
              <span>
                <strong>Mon dossier d'orientation détaillé</strong>
                <span>Autoriser les écoles que j’ai sollicitées à recevoir mon dossier d’orientation détaillé.</span>
              </span>
              <input
                type="checkbox"
                className="ss-toggle"
                aria-label="Autoriser les écoles que j’ai sollicitées à recevoir mon dossier d’orientation détaillé."
                aria-describedby="school-sharing-description"
                checked={granted}
                disabled={saving}
                onChange={(event) => {
                  const checked = event.target.checked
                  change(() => usersAPI.setSchoolSharing({ granted: checked, version: SCHOOL_SHARING_VERSION }), checked ? 'Accord général activé.' : 'Accord général retiré. Les accords propres à chaque école restent inchangés.')
                }}
              />
            </label>
            <p id="school-sharing-description">Ce dossier contient ton profil scolaire, tes réponses au questionnaire et ton bilan d'orientation.</p>
            <span className={`ss-badge${granted ? ' ss-badge--active' : ''}`}>{granted ? 'Accord général actif' : 'Accord général désactivé'}</span>
          </div>
          <div className="ss-schools">
            <h3>École par école</h3>
            <p>Tu peux retirer ou rétablir tout partage avec chaque école, indépendamment de l'accord général.</p>
            <ul>{data.schools.map((school) => (
              <li key={school.id} className="ss-school">
                <span className="ss-school-icon"><i className="ph ph-buildings" aria-hidden="true" /></span>
                <div className="ss-school-info">
                  <strong>{school.name}</strong>
                  <span className={school.blocked ? 'ss-school-blocked' : 'ss-school-allowed'}>{school.blocked ? 'Partage retiré' : 'Partage autorisé selon mes accords'}</span>
                </div>
                <button type="button" className="ss-school-action" disabled={saving} onClick={() => change(() => usersAPI.setSchoolBlock(school.id, !school.blocked), school.blocked ? `Partage rétabli avec ${school.name}, selon tes accords.` : `Tout partage retiré avec ${school.name}.`)}>
                  {school.blocked ? 'Rétablir le partage' : 'Retirer tout partage avec cette école'}
                </button>
              </li>
            ))}</ul>
            {!data.schools.length && <p className="ss-no-schools"><i className="ph ph-buildings" aria-hidden="true" />Aucune école sollicitée et rattachée à un espace partenaire pour le moment.</p>}
          </div>
        </>
      )}
      <details className="ss-details">
        <summary>Comprendre ce qui est partagé</summary>
        <p>Retirer l'accord général ne retire pas une autorisation donnée directement à une école. Tu peux bloquer chaque école ci-dessus. Un export déjà téléchargé ne peut pas être rappelé.</p>
      </details>
    </section>
  )
}
