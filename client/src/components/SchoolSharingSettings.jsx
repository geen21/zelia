import React, { useEffect, useState } from 'react'
import { usersAPI } from '../lib/api'
import { SCHOOL_SHARING_VERSION } from '../lib/schoolSharing'

export default function SchoolSharingSettings() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const load = async () => {
    const response = await usersAPI.getSchoolSharing()
    setData(response.data)
  }
  useEffect(() => { load().catch((failure) => setError(failure.response?.data?.message || 'Impossible de charger les autorisations de partage.')) }, [])
  async function change(action) {
    setSaving(true)
    setError('')
    try { await action(); await load() } catch (failure) {
      setError(failure.response?.data?.message || 'Impossible de modifier le partage.')
    } finally { setSaving(false) }
  }
  const granted = Boolean(data?.consent && !data.consent.revoked_at)
  return <section className="bg-white border border-gray-200 rounded-lg p-6" aria-label="Partage avec les écoles">
    <h2 className="text-xl font-bold">Partage avec les écoles</h2>
    <p>Les écoles que tu sollicites peuvent recevoir tes coordonnées et les informations autorisées. Le dossier détaillé contient ton profil scolaire, tes réponses au questionnaire et ton bilan d’orientation.</p>
    <p>Retirer l’accord général ne retire pas une autorisation donnée directement à une école. Tu peux bloquer chaque école ci-dessous. Un export déjà téléchargé ne peut pas être rappelé.</p>
    {error && <p role="alert">{error}</p>}
    {saving && <p role="status">Enregistrement du partage…</p>}
    {!data ? <p>Chargement des autorisations…</p> : <>
      <label><input type="checkbox" checked={granted} disabled={saving} onChange={(event) => change(() => usersAPI.setSchoolSharing({ granted: event.target.checked, version: SCHOOL_SHARING_VERSION }))} /> Autoriser les écoles que j’ai sollicitées à recevoir mon dossier d’orientation détaillé.</label>
      <ul>{data.schools.map((school) => <li key={school.id} className="mt-3">
        {school.name} — {school.blocked ? 'Partage retiré' : 'Partage autorisé selon mes accords'}{' '}
        <button className="border rounded px-3 py-1" disabled={saving} onClick={() => change(() => usersAPI.setSchoolBlock(school.id, !school.blocked))}>{school.blocked ? 'Rétablir le partage' : 'Retirer tout partage avec cette école'}</button>
      </li>)}</ul>
      {!data.schools.length && <p>Aucune école sollicitée et rattachée à un espace partenaire pour le moment.</p>}
    </>}
  </section>
}
