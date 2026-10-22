import React, { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { PiBuildings, PiChartBar, PiGraduationCap, PiList, PiLockKey, PiShieldCheck, PiSignOut, PiUsers, PiUsersThree } from 'react-icons/pi'
import SchoolPortalDialog from './SchoolPortalDialog'
import './SchoolPortal.css'

const NAV_ITEMS = [
  ['leads', 'Leads', PiUsersThree],
  ['statistiques', 'Statistiques', PiChartBar],
  ['formations', 'Mes formations', PiGraduationCap],
  ['equipe', 'Équipe', PiUsers],
  ['securite', 'Sécurité', PiLockKey]
]

export default function SchoolPortalFrame({ company, onLogout, children }) {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => { setMenuOpen(false) }, [location.pathname, location.search])
  const current = NAV_ITEMS.find(([path]) => location.pathname.endsWith(`/${path}`))
  const navigation = <nav className="sp-nav" aria-label="Navigation espace écoles">
    {NAV_ITEMS.map(([path, label, Icon]) => <NavLink key={path} className="sp-nav-link" to={`/espace-ecoles/${path}`} onClick={() => setMenuOpen(false)}>
      <Icon aria-hidden="true" /><span>{label}</span>
    </NavLink>)}
  </nav>
  const identity = company && <div className="sp-school-identity"><PiBuildings aria-hidden="true" /><div><strong>{company.name}</strong><small>{company.isOwner ? 'Compte propriétaire' : 'Espace établissement'}</small></div></div>
  const logout = <button type="button" className="sp-btn" onClick={onLogout}><PiSignOut aria-hidden="true" />Se déconnecter</button>

  return <div className="sp-shell">
    <aside className="sp-sidebar">
      <div className="sp-brand"><Link to="/espace-ecoles" className="sp-logo" aria-label="Espace écoles Zelia"><img src="/static/images/logo-dark.png" alt="Zelia" /></Link><span>Espace écoles</span></div>
      {identity}
      {company?.approved && navigation}
      <div className="sp-sidebar-footer">{logout}</div>
    </aside>
    <div className="sp-workspace">
      <header className="sp-topbar">
        <button type="button" className="sp-icon-btn sp-mobile-menu" aria-label="Ouvrir la navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><PiList aria-hidden="true" /></button>
        <span>Espace écoles</span><strong>{current?.[1] || 'Mon établissement'}</strong>
        <span className="sp-private"><PiShieldCheck aria-hidden="true" />Espace privé</span>
      </header>
      <main id="school-main" className="sp-main">{children}</main>
    </div>
    {menuOpen && <SchoolPortalDialog title="Navigation" className="sp-navigation-dialog" onClose={() => setMenuOpen(false)}>
      <div className="sp-stack">{identity}{company?.approved && navigation}{logout}</div>
    </SchoolPortalDialog>}
  </div>
}

export function SchoolPortalAuthFrame({ children, footer }) {
  return <div className="sp-shell sp-auth">
    <aside className="sp-auth-aside">
      <Link to="/espace-ecoles" className="sp-logo" aria-label="Espace écoles Zelia"><img src="/static/images/logo-dark.png" alt="Zelia" /></Link>
      <div className="sp-auth-intro">
        <p className="sp-kicker">Zelia · Espace écoles</p>
        <h2>Les bons échanges commencent ici.</h2>
        <p>Un espace pour rencontrer vos futurs étudiants, comprendre leurs projets et les accompagner vers la suite.</p>
      </div>
      <span className="sp-auth-mark"><PiShieldCheck aria-hidden="true" />Des projets partagés, un accès protégé.</span>
    </aside>
    <main className="sp-auth-main"><div className="sp-auth-content">{children}{footer && <div className="sp-auth-footer">{footer}</div>}</div></main>
  </div>
}
