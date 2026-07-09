import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { schoolPortalAPI } from '../../lib/schoolPortalApi'

const PAGE_SIZE = 50

const STATUS_LABELS = {
  nouveau: 'Nouveau',
  a_contacter: 'À contacter',
  contacte: 'Contacté',
  converti: 'Converti',
  archive: 'Archivé'
}

const SOURCE_LABELS = {
  questionnaire: 'Questionnaire',
  direct_request: 'Demande directe'
}

function formatDate(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleDateString('fr-FR')
  } catch {
    return value
  }
}

export default function SchoolPortalLeads() {
  const { company } = useOutletContext()
  const [leads, setLeads] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [expandedKey, setExpandedKey] = useState(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [savingKey, setSavingKey] = useState(null)

  const [filters, setFilters] = useState({
    source: '', status: '', niveauVise: '', budget: '', departement: '', classeActuelle: '', search: ''
  })

  const loadLeadsPage = useCallback(async (nextOffset = 0, nextFilters = filters) => {
    setLoading(true)
    setError('')
    try {
      const params = { limit: PAGE_SIZE, offset: nextOffset, ...nextFilters }
      Object.keys(params).forEach((key) => { if (!params[key]) delete params[key] })
      const { data } = await schoolPortalAPI.getLeads(params)
      setLeads(Array.isArray(data?.leads) ? data.leads : [])
      setTotal(Number(data?.total) || 0)
      setOffset(nextOffset)
    } catch (loadError) {
      setError(loadError?.response?.data?.error || 'Impossible de charger les leads')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadLeadsPage(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateFilter(key, value) {
    const nextFilters = { ...filters, [key]: value }
    setFilters(nextFilters)
    loadLeadsPage(0, nextFilters)
  }

  function resetFilters() {
    const emptyFilters = { source: '', status: '', niveauVise: '', budget: '', departement: '', classeActuelle: '', search: '' }
    setFilters(emptyFilters)
    loadLeadsPage(0, emptyFilters)
  }

  async function handleExport() {
    if (exporting) return
    setExporting(true)
    try {
      const params = { ...filters }
      Object.keys(params).forEach((key) => { if (!params[key]) delete params[key] })
      const response = await schoolPortalAPI.exportLeadsCsv(params)
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `leads-${company?.name || 'ecole'}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError("Échec de l'export CSV")
    } finally {
      setExporting(false)
    }
  }

  async function handleReveal(lead) {
    try {
      if (lead.source === 'direct_request') {
        const id = lead.leadKey.replace('request:', '')
        await schoolPortalAPI.revealDirectRequest(id)
      } else {
        await schoolPortalAPI.revealLead(lead.user_id)
      }
      loadLeadsPage(offset)
    } catch {
      setError('Échec de la révélation')
    }
  }

  function toggleExpand(lead) {
    if (expandedKey === lead.leadKey) {
      setExpandedKey(null)
      return
    }
    setExpandedKey(lead.leadKey)
    setNoteDraft(lead.note || '')
  }

  async function handleStatusChange(lead, status) {
    setSavingKey(lead.leadKey)
    try {
      await schoolPortalAPI.updateLeadStatus(lead.leadKey, { status })
      setLeads((prev) => prev.map((item) => (item.leadKey === lead.leadKey ? { ...item, status } : item)))
    } catch {
      setError('Échec de la mise à jour du statut')
    } finally {
      setSavingKey(null)
    }
  }

  async function handleSaveNote(lead) {
    setSavingKey(lead.leadKey)
    try {
      await schoolPortalAPI.updateLeadStatus(lead.leadKey, { note: noteDraft })
      setLeads((prev) => prev.map((item) => (item.leadKey === lead.leadKey ? { ...item, note: noteDraft } : item)))
      setExpandedKey(null)
    } catch {
      setError("Échec de l'enregistrement de la note")
    } finally {
      setSavingKey(null)
    }
  }

  const hasPrevious = offset > 0
  const hasNext = offset + PAGE_SIZE < total

  const niveauOptions = useMemo(() => Array.from(new Set(leads.map((l) => l.niveau_vise).filter(Boolean))), [leads])
  const budgetOptions = useMemo(() => Array.from(new Set(leads.map((l) => l.budget).filter(Boolean))), [leads])
  const classeOptions = useMemo(() => Array.from(new Set(leads.map((l) => l.classe_actuelle).filter(Boolean))), [leads])

  return (
    <>
      <div className="sp-page-head">
        <p className="sp-kicker">Espace écoles</p>
        <h1 className="sp-title">{company?.name ? `Leads pour ${company.name}` : 'Vos leads'}</h1>
        <p className="sp-subtitle">Élèves ayant sélectionné votre établissement ou demandé plus d'informations.</p>
      </div>

      {error && (
        <div className="sp-card" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c', marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="sp-kpi-grid">
        <div className="sp-card sp-kpi-card">
          <p className="sp-kpi-value">{total}</p>
          <p className="sp-kpi-label">Lead{total > 1 ? 's' : ''} au total</p>
        </div>
      </div>

      <div className="sp-filters">
        <input
          type="search"
          className="sp-search"
          placeholder="Rechercher un nom, un email..."
          value={filters.search}
          onChange={(event) => updateFilter('search', event.target.value)}
        />
        <select value={filters.source} onChange={(event) => updateFilter('source', event.target.value)}>
          <option value="">Toutes les sources</option>
          <option value="questionnaire">Questionnaire</option>
          <option value="direct_request">Demande directe</option>
        </select>
        <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        {niveauOptions.length > 0 && (
          <select value={filters.niveauVise} onChange={(event) => updateFilter('niveauVise', event.target.value)}>
            <option value="">Niveau visé</option>
            {niveauOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        )}
        {budgetOptions.length > 0 && (
          <select value={filters.budget} onChange={(event) => updateFilter('budget', event.target.value)}>
            <option value="">Budget</option>
            {budgetOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        )}
        {classeOptions.length > 0 && (
          <select value={filters.classeActuelle} onChange={(event) => updateFilter('classeActuelle', event.target.value)}>
            <option value="">Classe actuelle</option>
            {classeOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        )}
        <button type="button" className="sp-btn sp-btn-sm" onClick={resetFilters}>Réinitialiser</button>
      </div>

      <div className="sp-section-head">
        <p className="sp-section-title">Liste des leads</p>
        <button type="button" onClick={handleExport} disabled={exporting || total === 0} className="sp-btn sp-btn-sm">
          {exporting ? 'Export...' : 'Exporter en CSV'}
        </button>
      </div>

      <div className="sp-card no-accent" style={{ padding: 0 }}>
        {loading ? (
          <p className="sp-empty">Chargement...</p>
        ) : leads.length === 0 ? (
          <p className="sp-empty">
            Aucun lead pour ces filtres. Vérifiez que le nom de votre établissement correspond exactement à celui choisi par les élèves.
          </p>
        ) : (
          <div className="sp-table-wrap">
            <table className="sp-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Prénom</th>
                  <th>Nom</th>
                  <th>Email</th>
                  <th>Niveau visé</th>
                  <th>Budget</th>
                  <th>Formation / Demandes</th>
                  <th>Statut</th>
                  <th>Inscrit le</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <React.Fragment key={lead.leadKey}>
                    <tr className={expandedKey === lead.leadKey ? 'is-expanded' : ''}>
                      <td><span className={`sp-badge sp-badge-source-${lead.source}`}>{SOURCE_LABELS[lead.source] || lead.source}</span></td>
                      <td>{lead.prenom}</td>
                      <td>{lead.nom}</td>
                      <td>
                        {lead.email}{' '}
                        {!lead.revealed && (
                          <button type="button" className="sp-btn sp-btn-sm" style={{ height: 24, padding: '0 8px', fontSize: 11 }} onClick={() => handleReveal(lead)}>
                            Révéler
                          </button>
                        )}
                      </td>
                      <td>{lead.niveau_vise}</td>
                      <td>{lead.budget}</td>
                      <td>
                        {lead.source === 'direct_request' ? lead.formation_title : lead.formations_choisies_ecole}
                        {Number(lead.nb_demandes_infos_ecole) > 0 && (
                          <div className="sp-row-meta">{lead.nb_demandes_infos_ecole} demande(s) d'infos</div>
                        )}
                      </td>
                      <td>
                        <select
                          className="sp-status-select"
                          value={lead.status}
                          disabled={savingKey === lead.leadKey}
                          onChange={(event) => handleStatusChange(lead, event.target.value)}
                        >
                          {Object.entries(STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </td>
                      <td>{formatDate(lead.inscrit_le)}</td>
                      <td>
                        <button type="button" className="sp-btn sp-btn-sm" onClick={() => toggleExpand(lead)}>
                          {expandedKey === lead.leadKey ? 'Fermer' : 'Note'}
                        </button>
                      </td>
                    </tr>
                    {expandedKey === lead.leadKey && (
                      <tr className="sp-note-row">
                        <td colSpan={10}>
                          <textarea
                            className="sp-note-textarea"
                            placeholder="Ajouter une note interne sur ce lead..."
                            value={noteDraft}
                            onChange={(event) => setNoteDraft(event.target.value)}
                          />
                          <div style={{ marginTop: 8 }}>
                            <button type="button" className="sp-btn sp-btn-primary sp-btn-sm" disabled={savingKey === lead.leadKey} onClick={() => handleSaveNote(lead)}>
                              Enregistrer la note
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(hasPrevious || hasNext) && (
        <div className="sp-pagination">
          <button type="button" className="sp-btn sp-btn-sm" onClick={() => loadLeadsPage(Math.max(offset - PAGE_SIZE, 0))} disabled={!hasPrevious || loading}>
            Précédent
          </button>
          <button type="button" className="sp-btn sp-btn-sm" onClick={() => loadLeadsPage(offset + PAGE_SIZE)} disabled={!hasNext || loading}>
            Suivant
          </button>
        </div>
      )}
    </>
  )
}
