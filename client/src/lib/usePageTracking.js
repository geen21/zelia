import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { initializeAnalytics, trackNavigationClick, trackPageView, trackSiteEvent } from './analytics'

/**
 * Custom hook that sends a Pageview event to the dataLayer on every route change.
 * Should be used inside a component that is wrapped by BrowserRouter.
 */
export function usePageTracking() {
  const location = useLocation()
  const previousPath = useRef(null)

  useEffect(() => {
    if (previousPath.current === location.pathname) return
    previousPath.current = location.pathname
    initializeAnalytics()
    trackPageView(location, document.title || location.pathname)
    const tool = location.pathname.match(/^\/app\/outils\/([^/]+)\/?$/)
    if (tool || location.pathname === '/app/lettre') {
      trackSiteEvent('app_tool_opened', { tool_id: tool?.[1] || 'lettre' })
    }
  }, [location])

  useEffect(() => {
    document.addEventListener('click', trackNavigationClick, true)
    return () => document.removeEventListener('click', trackNavigationClick, true)
  }, [])
}

export default usePageTracking
