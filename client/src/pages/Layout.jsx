import React, { useEffect, useRef, useState } from 'react'
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

const BOTTOM_NAV_ITEMS = [
  { to: '/app/results', label: 'Résultats', icon: 'ph-chart-line-up' }
]

const TOP_NAV_ITEMS = [HOME_NAV_ITEM, ...PRIMARY_NAV_ITEMS, ...BOTTOM_NAV_ITEMS]

// Standalone tool pages that were rebuilt as single functional pages (no more
// step-by-step "dialogue" flow) shouldn't get a forced "Terminer" button in
// the shell topbar — only the "Retour aux outils" link.
const TOOL_SLUGS_WITHOUT_FINISH_BUTTON = ['anglais', 'parcoursup', 'pitch', 'entretien']

function getToolSlug(pathname = '') {
  const match = String(pathname || '').match(/^\/app\/outils\/([^/]+)/)
  return match ? match[1] : ''
}

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

  const isChatSurface = location.pathname.startsWith('/app/discuter')
  const isToolDetail = isStandaloneToolRoute(location.pathname)
  const toolSlug = getToolSlug(location.pathname)
  const showFinishButton = isToolDetail && !TOOL_SLUGS_WITHOUT_FINISH_BUTTON.includes(toolSlug)

  useEffect(() => {
    if (!showFinishButton) return undefined
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
  }, [showFinishButton, location.pathname])

  function handleToolClickCapture(event) {
    if (!showFinishButton) return
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

  const renderTopNavItem = (item) => {
    const isActive = isNavItemActive(item, location.pathname)
    return (
      <Link
        key={item.to}
        to={item.to}
        aria-current={isActive ? 'page' : undefined}
        className={`zelia-topnav-link ${isActive ? 'is-active' : ''}`}
      >
        <i className={`ph ${item.icon} text-base`} aria-hidden="true" />
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
              <i className={`ph ${loggingOut ? 'ph-spinner-gap animate-spin' : 'ph-sign-out'} text-lg`} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <div className="zelia-app-main flex min-h-0 flex-1 min-w-0 flex-col overflow-hidden">

      <main className={isChatSurface ? 'flex-1 min-h-0 overflow-hidden' : 'flex-1 min-h-0 overflow-y-auto'}>
        <div ref={contentRef} onClickCapture={handleToolClickCapture} className={isChatSurface ? 'w-full h-full min-h-0 max-w-none overflow-hidden px-3 sm:px-5 lg:px-8 py-3 sm:py-4' : 'w-full max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-6'}>
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
              {showFinishButton && (
                <button
                  type="button"
                  data-tool-shell-control="true"
                  onClick={() => navigate('/app', { replace: true })}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-black bg-black px-3 text-sm font-semibold text-white hover:bg-gray-900"
                >
                  Terminer
                </button>
              )}
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

