import React, { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { usersAPI } from '../lib/api'
import { buildAvatarFromProfile } from '../lib/avatar'
import { supabase } from '../lib/supabase'
import { TOOLBOX_ITEMS } from '../lib/levelMapping'
import ToolExperience, { ToolIcon } from '../components/ToolExperience'

const HOME_NAV_ITEM = { to: '/app', label: "Conseiller d'orientation", icon: 'ph-compass', end: true }

const PRIMARY_NAV_ITEMS = [
  { to: '/app/discuter', label: 'Discuter', icon: 'ph-chat-circle-dots' },
  { to: '/app/outils', label: 'Outils', icon: 'ph-toolbox' },
  { to: '/app/formations', label: 'Formations et écoles', icon: 'ph-graduation-cap', matches: ['/app/formations', '/app/ecoles-partenaires'] }
]

const BOTTOM_NAV_ITEMS = [
  { to: '/app/results', label: 'Résultats', icon: 'ph-chart-line-up' }
]

const TOP_NAV_ITEMS = [HOME_NAV_ITEM, ...PRIMARY_NAV_ITEMS, ...BOTTOM_NAV_ITEMS]

function isNavItemActive(item, pathname) {
  if (item.end) return pathname === item.to
  const matches = item.matches || [item.to]
  return matches.some((match) => pathname === match || pathname.startsWith(`${match}/`))
}

function clearLocalAuthState() {
  localStorage.removeItem('token')
  localStorage.removeItem('supabase_auth_token')
  localStorage.removeItem('zelia_auth_after')
  localStorage.removeItem('pending_registration_email')
  localStorage.removeItem('pending_registration_after')
}

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [avatarUrl, setAvatarUrl] = useState('/static/images/logo-dark.png')
  const [userName, setUserName] = useState('Utilisateur')
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const profileResponse = await usersAPI.getProfile().catch(() => null)
        if (!mounted) return

        const profile = profileResponse?.data?.profile
        if (profile) {
          if (user) setAvatarUrl(buildAvatarFromProfile(profile, user.id))
          setUserName(profile.first_name || profile.prenom || 'Utilisateur')
        }
      } catch {
        if (mounted) {
          setAvatarUrl('/static/images/logo-dark.png')
          setUserName('Utilisateur')
        }
      }
    })()
    return () => { mounted = false }
  }, [])

  const isChatSurface = location.pathname.startsWith('/app/discuter')
  const currentTool = TOOLBOX_ITEMS.find((tool) => tool.path === location.pathname.replace(/\/$/, '') && tool.id !== 'formations')

  async function logout() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch (error) {
      console.warn('Supabase logout failed', error)
    } finally {
      clearLocalAuthState()
      navigate('/login', { replace: true })
    }
  }

  const renderTopNavItem = (item) => {
    const isActive = isNavItemActive(item, location.pathname)
    return (
      <Link
        key={item.to}
        to={item.to}
        aria-label={item.label}
        aria-current={isActive ? 'page' : undefined}
        className={`zelia-topnav-link ${isActive ? 'is-active' : ''}`}
      >
        <ToolIcon name={item.icon} size={18} />
        <span>{item.label}</span>
      </Link>
    )
  }

  return (
    <>
    <style>{appShellStyles}</style>
    <div className="zelia-app-shell h-screen min-h-screen bg-[#fffbf7] text-text-primary overflow-hidden">
      <header className="zelia-app-topbar shrink-0 border-b border-line bg-white">
        <div className="zelia-topbar-inner">
          <Link to="/app" className="zelia-topbar-logo" title="Accueil Zélia" aria-label="Accueil Zélia">
            <img src="/static/images/logo-dark.png" alt="Zelia" className="h-7 w-auto" />
          </Link>

          <nav className="zelia-topnav" aria-label="Navigation principale">
            {TOP_NAV_ITEMS.map(renderTopNavItem)}
          </nav>

          <div className="zelia-topbar-actions">
            <Link
              to="/app/profile"
              className="zelia-topbar-profile"
              title="Profil"
              aria-label="Profil"
            >
              <img src={avatarUrl} className="w-8 h-8 rounded-lg bg-white p-0.5 object-cover border border-line" alt="" />
              <span className="zelia-topbar-profile-name">{userName}</span>
            </Link>
            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              className="zelia-topbar-logout"
              title="Déconnexion"
              aria-label="Déconnexion"
            >
              <ToolIcon name={loggingOut ? 'ph-spinner-gap' : 'ph-sign-out'} size={18} className={loggingOut ? 'animate-spin' : undefined} />
            </button>
          </div>
        </div>
      </header>

      <div className="zelia-app-main flex min-h-0 flex-1 min-w-0 flex-col overflow-hidden">

      <main className={isChatSurface ? 'flex-1 min-h-0 overflow-hidden' : 'flex-1 min-h-0 overflow-y-auto'}>
        <div className={isChatSurface ? 'zelia-app-content w-full h-full min-h-0 max-w-none overflow-hidden py-3 sm:py-4' : 'zelia-app-content w-full max-w-7xl mx-auto py-3 sm:py-6'}>
          {currentTool ? <ToolExperience key={currentTool.id} tool={currentTool}><Outlet /></ToolExperience> : <Outlet />}
        </div>
      </main>
      </div>
    </div>
    </>
  )
}

const appShellStyles = `
.zelia-app-shell {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.zelia-app-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
}

.zelia-topbar-inner {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 64px;
  padding: 0 16px;
  max-width: 1400px;
  margin: 0 auto;
}

.zelia-topbar-logo {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.zelia-topnav {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.zelia-topnav::-webkit-scrollbar { display: none; }

.zelia-topnav-link {
  display: inline-flex;
  flex: 0 0 auto;
  justify-content: center;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  white-space: nowrap;
  transition: background-color .15s ease, color .15s ease;
}
.zelia-topnav-link:hover { background: #fffbf7; color: #000; }
.zelia-topnav-link.is-active { background: #000; color: #fff; }
.zelia-topnav-link span { display: none; }

.zelia-topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.zelia-topbar-profile {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 6px;
  border-radius: 999px;
  border: 1px solid transparent;
}
.zelia-topbar-profile:hover { border-color: var(--line, #e5e7eb); }
.zelia-topbar-profile-name { display: none; }

.zelia-topbar-logout {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid var(--line, #e5e7eb);
  background: #fff;
  color: #374151;
}
.zelia-topbar-logout:hover { border-color: #000; color: #000; }
.zelia-topbar-logout:disabled { opacity: .6; }

.zelia-app-main {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
}

@media (min-width: 768px) {
  .zelia-topnav-link span { display: inline; }
  .zelia-topbar-profile-name { display: inline; font-size: 13px; font-weight: 600; color: #030712; max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
}
`
