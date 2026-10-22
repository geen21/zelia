import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
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
  return <section className="sp-section" aria-label="Comparaison des catalogues">
    <h2 className="sp-section-title">Naturel et sponsorisé</h2>
    <p>Les formations partenaires sont rattachées automatiquement à leur espace. Les correspondances du catalogue national restent à valider par Zélia. La présence dans un catalogue ne garantit pas une recommandation.</p>
    <button className="sp-btn sp-btn-sm" disabled={busy} onClick={() => setRevision((value) => value + 1)}>Vérifier ma présence dans le catalogue national</button>
    {error && <p role="alert">{error}</p>}
    <div className="sp-filters"><select aria-label="Catalogue" value={source} onChange={(event) => { setSource(event.target.value); setOffset(0) }}><option value="">Les deux catalogues</option><option value="formation_france">Résultats naturels</option><option value="ecoles_partenaires">Résultats sponsorisés</option></select>
      {managing && <input aria-label="Rechercher un établissement à rattacher" placeholder="Nom ou variante de l’établissement" value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0) }} />}</div>
    {busy && <p>Vérification…</p>}
    {data && <><p>{data.natural} formation(s) naturelle(s), {data.sponsored} formation(s) sponsorisée(s) trouvées.</p>
      {!data.items.length && <p>Aucune correspondance. Contactez Zélia pour vérifier le nom et les campus.</p>}
      <ul className="sp-row-list">{data.items.map((item) => <li className="sp-row-item" key={`${item.source}:${item.reference}`}>
        <div><strong>{item.title}</strong><p>{item.school} — {item.campus || 'Campus non renseigné'}</p>
          <p>{item.source === 'formation_france' ? 'Naturel' : 'Sponsorisé'} — {item.linked ? item.source === 'ecoles_partenaires' ? 'Rattachée à l’espace partenaire' : 'Rattachement validé' : 'Correspondance à vérifier'}{!item.active ? ' — Archivée' : !item.recommended ? ' — Hors recommandations' : ''}</p></div>
        {formationHref({ link: item.url }) ? <a className="sp-btn sp-btn-sm" href={formationHref({ link: item.url })} target="_blank" rel="noopener noreferrer">Voir la fiche</a> : <small>Lien indisponible</small>}
        {managing && (item.source === 'ecoles_partenaires' && item.linked ? <span className="sp-badge">Rattachement automatique</span> : <button className="sp-btn sp-btn-sm" disabled={busy || Boolean(item.linkedCompanyId && !item.linked)} onClick={() => attach(item)}>{item.linked ? 'Retirer le rattachement' : item.linkedCompanyId ? 'Autre école' : 'Valider le rattachement'}</button>)}
      </li>)}</ul>
      <div className="sp-pagination"><button className="sp-btn sp-btn-sm" disabled={busy || offset === 0} onClick={() => setOffset(offset - 50)}>Précédent</button><span>{data.total} formations</span><button className="sp-btn sp-btn-sm" disabled={busy || offset + 50 >= data.total} onClick={() => setOffset(offset + 50)}>Suivant</button></div>
    </>}
  </section>
}
