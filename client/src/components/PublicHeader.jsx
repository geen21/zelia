import React, { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FiArrowUpRight, FiMenu, FiX } from 'react-icons/fi'
import './PublicHeader.css'

export default function PublicHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const menuToggle = useRef(null)
  const location = useLocation()
  const closeMenu = () => setMobileMenuOpen(false)

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname, location.search, location.hash])

  return (
    <header className="public-header">
      <nav
        className="public-header__nav"
        aria-label="Navigation principale"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && mobileMenuOpen) {
            closeMenu()
            menuToggle.current?.focus()
          }
        }}
      >
        <Link to="/" className="public-header__logo" aria-label="Accueil Zélia" onClick={closeMenu}>
          <img src="/static/images/logo-dark.png" alt="Zélia" width="100" height="40" />
        </Link>
        <button
          ref={menuToggle}
          type="button"
          className="public-header__toggle"
          onClick={() => setMobileMenuOpen((open) => !open)}
          aria-expanded={mobileMenuOpen}
          aria-controls="public-header-menu"
          aria-label={mobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        >
          {mobileMenuOpen ? <FiX aria-hidden="true" /> : <FiMenu aria-hidden="true" />}
        </button>
        <div id="public-header-menu" className={`public-header__links${mobileMenuOpen ? ' is-open' : ''}`}>
          <Link to="/espace-ecoles" className="public-header__link" onClick={closeMenu}>Ambassadeur</Link>
          <Link to="/parents" className="public-header__link" onClick={closeMenu}>Parents</Link>
          <Link to="/blog" className="public-header__link public-header__link--blog" onClick={closeMenu}>Le blog</Link>
          {import.meta.env.VITE_METIER_PAGES_ENABLED === 'true' && <Link to="/metiers/" className="public-header__link" onClick={closeMenu}>Métiers</Link>}
          <Link to="/login" className="public-header__link" onClick={closeMenu}>Me connecter</Link>
          <Link to="/orientation" className="public-header__cta" onClick={closeMenu}>
            Me découvrir <FiArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      </nav>
    </header>
  )
}
