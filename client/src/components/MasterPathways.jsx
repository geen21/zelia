import React from 'react'
import { Link } from 'react-router-dom'
import { getFormationSlug } from '../lib/formationDisplay.js'
import { getNationalFormationTitle } from '../lib/nationalFormationMatching.js'
import './MasterPathways.css'

export default function MasterPathways({ formations = [] }) {
  if (!formations.length) return null
  return <section className="master-pathways" aria-labelledby="master-pathways-title">
    <h2 id="master-pathways-title">Parcours vers un master</h2>
    <p>Ces cursus peuvent mener à un master. Ce ne sont pas des propositions d’entrée directe en M1 ou M2 : vérifie les étapes et conditions d’accès sur la fiche.</p>
    <ul>
      {formations.map((row) => <li key={row.id}>
        <strong>{getNationalFormationTitle(row)}</strong>
        <span>{[row.etab_nom, row.commune].filter(Boolean).join(' · ')}</span>
        <Link to={`/formations/${getFormationSlug(row)}`}>Explorer le parcours</Link>
      </li>)}
    </ul>
  </section>
}
