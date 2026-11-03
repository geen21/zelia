import React from 'react'
import { Link, useNavigate } from 'react-router-dom'

export default function BlogHeaderNav() {
  const navigate = useNavigate()

  return (
    <nav className="hero-overlay-nav modern-nav blog-nav" aria-label="Navigation principale">
      <div className="container">
        <div className="nav-content">
          <Link to="/" className="brand-logo" aria-label="Accueil">
            <img src="/assets/images/logo-dark.png" alt="Zélia" className="logo-image" />
          </Link>
          <div className="nav-actions">
            {import.meta.env.VITE_METIER_PAGES_ENABLED === 'true' && <Link to="/metiers/" className="nav-link-btn">Métiers</Link>}
            <Link to="/formations" className="nav-link-btn" aria-label="Formations">
              <span>Formations</span>
              <div className="btn-highlight"></div>
            </Link>
            <Link to="/blog" className="nav-link-btn" aria-label="Blog">
              <span>Blog</span>
              <div className="btn-highlight"></div>
            </Link>
            <button className="nav-link-btn" onClick={() => navigate('/avatar')}>
              <span>Questionnaire</span>
              <div className="btn-highlight"></div>
            </button>
            <button className="nav-cta-btn" onClick={() => navigate('/login')}>
              <span>Se connecter</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
