import React from 'react'

export const ORIGIN_LABELS = { natural: 'Naturel', sponsored: 'Sponsorisé', mixed: 'Mixte', unknown: 'Origine inconnue' }
export const CHANNEL_LABELS = { questionnaire: 'Questionnaire', direct_request: 'Demande directe', partner_submission: 'Candidature partenaire', legacy_contact: 'Contact historique', multiple: 'Plusieurs canaux' }
export const STATUS_LABELS = { nouveau: 'Nouveau', a_contacter: 'À contacter', contacte: 'Contacté', converti: 'Converti', archive: 'Archivé' }

export default function SchoolPortalFilters({ value, onChange, campuses = [], leads = false }) {
  const change = (key) => (event) => onChange({ ...value, [key]: event.target.value })
  return <div className="sp-filters">
    {leads && <input type="search" aria-label="Rechercher un lead" placeholder="Prénom, nom ou email révélé" value={value.search || ''} onChange={change('search')} />}
    <select aria-label="Origine du résultat" value={value.origin || ''} onChange={change('origin')}>
      <option value="">Toutes les origines</option>{Object.entries(ORIGIN_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
    <select aria-label="Campus" value={value.campus || ''} onChange={change('campus')}>
      <option value="">Tous les campus</option>{campuses.filter(Boolean).map((campus) => <option key={campus}>{campus}</option>)}
    </select>
    <select aria-label="Canal d’acquisition" value={value.source || ''} onChange={change('source')}>
      <option value="">Tous les canaux</option>{Object.entries(CHANNEL_LABELS).filter(([key]) => key !== 'multiple').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
    {leads && <select aria-label="Statut du lead" value={value.status || ''} onChange={change('status')}>
      <option value="">Tous les statuts</option>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>}
    <label>Du <input aria-label="Depuis le" type="date" value={value.from || ''} onChange={change('from')} /></label>
    <label>Au <input aria-label="Jusqu’au" type="date" value={value.to || ''} onChange={change('to')} /></label>
    <button className="sp-btn sp-btn-sm" onClick={() => onChange({})}>Réinitialiser</button>
  </div>
}
