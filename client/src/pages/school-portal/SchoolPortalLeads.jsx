import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { schoolPortalAPI } from '../../lib/schoolPortalApi'
import SchoolPortalFilters, { CHANNEL_LABELS, ORIGIN_LABELS, STATUS_LABELS } from './SchoolPortalFilters'
import SchoolLeadDetail from './SchoolLeadDetail'

const PAGE_SIZE = 50

export default function SchoolPortalLeads() {
  const { company, api = schoolPortalAPI, readOnly = false } = useOutletContext()
  const [data, setData] = useState({ leads: [], total: 0, campuses: [] })
  const [filters, setFilters] = useState({})
  const [offset, setOffset] = useState(0)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [expandedKey, setExpandedKey] = useState(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setData((previous) => ({ ...previous, leads: [] }))
    api.getLeads({ ...filters, limit: PAGE_SIZE, offset }).then((response) => {
      if (active) { setData(response.data); setError('') }
    }, (failure) => { if (active) setError(failure.response?.data?.message || 'Impossible de charger les leads.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, filters, offset, revision])

  async function mutate(action) {
    setSaving(true)
    setError('')
    try { await action(); setRevision((value) => value + 1) } catch (failure) {
      setError(failure.response?.data?.message || 'Impossible de terminer cette opération.')
    } finally { setSaving(false) }
  }

  async function exportCsv() {
    await mutate(async () => {
      const response = await api.exportLeadsCsv(filters)
      const url = URL.createObjectURL(new Blob([response.data], { type: 'text/csv;charset=utf-8;' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `leads-${company.id}.csv`
      link.click()
      URL.revokeObjectURL(url)
    })
  }
  return <>
    <div className="sp-page-head"><p className="sp-kicker">Espace écoles</p><h1 className="sp-title">Leads pour {company.name}</h1>
      <p className="sp-subtitle">Un dossier par élève. Les parcours mixtes ne sont pas comptés deux fois. Les coordonnées non révélées restent masquées.</p>
    </div>
    {error && <p className="sp-card" role="alert">{error}</p>}
    <SchoolPortalFilters value={filters} campuses={data.campuses} leads onChange={(value) => { setFilters(value); setOffset(0); setExpandedKey(null) }} />
    <div className="sp-section-head"><p className="sp-section-title">{data.total} lead(s)</p><button className="sp-btn sp-btn-sm" disabled={saving || loading || !data.total} onClick={exportCsv}>Exporter en CSV</button></div>
    <div className="sp-card no-accent">
      {loading ? <p>Chargement…</p> : !data.leads.length ? <p>Aucun lead pour ces filtres. Vérifiez les rattachements du catalogue et les autorisations de partage.</p> :
        <div className="sp-table-wrap"><table className="sp-table"><thead><tr><th>Origine / canal</th><th>Élève</th><th>Email</th><th>Niveau / budget</th><th>Formations</th><th>Statut</th><th>Première demande</th><th>Dossier</th></tr></thead>
          <tbody>{data.leads.map((lead) => <React.Fragment key={lead.leadKey}>
            <tr><td><span className="sp-badge">{ORIGIN_LABELS[lead.origin]}</span><small>{CHANNEL_LABELS[lead.source]}</small></td>
              <td>{lead.prenom} {lead.nom}</td><td>{lead.email}{!readOnly && !lead.revealed && <button disabled={saving} className="sp-btn sp-btn-sm" onClick={() => mutate(() => api.reveal(lead.leadKey))}>Révéler</button>}</td>
              <td>{lead.niveau_vise || '—'} / {lead.budget || '—'}</td><td>{lead.formations_choisies_ecole}</td>
              <td><select aria-label={`Statut de ${lead.prenom}`} disabled={readOnly || saving} value={lead.status} onChange={(event) => mutate(() => api.updateLeadStatus(lead.leadKey, { status: event.target.value }))}>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></td>
              <td>{new Date(lead.inscrit_le).toLocaleDateString('fr-FR')}</td>
              <td><button className="sp-btn sp-btn-sm" onClick={() => { setExpandedKey(expandedKey === lead.leadKey ? null : lead.leadKey); setNote(lead.note || '') }}>{expandedKey === lead.leadKey ? 'Fermer' : 'Ouvrir le dossier'}</button></td>
            </tr>
            {expandedKey === lead.leadKey && <tr><td colSpan={8}>
              <SchoolLeadDetail key={`${lead.leadKey}:${revision}`} leadKey={lead.leadKey} api={api} />
              <label>Note interne<textarea className="sp-note-textarea" value={note} maxLength={2000} disabled={readOnly || saving} onChange={(event) => setNote(event.target.value)} /></label>
              {!readOnly && <button className="sp-btn sp-btn-sm" disabled={saving} onClick={() => mutate(() => api.updateLeadStatus(lead.leadKey, { note }))}>Enregistrer la note</button>}
            </td></tr>}
          </React.Fragment>)}</tbody></table></div>}
    </div>
    <div className="sp-pagination"><button className="sp-btn sp-btn-sm" disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Précédent</button><span>{offset + 1}–{Math.min(offset + PAGE_SIZE, data.total)} / {data.total}</span><button className="sp-btn sp-btn-sm" disabled={loading || offset + PAGE_SIZE >= data.total} onClick={() => setOffset(offset + PAGE_SIZE)}>Suivant</button></div>
  </>
}
