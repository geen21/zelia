import React from 'react'
import { Link } from 'react-router-dom'

export default function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="public-footer__container">
        <div className="public-footer__grid">
          <div className="public-footer__brand">
            <Link to="/" aria-label="Accueil Zélia"><img src="/static/images/logo-dark.png" alt="Zélia" width="100" height="40" /></Link>
            <p>Zélia t'aide à trouver les formations qui te correspondent et te met en relation directe avec les écoles adaptées à ton projet.</p>
          </div>
          <div className="public-footer__column">
            <h2>Produit</h2>
            <Link to="/orientation">Commencer le parcours</Link>
            <Link to="/formations">Formations</Link>
            <Link to="/blog">Le blog</Link>
            <Link to="/parents">Espace parents</Link>
          </div>
          <div className="public-footer__column">
            <h2>Établissements</h2>
            <Link to="/espace-ecoles">Devenir partenaire</Link>
            <Link to="/espace-ecoles/connexion">Connexion école</Link>
          </div>
          <div className="public-footer__column">
            <h2>Légal</h2>
            <Link to="/legal/mentions-legales">Mentions légales</Link>
            <Link to="/legal/conditions">CGU, CGV &amp; confidentialité</Link>
            <a href="mailto:nicolas.wiegele@zelia.io">Nous contacter</a>
          </div>
        </div>
        <div className="public-footer__bottom">© {new Date().getFullYear()} Zélia. Tous droits réservés.</div>
      </div>
    </footer>
  )
}
