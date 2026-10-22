import React, { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { adminApi, adminError } from '../../lib/adminApi'
import { createDashboardAPI } from '../../lib/schoolPortalApi'
import SchoolPortalCatalog from '../school-portal/SchoolPortalCatalog'
import '../school-portal/SchoolPortal.css'
import { ConfirmAction } from './AdminControls'

export function SchoolDashboardActions({ companyId, schoolName }) {
  if (!companyId) return <span className="bo-muted">Migration des espaces partenaires requise</span>
  return <div className="bo-actions">
    <Link className="bo-button bo-primary" aria-label={`Voir le dashboard de ${schoolName}`} to={`/admin/ecoles/${companyId}/dashboard/leads`}>Voir le dashboard</Link>
    <Link className="bo-button" aria-label={`Gérer les accès de ${schoolName}`} to={`/admin/ecoles?company_id=${companyId}`}>Gérer les accès</Link>
  </div>
}

export function PartnerDashboardLink({ formation }) {
  const [companyId, setCompanyId] = useState(formation.portal_company_id || null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (formation.portal_company_id) { setCompanyId(formation.portal_company_id); return }
    let active = true
    adminApi.get(`/portal/partners/${formation.id}/company`).then((response) => { if (active) setCompanyId(response.data.companyId) },
      (failure) => { if (active) setError(adminError(failure)) })
    return () => { active = false }
  }, [formation.id, formation.portal_company_id])
  return <>{error && <p role="alert">{error}</p>}<SchoolDashboardActions companyId={companyId} schoolName={formation.school_name} /></>
}

export default function AdminSchoolAccess({ company, members = [], accounts = [], onChanged }) {
  const [query] = useSearchParams()
  const api = useMemo(() => createDashboardAPI(adminApi, `/schools/${company.id}/dashboard`), [company.id])
  const [email, setEmail] = useState(company.owner_id ? '' : company.email || query.get('invite_email') || '')
  const [role, setRole] = useState(company.owner_id ? 'member' : 'owner')
  const [items, setItems] = useState([])
  const [notificationFailures, setNotificationFailures] = useState(0)
  const [audit, setAudit] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const load = async () => {
    const response = await adminApi.get(`/portal/schools/${company.id}/invitations`)
    if (!Array.isArray(response.data.items) || !Number.isInteger(response.data.notificationFailures) || !Array.isArray(response.data.recentAudit)) throw new Error('Réponse de gestion des invitations incomplète.')
    setItems(response.data.items)
    setNotificationFailures(response.data.notificationFailures || 0)
    setAudit(response.data.recentAudit || [])
  }

  useEffect(() => { load().catch((failure) => setError(adminError(failure))) }, [company.id])
  async function invite(targetEmail, targetRole) {
    setBusy(true); setError(''); setMessage('')
    try {
      await adminApi.post(`/portal/schools/${company.id}/invite`, { email: targetEmail, role: targetRole })
      setMessage('Invitation envoyée. Le destinataire choisira son mot de passe.')
      await load()
      setEmail('')
      if (targetRole === 'owner') setRole('member')
      onChanged?.()
    } catch (failure) { setError(adminError(failure)); await load().catch((loadError) => setError(`${adminError(failure)} ${adminError(loadError)}`)) }
    finally { setBusy(false) }
  }
  const statuses = { pending: 'Préparation en cours', sent: 'Envoyée', failed: 'Échec — renvoi possible', accepted: 'Activée' }
  return <section>
    <Link className="bo-button bo-primary" to={`/admin/ecoles/${company.id}/dashboard/leads`}>Voir le dashboard</Link>
    <h2>Invitations et accès</h2>
    <p>Les mots de passe et facteurs de sécurité restent privés. Une invitation ne valide pas à elle seule l’accès aux leads.</p>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <form onSubmit={(event) => { event.preventDefault(); invite(email, role) }}>
      <label className="sp-field">Email du contact<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label className="sp-field">Rôle<select value={role} onChange={(event) => setRole(event.target.value)}><option value="owner">Propriétaire</option><option value="member">Membre</option></select></label>
      <button className="bo-button" disabled={busy}>Envoyer une invitation</button>
    </form>
    <ul className="bo-record-list">{items.map((item) => <li key={item.id}><span>{item.email}<small>{item.role === 'owner' ? 'Propriétaire' : 'Membre'} — {statuses[item.status]}{item.sent_at ? ` — ${new Date(item.sent_at).toLocaleDateString('fr-FR')}` : ''}</small></span>
      <button className="bo-button" disabled={busy} onClick={() => invite(item.email, item.role)}>Renvoyer l’invitation</button>
    </li>)}</ul>
    {members.length > 0 && <><h3>Retirer un membre de cette école</h3><ul className="bo-record-list">{members.map((member) => <li key={member.id}>
      <span>{accounts.find((account) => account.id === member.user_id)?.email || member.user_id}</span>
      <ConfirmAction label="Retirer le membre" danger description="L’identité Auth est conservée. Seul l’accès à cette école sera retiré." action={(reason) => adminApi.delete(`/portal/schools/${company.id}/members/${member.id}`, { data: { reason } })} onDone={onChanged} />
    </li>)}</ul></>}
    <SchoolPortalCatalog api={api} companyId={company.id} managing />
    {notificationFailures > 0 && <p role="status">{notificationFailures} notification(s) de lead en échec. <button className="bo-button" disabled={busy} onClick={async () => {
      setBusy(true); setError('')
      try {
        await adminApi.post(`/portal/schools/${company.id}/retry-notifications`)
        await load()
        setMessage('Relance terminée. Les notifications encore en échec ou non autorisées restent signalées.')
      } catch (failure) { setError(adminError(failure)) } finally { setBusy(false) }
    }}>Réessayer les notifications</button></p>}
    <details><summary>Journal récent du dashboard (20 dernières actions)</summary><ul>{audit.map((entry) => <li key={entry.id}>{new Date(entry.created_at).toLocaleString('fr-FR')} — {entry.action} — {entry.actor_id}</li>)}</ul></details>
  </section>
}
