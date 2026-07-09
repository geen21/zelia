import React, { useCallback, useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { schoolPortalSupabase } from '../../lib/schoolPortalSupabase'
import { schoolPortalAPI } from '../../lib/schoolPortalApi'
import './SchoolPortal.css'

const NAV_ITEMS = [
  { to: '/espace-ecoles/leads', label: 'Leads', icon: 'ph-users-three' },
  { to: '/espace-ecoles/statistiques', label: 'Statistiques', icon: 'ph-chart-bar' },
  { to: '/espace-ecoles/formations', label: 'Mes formations', icon: 'ph-graduation-cap' },
  { to: '/espace-ecoles/equipe', label: 'Équipe', icon: 'ph-users' }
]

export default function SchoolPortalLayout() {
  const [company, setCompany] = useState(null)
  const [pendingApproval, setPendingApproval] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const location = useLocation()

  const refreshCompany = useCallback(async () => {
    try {
      const { data } = await schoolPortalAPI.getMe()
      const currentCompany = data?.company || null
      setCompany(currentCompany)
      setPendingApproval(Boolean(currentCompany && !currentCompany.approved))
      return currentCompany
    } catch (loadError) {
      const status = loadError?.response?.status
      if (status === 401 || status === 404) {
        navigate('/espace-ecoles/connexion', { replace: true })
        return null
      }
      setError(loadError?.response?.data?.error || 'Impossible de charger votre espace')
      return null
    }
  }, [navigate])

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      setError('')
      const { data } = await schoolPortalSupabase.auth.getSession()
      if (!active) return
      if (!data?.session?.access_token) {
        navigate('/espace-ecoles/connexion', { replace: true })
        return
      }
      await refreshCompany()
      if (active) setLoading(false)
    })()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleLogout() {
    await schoolPortalSupabase.auth.signOut().catch(() => {})
    navigate('/espace-ecoles/connexion', { replace: true })
  }

  return (
    <div className="sp-shell">
      <header className="sp-topbar">
        <div className="sp-topbar-inner">
          <Link to="/" className="sp-logo" aria-label="Accueil Zelia">
            <img src="/static/images/logo-dark.png" alt="Zelia" />
          </Link>

          {!loading && !pendingApproval && company && (
            <nav className="sp-nav" aria-label="Navigation espace écoles">
              {NAV_ITEMS.map((item) => {
                const isActive = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
                return (
                  <Link key={item.to} to={item.to} className={`sp-nav-link ${isActive ? 'is-active' : ''}`}>
                    <i className={`ph ${item.icon}`} aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </nav>
          )}

          <div className="sp-topbar-actions">
            {company?.name && <span className="sp-company-chip">{company.name}</span>}
            <button type="button" onClick={handleLogout} className="sp-logout-btn" aria-label="Se déconnecter" title="Se déconnecter">
              <i className="ph ph-sign-out" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className="sp-main">
        {loading && <p className="sp-empty">Chargement...</p>}

        {!loading && pendingApproval && (
          <div className="sp-card sp-pending">
            <p className="sp-title" style={{ fontSize: 20, marginBottom: 8 }}>Compte en cours de validation</p>
            <p className="sp-subtitle">
              Votre compte pour <strong>{company?.name}</strong> est en attente de validation par notre équipe.
              Vous serez notifié(e) par email dès que l'accès sera activé.
            </p>
          </div>
        )}

        {!loading && !pendingApproval && error && (
          <div className="sp-card" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c', marginBottom: 16 }}>
            {error}
          </div>
        )}

        {!loading && !pendingApproval && company && (
          <Outlet context={{ company, setCompany, refreshCompany }} />
        )}
      </main>
    </div>
  )
}
