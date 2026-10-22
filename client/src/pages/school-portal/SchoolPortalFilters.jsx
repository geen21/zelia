import React, { useId, useState } from 'react'
import { PiMagnifyingGlass, PiSlidersHorizontal, PiArrowCounterClockwise } from 'react-icons/pi'

export const ORIGIN_LABELS = { natural: 'Naturel', sponsored: 'Sponsorisé', mixed: 'Mixte', unknown: 'Origine inconnue' }
export const CHANNEL_LABELS = { questionnaire: 'Questionnaire', direct_request: 'Demande directe', partner_submission: 'Candidature partenaire', legacy_contact: 'Contact historique', multiple: 'Plusieurs canaux' }
export const STATUS_LABELS = { nouveau: 'Nouveau', a_contacter: 'À contacter', contacte: 'Contacté', converti: 'Converti', archive: 'Archivé' }

export default function SchoolPortalFilters({ value, onChange, campuses = [], leads = false }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const change = (key) => (event) => onChange({ ...value, [key]: event.target.value })
  const active = Object.entries(value).filter(([key, item]) => key !== 'search' && item).length
  return <section className="sp-card sp-filter-card" aria-label="Filtres des résultats">
    <div className="sp-search-row">
      {leads ? <div className="sp-search"><PiMagnifyingGlass aria-hidden="true" /><input className="sp-control" type="search" aria-label="Rechercher un lead" placeholder="Rechercher un élève, un email…" value={value.search || ''} onChange={change('search')} /></div>
        : <h2 className="sp-section-title">Affiner les statistiques</h2>}
      <button type="button" className="sp-btn sp-filter-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <PiSlidersHorizontal aria-hidden="true" />Filtres{active > 0 && <span className="sp-filter-count">{active}</span>}
      </button>
    </div>
    <div id={id} className={`sp-filters${open ? ' is-open' : ''}`}>
      <label className="sp-field">Origine<select aria-label="Origine du résultat" value={value.origin || ''} onChange={change('origin')}>
        <option value="">Toutes les origines</option>{Object.entries(ORIGIN_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label className="sp-field">Campus<select aria-label="Campus" value={value.campus || ''} onChange={change('campus')}>
        <option value="">Tous les campus</option>{campuses.filter(Boolean).map((campus) => <option key={campus}>{campus}</option>)}
      </select></label>
      <label className="sp-field">Canal d’acquisition<select aria-label="Canal d’acquisition" value={value.source || ''} onChange={change('source')}>
        <option value="">Tous les canaux</option>{Object.entries(CHANNEL_LABELS).filter(([key]) => key !== 'multiple').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      {leads && <label className="sp-field">Statut<select aria-label="Statut du lead" value={value.status || ''} onChange={change('status')}>
        <option value="">Tous les statuts</option>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>}
      <label className="sp-field">Du<input aria-label="Depuis le" type="date" value={value.from || ''} onChange={change('from')} /></label>
      <label className="sp-field">Au<input aria-label="Jusqu’au" type="date" value={value.to || ''} onChange={change('to')} /></label>
      <button type="button" className="sp-btn sp-filter-reset" onClick={() => onChange({})}><PiArrowCounterClockwise aria-hidden="true" />Réinitialiser</button>
    </div>
  </section>
}
