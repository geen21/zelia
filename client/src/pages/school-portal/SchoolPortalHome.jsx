import React from 'react'
import { Link } from 'react-router-dom'
import SEO from '../../components/SEO'
import './SchoolPortal.css'

const BENEFITS = [
  {
    icon: 'ph-target',
    title: 'Des leads qualifiés',
    detail: 'Récupérez les coordonnées des lycéens et étudiants qui ont choisi votre établissement parmi leurs pistes d\'orientation, ou qui ont demandé plus d\'informations.'
  },
  {
    icon: 'ph-chart-bar',
    title: 'Un tableau de bord complet',
    detail: 'Statuts de suivi, notes internes, filtres et statistiques pour piloter vos relances efficacement.'
  },
  {
    icon: 'ph-graduation-cap',
    title: 'Vos formations mises en avant',
    detail: 'Gérez vous-même des fiches formation supplémentaires, en plus de celles déjà référencées sur Zélia.'
  },
  {
    icon: 'ph-users',
    title: 'Toute votre équipe',
    detail: 'Invitez vos collègues à accéder à l\'espace de votre établissement.'
  },
  {
    icon: 'ph-shield-check',
    title: 'Un consentement respecté',
    detail: 'Seuls les élèves ayant accepté d\'être recontactés ou ayant demandé des informations apparaissent dans votre espace.'
  },
  {
    icon: 'ph-check-circle',
    title: 'Un accès vérifié',
    detail: 'Chaque compte est validé par notre équipe avant d\'accéder aux données de contact des élèves.'
  }
]

export default function SchoolPortalHome() {
  return (
    <main className="sp-shell">
      <SEO
        title="Zélia - Espace écoles partenaires"
        description="Récupérez les leads des élèves qui s'intéressent à votre établissement sur Zélia."
        url="https://zelia.io/espace-ecoles"
        noindex
      />

      <header className="sp-topbar">
        <div className="sp-topbar-inner">
          <Link to="/" className="sp-logo" aria-label="Accueil Zelia">
            <img src="/static/images/logo-dark.png" alt="Zelia" />
          </Link>
          <div className="sp-topbar-actions">
            <Link to="/espace-ecoles/connexion" className="sp-btn sp-btn-sm">Connexion</Link>
            <Link to="/espace-ecoles/inscription" className="sp-btn sp-btn-primary sp-btn-sm">Créer mon compte école</Link>
          </div>
        </div>
      </header>

      <section className="sp-main" style={{ maxWidth: 760, textAlign: 'center', paddingTop: 48 }}>
        <p className="sp-kicker">Espace écoles partenaires</p>
        <h1 className="sp-title" style={{ fontSize: 'clamp(28px, 5vw, 42px)', marginBottom: 16 }}>
          Retrouvez les élèves intéressés par votre établissement
        </h1>
        <p className="sp-subtitle" style={{ fontSize: 16, marginBottom: 28 }}>
          Zélia accompagne des milliers de lycéens et étudiants dans leur orientation. Créez votre compte pour
          accéder aux profils des élèves qui ont sélectionné votre école, suivre vos leads et mettre en avant vos formations.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 48 }}>
          <Link to="/espace-ecoles/inscription" className="sp-btn sp-btn-primary" style={{ height: 48, padding: '0 26px' }}>
            Créer mon compte école
          </Link>
          <Link to="/espace-ecoles/connexion" className="sp-btn" style={{ height: 48, padding: '0 26px' }}>
            J'ai déjà un compte
          </Link>
        </div>
      </section>

      <section className="sp-main" style={{ paddingTop: 0, display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {BENEFITS.map((benefit, index) => (
          <div key={benefit.title} className={`sp-card ${index % 3 === 1 ? 'accent-pink' : index % 3 === 2 ? 'accent-ink' : ''}`}>
            <i className={`ph ${benefit.icon}`} style={{ fontSize: 26 }} aria-hidden="true" />
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '12px 0 6px' }}>{benefit.title}</h2>
            <p className="sp-subtitle" style={{ margin: 0 }}>{benefit.detail}</p>
          </div>
        ))}
      </section>
    </main>
  )
}
