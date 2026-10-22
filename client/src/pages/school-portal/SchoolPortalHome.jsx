import React from 'react'
import { Link } from 'react-router-dom'
import SEO from '../../components/SEO'
import { PiTarget, PiChartBar, PiGraduationCap, PiUsers, PiShieldCheck, PiCheckCircle, PiArrowRight } from 'react-icons/pi'
import './SchoolPortal.css'

const BENEFITS = [
  {
    icon: PiTarget,
    title: 'Des leads qualifiés',
    detail: 'Récupérez les coordonnées des lycéens et étudiants qui ont choisi votre établissement parmi leurs pistes d\'orientation, ou qui ont demandé plus d\'informations.'
  },
  {
    icon: PiChartBar,
    title: 'Un tableau de bord complet',
    detail: 'Statuts de suivi, notes internes, filtres et statistiques pour piloter vos relances efficacement.'
  },
  {
    icon: PiGraduationCap,
    title: 'Vos formations mises en avant',
    detail: 'Gérez vous-même des fiches formation supplémentaires, en plus de celles déjà référencées sur Zélia.'
  },
  {
    icon: PiUsers,
    title: 'Toute votre équipe',
    detail: 'Invitez vos collègues à accéder à l\'espace de votre établissement.'
  },
  {
    icon: PiShieldCheck,
    title: 'Un consentement respecté',
    detail: 'Seuls les élèves ayant accepté d\'être recontactés ou ayant demandé des informations apparaissent dans votre espace.'
  },
  {
    icon: PiCheckCircle,
    title: 'Un accès vérifié',
    detail: 'Chaque compte est validé par notre équipe avant d\'accéder aux données de contact des élèves.'
  }
]

export default function SchoolPortalHome() {
  return (
    <div className="sp-shell">
      <SEO
        title="Zélia - Espace écoles partenaires"
        description="Récupérez les leads des élèves qui s'intéressent à votre établissement sur Zélia."
        url="https://zelia.io/espace-ecoles"
        noindex
      />

      <header className="sp-public-header">
          <Link to="/" className="sp-logo" aria-label="Accueil Zelia">
            <img src="/static/images/logo-dark.png" alt="Zelia" />
          </Link>
          <div className="sp-actions">
            <Link to="/espace-ecoles/connexion" className="sp-btn sp-btn-sm">Connexion</Link>
            <Link to="/espace-ecoles/inscription" className="sp-btn sp-btn-primary sp-btn-sm">Demander mon inscription</Link>
          </div>
      </header>

      <main><section className="sp-hero">
        <span className="sp-hero-tag"><PiGraduationCap aria-hidden="true" />Espace écoles partenaires</span>
        <h1 className="sp-title">
          Des projets d’avenir. Des rencontres qui comptent.
        </h1>
        <p className="sp-subtitle">
          Zélia accompagne des milliers de lycéens et étudiants dans leur orientation. Demandez votre inscription pour
          accéder aux profils des élèves qui ont sélectionné votre école, suivre vos leads et mettre en avant vos formations.
          Notre équipe vous recontactera dans les 2 jours ouvrés.
        </p>
        <div className="sp-actions">
          <Link to="/espace-ecoles/inscription" className="sp-btn sp-btn-primary">
            Demander mon inscription<PiArrowRight aria-hidden="true" />
          </Link>
          <Link to="/espace-ecoles/connexion" className="sp-btn">
            J'ai déjà un compte
          </Link>
        </div>
      </section>

      <section className="sp-benefits" aria-label="Les avantages de l’espace écoles">
        {BENEFITS.map((benefit, index) => (
          <div key={benefit.title} className="sp-card">
            <span className={`sp-section-icon${index % 2 ? ' sp-section-icon-pink' : ''}`}><benefit.icon aria-hidden="true" /></span>
            <h2 className="sp-section-title">{benefit.title}</h2>
            <p className="sp-subtitle">{benefit.detail}</p>
          </div>
        ))}
      </section>
      </main>
    </div>
  )
}
