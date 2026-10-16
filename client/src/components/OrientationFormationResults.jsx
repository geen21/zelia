import React from 'react'
import { getDiplomaFamily, getFormationTitle } from '../lib/formationDisplay.js'
import { getBestFormationResultKey, mixFormationResults } from '../lib/orientationFormationResults.js'

export default function OrientationFormationResults({ formations, partners, selectedIds, onToggleInfo, getTitle = (formation) => formation.title || getFormationTitle(formation.raw) }) {
  const results = mixFormationResults(formations, partners)
  const bestResultKey = getBestFormationResultKey(results)
  return <div className="formation-lead-grid" aria-label="Formations recommandées">
    {results.map(({ key, source, formation }) => {
      const partner = source === 'partner'
      const raw = formation.raw || {}
      const title = partner ? formation.formation_name : getTitle(formation)
      const school = partner ? formation.school_name : raw.etab_nom
      const city = partner ? formation.city : raw.commune || raw.departement
      const level = partner ? formation.diploma_level : getDiplomaFamily(raw) || raw.tc
      const score = partner ? formation.match_score : formation.matchScore
      const selectionId = partner ? key : formation.id
      const checked = selectedIds.has(selectionId)
      return <div key={key} className={`formation-lead-card${partner && formation.highlight_in_results !== false ? ' formation-lead-card-partner' : ''}`} data-source={source}>
        {partner && <span className="formation-lead-partner-label"><i className="ph ph-handshake" aria-hidden="true" />Partenaire</span>}
        {key === bestResultKey && <span className="formation-lead-best-match">Là où tu peux exceller</span>}
        <div className="formation-lead-head"><strong>{title}</strong>{score != null && <span className="formation-lead-score">{score}%</span>}</div>
        {school && <p className="formation-lead-subtitle">{school}</p>}
        <div className="formation-lead-meta">{level && <span className="formation-lead-chip">{level}</span>}{city && <span className="formation-lead-chip"><i className="ph ph-map-pin" aria-hidden="true" />{city}</span>}</div>
        <label className={`formation-lead-check${checked ? ' is-checked' : ''}`}><input type="checkbox" checked={checked} onChange={() => onToggleInfo(selectionId)} /><i className={`ph ${checked ? 'ph-check-square' : 'ph-square'}`} aria-hidden="true" />Je veux plus d'infos</label>
      </div>
    })}
  </div>
}