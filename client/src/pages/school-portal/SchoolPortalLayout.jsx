import React, { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { PiHourglass } from 'react-icons/pi'
import { schoolPortalSupabase } from '../../lib/schoolPortalSupabase'
import { schoolPortalAPI } from '../../lib/schoolPortalApi'
import SchoolPortalFrame from './SchoolPortalFrame'

export default function SchoolPortalLayout() {
  const [company, setCompany] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const challenge = location.pathname === '/espace-ecoles/securite' && new URLSearchParams(location.search).get('challenge') === '1'

  const refreshCompany = useCallback(async () => {
    const { data } = await schoolPortalAPI.getMe()
    setCompany(data.company)
    return data.company
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: sessionError } = await schoolPortalSupabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!data?.session?.access_token) {
        navigate('/espace-ecoles/connexion', { replace: true })
        return
      }
      // The AAL2 challenge must be reachable before calling protected school APIs.
      if (!challenge) await refreshCompany()
    } catch (failure) {
      if (failure.response?.data?.message === 'MFA_REQUIRED') {
        navigate('/espace-ecoles/securite?challenge=1', { replace: true })
      } else if ([401, 404].includes(failure.response?.status)) {
        navigate('/espace-ecoles/connexion', { replace: true })
      } else {
        setError(failure.response?.data?.message || failure.message || 'Impossible de charger votre espace.')
      }
    } finally { setLoading(false) }
  }, [challenge, navigate, refreshCompany])

  useEffect(() => { load() }, [load])

  async function handleLogout() {
    const { error: logoutError } = await schoolPortalSupabase.auth.signOut({ scope: 'local' })
    if (logoutError) { setError('Déconnexion impossible. Réessayez.'); return }
    navigate('/espace-ecoles/connexion', { replace: true })
  }

  if (challenge && !loading) return <Outlet />
  return <SchoolPortalFrame company={company} onLogout={handleLogout}>
    {loading ? <p className="sp-empty" role="status">Chargement de votre espace…</p> : <>
      {error && <div className="sp-alert" role="alert">{error}<div className="sp-form-footer"><button className="sp-btn" onClick={load}>Réessayer</button></div></div>}
      {company && !company.approved && <section className="sp-card sp-empty">
        <PiHourglass aria-hidden="true" /><h1 className="sp-title">Compte en cours de validation</h1>
        <p>Votre compte pour <strong>{company.name}</strong> est en attente de validation par notre équipe. Vous serez notifié(e) par email dès que l'accès sera activé.</p>
      </section>}
      {company?.approved && <Outlet context={{ company, setCompany, refreshCompany, api: schoolPortalAPI, readOnly: false }} />}
    </>}
  </SchoolPortalFrame>
}
