import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { usersAPI } from '../lib/api'
import { buildAvatarFromProfile } from '../lib/avatar'
import { supabase } from '../lib/supabase'
import { isStandaloneToolRoute, isToolCompletionText } from '../lib/toolMode'

const HOME_NAV_ITEM = { to: '/app', label: "Conseiller d'orientation", icon: 'ph-compass', end: true }

const PRIMARY_NAV_ITEMS = [
  { to: '/app/discuter', label: 'Discuter', icon: 'ph-chat-circle-dots' },
  { to: '/app/outils', label: 'Outils', icon: 'ph-toolbox' },
  { to: '/app/formations', label: 'Formations et écoles', icon: 'ph-graduation-cap', matches: ['/app/formations', '/app/ecoles-partenaires'] }
]

const DESKTOP_NAV_ITEMS = [HOME_NAV_ITEM, ...PRIMARY_NAV_ITEMS]

const BOTTOM_NAV_ITEMS = [
  { to: '/app/results', label: 'Résultats', icon: 'ph-chart-line-up' }
]

const MOBILE_NAV_ITEMS = [HOME_NAV_ITEM, ...PRIMARY_NAV_ITEMS, ...BOTTOM_NAV_ITEMS]

const PAGE_LABELS = [
  { match: '/app/profile', label: 'Profil' },
  { match: '/app/discuter', label: 'Discuter' },
  { match: '/app/formations', label: 'Formations et écoles' },
  { match: '/app/emplois', label: 'Métiers' },
  { match: '/app/outils', label: 'Outils' },
  { match: '/app/ecoles-partenaires', label: 'Formations et écoles' },
  { match: '/app/lettre', label: 'Lettre' },
  { match: '/app/results', label: 'Résultats' },
  { match: '/app', label: "Conseiller d'orientation", exact: true }
]

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
  const contentRef = useRef(null)

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

  const pageTitle = useMemo(() => {
    const found = PAGE_LABELS.find((item) => item.exact ? location.pathname === item.match : location.pathname.startsWith(item.match))
    return found?.label || "Conseiller d'orientation"
  }, [location.pathname])

  const isChatSurface = location.pathname.startsWith('/app/discuter')
  const isToolDetail = isStandaloneToolRoute(location.pathname)
  const isHomeDashboard = location.pathname === '/app'

  useEffect(() => {
    if (!isToolDetail) return undefined
    const root = contentRef.current
    if (!root) return undefined

    const decorateCompletionButtons = () => {
      root.querySelectorAll('button, a').forEach((element) => {
        if (element.closest('[data-tool-shell-control="true"]')) return
        if (!isToolCompletionText(element.textContent)) return
        if (element.textContent.trim() !== 'Terminer') {
          element.textContent = 'Terminer'
        }
        element.setAttribute('aria-label', 'Terminer')
        if (element.tagName === 'BUTTON' && !element.getAttribute('type')) {
          element.setAttribute('type', 'button')
        }
      })
    }

    decorateCompletionButtons()
    const observer = new MutationObserver(decorateCompletionButtons)
    observer.observe(root, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [isToolDetail, location.pathname])

  function handleToolClickCapture(event) {
    if (!isToolDetail) return
    const action = event.target?.closest?.('button, a')
    if (!action || action.closest('[data-tool-shell-control="true"]')) return
    if (!isToolCompletionText(action.textContent)) return

    event.preventDefault()
    event.stopPropagation()
    event.nativeEvent?.stopImmediatePropagation?.()
    navigate('/app', { replace: true })
  }

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

  const renderDesktopNavItem = (item) => {
    const isActive = isNavItemActive(item, location.pathname)
    return (
      <Link
        key={item.to}
        to={item.to}
        aria-current={isActive ? 'page' : undefined}
        className={`group flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
          isActive ? 'bg-black text-white' : 'text-gray-700 hover:bg-[#fffbf7] hover:text-black'
        }`}
      >
        {item.image ? (
          <img src={item.image} alt="" className="h-5 w-auto" aria-hidden="true" />
        ) : (
          <i className={`ph ${item.icon} text-lg`} aria-hidden="true" />
        )}
        <span>{item.label}</span>
      </Link>
    )
  }

  const renderMobileNavItem = (item) => {
    const isActive = isNavItemActive(item, location.pathname)
    return (
      <Link
        key={item.to}
        to={item.to}
        aria-current={isActive ? 'page' : undefined}
        className={`h-9 px-3 rounded-lg inline-flex items-center gap-2 text-sm font-medium whitespace-nowrap border ${
          isActive ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-line'
        }`}
      >
        {item.image ? (
          <img src={item.image} alt="" className="h-5 w-auto" aria-hidden="true" />
        ) : (
          <i className={`ph ${item.icon}`} aria-hidden="true" />
        )}
        <span>{item.label}</span>
      </Link>
    )
  }

  return (
    <>
    <style>{appShellStyles}</style>
    <div className="zelia-app-shell h-screen min-h-screen bg-[#fffbf7] text-text-primary overflow-hidden">
      <aside className="zelia-app-sidebar h-screen min-h-0 flex-col border-r border-line bg-white">
        <div className="h-16 shrink-0 border-b border-line px-5 flex items-center">
          <Link to="/app" className="inline-flex" title="Accueil Zélia" aria-label="Accueil Zélia">
            <img src="/static/images/logo-dark.png" alt="Zelia" className="h-7 w-auto" />
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Navigation principale desktop">
          {DESKTOP_NAV_ITEMS.map(renderDesktopNavItem)}
        </nav>

        <div className="shrink-0 border-t border-line p-3 space-y-2">
          <nav className="space-y-1" aria-label="Navigation secondaire desktop">
            {BOTTOM_NAV_ITEMS.map(renderDesktopNavItem)}
          </nav>
          <Link
            to="/app/profile"
            className="flex min-h-12 items-center gap-3 rounded-lg border border-line bg-[#fffbf7] px-3 py-2 hover:border-black"
            title="Profil"
            aria-label="Profil"
          >
            <img src={avatarUrl} className="w-9 h-9 rounded-lg bg-white p-1 object-cover" alt="Avatar" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-gray-950">{userName}</span>
              <span className="block text-xs text-text-secondary">Profil</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-line bg-white text-sm font-semibold text-gray-800 hover:border-black disabled:opacity-60"
          >
            <i className={`ph ${loggingOut ? 'ph-spinner-gap animate-spin' : 'ph-sign-out'} text-lg`} aria-hidden="true" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      <div className="zelia-app-main flex h-screen min-w-0 flex-col overflow-hidden">
      {!isHomeDashboard && (
      <header className="sticky top-0 z-30 border-b border-line bg-white/92 backdrop-blur shrink-0 lg:hidden">
        <div className="h-14 px-3 flex items-center gap-2">
          <Link to="/app" className="shrink-0" title="Accueil Zélia" aria-label="Accueil Zélia">
            <img src="/static/images/logo-dark.png" alt="Zelia" className="h-6 w-auto" />
          </Link>
          <nav className="flex flex-1 min-w-0 overflow-x-auto gap-2" aria-label="Navigation principale mobile">
            {MOBILE_NAV_ITEMS.map(renderMobileNavItem)}
          </nav>
          <Link
            to="/app/profile"
            className="h-9 w-9 shrink-0 rounded-lg border border-line bg-white inline-grid place-items-center hover:border-black"
            title="Profil"
            aria-label="Profil"
          >
            <img src={avatarUrl} className="w-6 h-6 rounded object-cover" alt="Avatar" />
          </Link>
          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            className="h-9 w-9 shrink-0 rounded-lg border border-line bg-white inline-grid place-items-center hover:border-black"
            title="Déconnexion"
            aria-label="Déconnexion"
          >
            <i className={`ph ${loggingOut ? 'ph-spinner-gap animate-spin' : 'ph-sign-out'} text-base`} aria-hidden="true" />
          </button>
        </div>
      </header>
      )}

      <main className={isChatSurface ? 'flex-1 min-h-0 overflow-hidden' : 'flex-1 min-h-0 overflow-y-auto'}>
        <div ref={contentRef} onClickCapture={handleToolClickCapture} className={isChatSurface ? 'w-full h-full min-h-0 max-w-none overflow-hidden px-3 sm:px-5 lg:px-8 py-3 sm:py-4' : isHomeDashboard ? 'w-full max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-6' : 'w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6'}>
          {isToolDetail && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Link
                to="/app/outils"
                data-tool-shell-control="true"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-medium text-gray-800 hover:border-black"
              >
                <i className="ph ph-arrow-left" aria-hidden="true" />
                <span>Retour aux outils</span>
              </Link>
              <button
                type="button"
                data-tool-shell-control="true"
                onClick={() => navigate('/app', { replace: true })}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-black bg-black px-3 text-sm font-semibold text-white hover:bg-gray-900"
              >
                Terminer
              </button>
            </div>
          )}
          <Outlet />
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
  width: 100%;
}

.zelia-app-sidebar {
  display: none;
}

.zelia-app-main {
  flex: 1 1 auto;
  width: 100%;
}

@media (min-width: 1024px) {
  .zelia-app-shell {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
  }

  .zelia-app-sidebar {
    display: flex;
  }

  .zelia-app-main {
    grid-column: 2;
    width: 100%;
  }
}
`
