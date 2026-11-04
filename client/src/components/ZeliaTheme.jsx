import React from 'react'
import { useLocation } from 'react-router-dom'
import PublicHeader from './PublicHeader'
import PublicFooter from './PublicFooter'
import '../zelia-ui.css'

export default function ZeliaTheme({ children }) {
  const { pathname } = useLocation()
  if (/^\/(?:espace-ecoles|admin)(?:\/|$)/.test(pathname)) return children

  const isPublic = pathname === '/' || /^\/(?:parents|blog|formations|metiers|legal)(?:\/|$)/.test(pathname)
  const isLegal = pathname.startsWith('/legal/')

  return (
    <div className={`zelia-ui${isPublic ? ' zelia-ui--public' : ''}`}>
      {isPublic ? (
        <>
          <div className="zelia-ui__public-content">
            {isLegal && <PublicHeader />}
            {children}
          </div>
          <PublicFooter />
        </>
      ) : children}
    </div>
  )
}
