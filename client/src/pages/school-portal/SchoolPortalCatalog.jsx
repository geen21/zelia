import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { PiArrowClockwise, PiArrowUpRight } from 'react-icons/pi'
import { schoolPortalAPI } from '../../lib/schoolPortalApi'
import { adminApi } from '../../lib/adminApi'
import { formationHref } from '../../lib/adminSelections'

export default function SchoolPortalCatalog({ api: suppliedApi, companyId, managing = false }) {
  const context = useOutletContext() || {}
  const api = suppliedApi || context.api || schoolPortalAPI
  const [data, setData] = useState(null)
  const [source, setSource] = useState('')
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    setBusy(true)
    api.getCatalog({ source, q: query, offset, limit: 50 }).then((response) => { if (active) { setData(response.data); setError('') } },
      (failure) => { if (active) { setData(null); setError(failure.response?.data?.message || 'Vérification du catalogue impossible.') } })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [api, source, query, offset, revision])
  async function attach(item) {
    setBusy(true)
    try {
      const payload = { source: item.source, reference: item.reference }
      if (item.linked) await adminApi.delete(`/portal/schools/${companyId}/catalog`, { data: payload })
      else await adminApi.post(`/portal/schools/${companyId}/catalog`, payload)
      setRevision((value) => value + 1)
    } catch (failure) { setError(failure.response?.data?.message || 'Rattachement impossible.'); setBusy(false) }
  }
  return <section className={`sp-section${managing ? ' sp-shell sp-preview' : ''}`} aria-label="Comparaison des catalogues">
    <div className="sp-catalog-head"><div><h2 className="sp-section-title">Référencées sur Zelia</h2><p className="sp-subtitle">Vos formations dans les catalogues naturel et sponsorisé.</p></div>
      <button className="sp-btn sp-btn-sm" disabled={busy} onClick={() => setRevision((value) => value + 1)}><PiArrowClockwise aria-hidden="true" />Vérifier ma présence dans le catalogue national</button>
    </div>
    {error && <p className="sp-alert" role="alert">{error}</p>}
    <div className="sp-catalog-toolbar">
      <label className="sp-field">Catalogue<select aria-label="Catalogue" value={source} onChange={(event) => { setSource(event.target.value); setOffset(0) }}><option value="">Les deux catalogues</option><option value="formation_france">Résultats naturels</option><option value="ecoles_partenaires">Résultats sponsorisés</option></select></label>
      {managing && <label className="sp-field">Établissement<input aria-label="Rechercher un établissement à rattacher" placeholder="Nom ou variante de l’établissement" value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0) }} /></label>}
      {data && <p className="sp-muted sp-small">{data.natural} naturelle(s) · {data.sponsored} sponsorisée(s)</p>}
    </div>
    <div className="sp-card sp-card-flush" aria-busy={busy}>
      {busy && !data && <p className="sp-empty" role="status">Vérification du catalogue…</p>}
      {data && (!data.items.length ? <div className="sp-empty"><strong>Aucune correspondance</strong><p>Contactez Zelia pour vérifier le nom et les campus.</p></div> :
        <ul className="sp-row-list">{data.items.map((item) => <li className="sp-row-item" key={`${item.source}:${item.reference}`}>
          <div><span className={`sp-badge sp-badge-${item.source === 'formation_france' ? 'natural' : 'sponsored'}`}>{item.source === 'formation_france' ? 'Naturel' : 'Sponsorisé'}</span>
            <p className="sp-row-title" style={{ marginTop: 8 }}>{item.title}</p><p className="sp-row-meta">{item.school} · {item.campus || 'Campus non renseigné'}</p>
            <p className="sp-row-meta">{item.linked ? item.source === 'ecoles_partenaires' ? 'Rattachée à l’espace partenaire' : 'Rattachement validé' : 'Correspondance à vérifier'}{!item.active ? ' · Archivée' : !item.recommended ? ' · Hors recommandations' : ''}</p>
          </div>
          <div className="sp-actions">{formationHref({ link: item.url }) ? <a className="sp-btn sp-btn-sm" href={formationHref({ link: item.url })} target="_blank" rel="noopener noreferrer">Voir la fiche<PiArrowUpRight aria-hidden="true" /></a> : <small className="sp-muted">Lien indisponible</small>}
            {managing && (item.source === 'ecoles_partenaires' && item.linked ? <span className="sp-badge">Rattachement automatique</span> : <button className="sp-btn sp-btn-sm" disabled={busy || Boolean(item.linkedCompanyId && !item.linked)} onClick={() => attach(item)}>{item.linked ? 'Retirer le rattachement' : item.linkedCompanyId ? 'Autre école' : 'Valider le rattachement'}</button>)}
          </div>
        </li>)}</ul>)}
    </div>
    {data && <div className="sp-pagination"><span>{data.total} formations</span><div className="sp-actions"><button className="sp-btn sp-btn-sm" disabled={busy || offset === 0} onClick={() => setOffset(offset - 50)}>Précédent</button><button className="sp-btn sp-btn-sm" disabled={busy || offset + 50 >= data.total} onClick={() => setOffset(offset + 50)}>Suivant</button></div></div>}
    <p className="sp-subtitle sp-small">Les formations partenaires sont rattachées automatiquement. Les correspondances nationales sont validées par Zelia. Une présence au catalogue ne garantit pas une recommandation.</p>
  </section>
}
