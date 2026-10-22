import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { PiArrowDown, PiArrowRight, PiCaretLeft, PiCaretRight, PiLockKey, PiUsersThree } from 'react-icons/pi'
import { schoolPortalAPI } from '../../lib/schoolPortalApi'
import SchoolPortalFilters, { CHANNEL_LABELS, ORIGIN_LABELS, STATUS_LABELS } from './SchoolPortalFilters'
import SchoolLeadDetail from './SchoolLeadDetail'
import SchoolPortalDialog from './SchoolPortalDialog'

const PAGE_SIZE = 50

export default function SchoolPortalLeads() {
  const { company, api = schoolPortalAPI, readOnly = false } = useOutletContext()
  const [data, setData] = useState(null)
  const [filters, setFilters] = useState({})
  const [offset, setOffset] = useState(0)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    api.getLeads({ ...filters, limit: PAGE_SIZE, offset }).then((response) => {
      if (active) { setData(response.data); setError('') }
    }, (failure) => {
      if (active) { setData(null); setError(failure.response?.data?.message || 'Impossible de charger les leads.') }
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, filters, offset, revision])

  async function mutate(action, success) {
    setSaving(true); setError(''); setMessage('')
    try { await action(); setRevision((value) => value + 1); setMessage(success) } catch (failure) {
      setError(failure.response?.data?.message || 'Impossible de terminer cette opération.')
    } finally { setSaving(false) }
  }

  async function exportCsv() {
    setSaving(true); setError('')
    try {
      const response = await api.exportLeadsCsv(filters)
      const url = URL.createObjectURL(new Blob([response.data], { type: 'text/csv;charset=utf-8;' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `leads-${company.id}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (failure) { setError(failure.response?.data?.message || 'Impossible d’exporter les leads.') }
    finally { setSaving(false) }
  }

  const total = data?.total || 0
  return <>
    <div className="sp-page-head">
      <div><p className="sp-kicker">Relations étudiants</p><h1 className="sp-title">Leads</h1><p className="sp-subtitle">Vos futurs étudiants, leurs projets et les prochaines étapes.</p></div>
      <button type="button" className="sp-btn" disabled={saving || loading || !total} onClick={exportCsv}><PiArrowDown aria-hidden="true" />Exporter en CSV</button>
    </div>
    {error && <div className="sp-alert" role="alert">{error}<div className="sp-form-footer"><button className="sp-btn" onClick={() => setRevision((value) => value + 1)}>Réessayer</button></div></div>}
    {message && <p className="sp-alert sp-alert-success" role="status">{message}</p>}
    <SchoolPortalFilters value={filters} campuses={data?.campuses} leads onChange={(value) => { setFilters(value); setOffset(0); setSelected(null); setMessage('') }} />
    <section className="sp-card sp-card-flush" aria-label="Liste des leads" aria-busy={loading}>
      <div className="sp-results-head"><strong>{total} lead{total > 1 ? 's' : ''}</strong><span>Un dossier unique par élève</span></div>
      {!data && loading ? <p className="sp-empty" role="status">Chargement des leads…</p> : data && !data.leads.length ? <div className="sp-empty">
        <PiUsersThree aria-hidden="true" /><strong>Aucun lead pour ces filtres</strong><p>Essayez une autre recherche. Vérifiez également les rattachements du catalogue et les autorisations de partage.</p>
      </div> : data && <div className="sp-table-wrap"><table className="sp-table sp-leads-table">
        <thead><tr><th scope="col">Élève / contact</th><th scope="col">Formation / projet</th><th scope="col">Origine</th><th scope="col">Statut</th><th scope="col">Première demande</th><th scope="col"><span className="sp-muted">Dossier</span></th></tr></thead>
        <tbody>{data.leads.map((lead) => <tr key={lead.leadKey}>
          <td><div className="sp-person"><span className="sp-avatar" aria-hidden="true">{lead.prenom?.slice(0, 1)}{lead.nom?.slice(0, 1)}</span><div>
            <strong>{lead.prenom} {lead.nom}</strong><span className="sp-cell-secondary">{lead.email}</span>
            {!lead.revealed && !readOnly && <div className="sp-cell-actions"><button className="sp-btn sp-btn-sm" disabled={saving || loading} onClick={() => mutate(() => api.reveal(lead.leadKey), 'Contact révélé.')}><PiLockKey aria-hidden="true" />Révéler</button></div>}
          </div></div></td>
          <td data-label="Formation / projet"><span>{lead.formations_choisies_ecole || 'Formation non renseignée'}</span><span className="sp-cell-secondary">{lead.niveau_vise || 'Niveau non renseigné'} · {lead.budget || 'Budget non renseigné'}</span></td>
          <td data-label="Origine"><span className={`sp-badge sp-badge-${lead.origin}`}>{ORIGIN_LABELS[lead.origin] || ORIGIN_LABELS.unknown}</span><span className="sp-cell-secondary">{CHANNEL_LABELS[lead.source] || lead.source}</span></td>
          <td data-label="Suivi"><select className="sp-status-select" aria-label={`Statut de ${lead.prenom}`} disabled={readOnly || saving || loading} value={lead.status}
            onChange={(event) => mutate(() => api.updateLeadStatus(lead.leadKey, { status: event.target.value }), 'Statut enregistré.')}>
            {Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></td>
          <td data-label="Première demande">{new Date(lead.inscrit_le).toLocaleDateString('fr-FR')}</td>
          <td><button className="sp-btn sp-btn-sm" disabled={loading} onClick={() => setSelected(lead)}>Ouvrir le dossier<PiArrowRight aria-hidden="true" /></button></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    <div className="sp-pagination"><span>{total ? offset + 1 : 0}–{Math.min(offset + PAGE_SIZE, total)} / {total}</span><div className="sp-actions">
      <button className="sp-btn sp-btn-sm" disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}><PiCaretLeft aria-hidden="true" />Précédent</button>
      <button className="sp-btn sp-btn-sm" disabled={loading || offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>Suivant<PiCaretRight aria-hidden="true" /></button>
    </div></div>
    <p className="sp-notice" style={{ marginTop: 24 }}><PiLockKey aria-hidden="true" />Les coordonnées non révélées restent masquées. Le dossier détaillé dépend de l’autorisation de partage de l’élève.</p>
    {selected && <SchoolPortalDialog title={`Dossier de ${selected.prenom}`} onClose={() => setSelected(null)}>
      <SchoolLeadDetail key={selected.leadKey} leadKey={selected.leadKey} initialLead={selected} api={api} readOnly={readOnly} onUpdated={() => setRevision((value) => value + 1)} />
    </SchoolPortalDialog>}
  </>
}
