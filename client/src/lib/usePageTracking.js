import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Custom hook that sends a Pageview event to the dataLayer on every route change.
 * Should be used inside a component that is wrapped by BrowserRouter.
 */
export function usePageTracking() {
  const location = useLocation()

  useEffect(() => {
    // Build the full URL
    const pageUrl = window.location.origin + location.pathname + location.search + location.hash
    const pagePath = location.pathname + location.search + location.hash

    // Get page title (fallback to document title or pathname)
    const pageTitle = document.title || pagePath

    // Ensure dataLayer exists
    window.dataLayer = window.dataLayer || []

    // Push pageview event
    window.dataLayer.push({
      'event': 'Pageview',
      'pageUrl': pageUrl,
      'pagePath': pagePath,
      'pageTitle': pageTitle
    })
  }, [location])
}

export default usePageTracking
