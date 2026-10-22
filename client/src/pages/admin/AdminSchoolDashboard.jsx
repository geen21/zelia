import React, { useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useParams } from 'react-router-dom'
import { adminApi, adminError } from '../../lib/adminApi'
import { createDashboardAPI } from '../../lib/schoolPortalApi'
import '../school-portal/SchoolPortal.css'

export default function AdminSchoolDashboard() {
  const { companyId } = useParams()
  const api = useMemo(() => createDashboardAPI(adminApi, `/schools/${companyId}/dashboard`), [companyId])
  const [company, setCompany] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    api.getMe().then((response) => { if (active) { setCompany(response.data.company); setError('') } },
      (failure) => { if (active) setError(adminError(failure)) })
    return () => { active = false }
  }, [api])
  return <div className="sp-shell"><div className="sp-card" role="status">
    <strong>Aperçu administrateur — lecture seule</strong> <Link to="/admin/ecoles">Retour aux écoles</Link>
    {company && <p>{company.name} — {company.approved ? 'Accès partenaire autorisé' : 'Accès partenaire non autorisé'}</p>}
  </div>
    <nav className="sp-nav" aria-label="Dashboard partenaire">{[['leads', 'Leads'], ['statistiques', 'Statistiques'], ['formations', 'Formations'], ['equipe', 'Équipe']].map(([path, label]) => <Link className="sp-nav-link" key={path} to={`/admin/ecoles/${companyId}/dashboard/${path}`}>{label}</Link>)}</nav>
    {error ? <p role="alert">{error}</p> : company ? <Outlet context={{ company, api, readOnly: true }} /> : <p>Chargement…</p>}
  </div>
}
