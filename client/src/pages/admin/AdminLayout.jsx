import React, { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { PiSquaresFour, PiUsers, PiBuildings, PiGraduationCap, PiHandshake, PiEnvelope, PiChartBar, PiClockCounterClockwise, PiSignOut, PiList, PiX } from 'react-icons/pi'
import { adminSupabase } from '../../lib/adminSupabase'
import { adminApi, adminError } from '../../lib/adminApi'
import './Admin.css'

const sections = [
  ['', 'Vue d’ensemble', PiSquaresFour], ['utilisateurs', 'Utilisateurs', PiUsers],
  ['ecoles', 'Écoles', PiBuildings], ['inscriptions-ecoles', 'Inscriptions écoles', PiEnvelope],
  ['formations', 'Formations', PiGraduationCap],
  ['partenaires', 'Partenaires', PiHandshake], ['resultats', 'Résultats', PiChartBar],
  ['journal', 'Journal', PiClockCounterClockwise]
]

export default function AdminLayout() {
  const location = useLocation()
  const [state, setState] = useState({ loading: true })
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    if (window.__zeliaPublicTrackingLoaded) { window.location.replace(window.location.href); return }
    const controller = new AbortController()
    const check = async () => {
      try {
        const { data } = await adminSupabase.auth.getSession()
        if (!data.session) { setState({ login: true }); return }
        const response = await adminApi.get('/me', { signal: controller.signal })
        setState({ user: response.data.user })
      } catch (error) {
        if (!controller.signal.aborted) setState({ error: adminError(error), denied: error.response?.status === 403 })
      }
    }
    const accessError = (event) => setState(event.detail.status === 401 || event.detail.code?.startsWith('Invalid')
      ? { login: true } : { denied: true, error: 'Accès réservé aux administrateurs Zélia.' })
    window.addEventListener('bo:access-error', accessError)
    const { data: authListener } = adminSupabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setState({ login: true })
    })
    check()
    return () => { controller.abort(); window.removeEventListener('bo:access-error', accessError); authListener.subscription.unsubscribe() }
  }, [])
  useEffect(() => { setMenuOpen(false) }, [location.pathname])
  const logout = async () => {
    await adminSupabase.auth.signOut({ scope: 'local' }).catch(() => {})
    window.sessionStorage.removeItem('sb-zelia-admin-auth-token')
    setState({ login: true })
  }
  const meta = <Helmet><title>Administration | Zélia</title><meta name="robots" content="noindex, nofollow" /></Helmet>
  if (state.login) return <>{meta}<Navigate to="/admin/connexion" replace /></>
  if (state.loading) return <div className="bo-app bo-center" role="status">{meta}Chargement…</div>
  if (state.error) return <div className="bo-app bo-center">{meta}<section className="bo-access"><img src="/assets/images/logo-dark.png" alt="Zélia" /><h1>{state.denied ? 'Accès refusé' : 'Service indisponible'}</h1><p role="alert">{state.error}</p><button className="bo-button" onClick={logout}>Retour à la connexion</button></section></div>
  return <div className="bo-app">{meta}
    {menuOpen && <button className="bo-backdrop" aria-label="Fermer la navigation" onClick={() => setMenuOpen(false)} />}
    <aside className={`bo-sidebar${menuOpen ? ' bo-sidebar-open' : ''}`}>
      <NavLink to="/admin" className="bo-brand"><img src="/assets/images/logo-dark.png" alt="Zélia" /><span>Administration</span></NavLink>
      <nav aria-label="Administration">{sections.map(([path,label,Icon]) => <NavLink key={path} end={!path} to={`/admin${path ? `/${path}` : ''}`} onClick={() => setMenuOpen(false)}><Icon aria-hidden="true" /><span>{label}</span></NavLink>)}</nav>
      <div className="bo-identity"><span>{state.user.email}</span><button className="bo-icon" title="Se déconnecter" aria-label="Se déconnecter" onClick={logout}><PiSignOut /></button></div>
    </aside>
    <div className="bo-workspace"><header className="bo-topbar"><button className="bo-icon bo-menu" title="Navigation" aria-label={menuOpen ? 'Fermer la navigation' : 'Ouvrir la navigation'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <PiX /> : <PiList />}</button><span>Back-office</span><span className="bo-private">Espace privé</span></header>
      <main className="bo-main"><Outlet context={{ user: state.user }} /></main>
    </div>
  </div>
}