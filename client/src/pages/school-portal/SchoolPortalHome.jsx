import React from 'react'
import { Link } from 'react-router-dom'
import SEO from '../../components/SEO'

const BENEFITS = [
  {
    icon: 'ph-target',
    title: 'Des leads qualifiés',
    detail: 'Récupérez les coordonnées des lycéens et étudiants qui ont choisi votre établissement parmi leurs pistes d\'orientation.'
  },
  {
    icon: 'ph-chart-bar',
    title: 'Un profil complet',
    detail: 'Classe actuelle, niveau visé, budget, moyenne, préférence géographique : tout ce qu\'il faut pour prioriser vos relances.'
  },
  {
    icon: 'ph-shield-check',
    title: 'Un consentement respecté',
    detail: 'Seuls les élèves ayant accepté d\'être recontactés apparaissent dans votre espace.'
  },
  {
    icon: 'ph-check-circle',
    title: 'Un accès vérifié',
    detail: 'Chaque compte est validé par notre équipe avant d\'accéder aux données de contact des élèves.'
  }
]

export default function SchoolPortalHome() {
  return (
    <main className="min-h-screen bg-[#fffbf7] text-black">
      <SEO
        title="Zélia - Espace écoles partenaires"
        description="Récupérez les leads des élèves qui s'intéressent à votre établissement sur Zélia."
        url="https://zelia.io/espace-ecoles"
        noindex
      />

      <nav className="max-w-5xl mx-auto flex items-center justify-between px-4 py-6">
        <Link to="/" className="inline-flex" aria-label="Accueil Zelia">
          <img src="/static/images/logo-dark.png" alt="Zelia" className="h-8 w-auto" />
        </Link>
        <div className="flex items-center gap-4 text-sm font-medium">
          <Link to="/espace-ecoles/connexion" className="text-black hover:underline">Connexion</Link>
          <Link to="/espace-ecoles/inscription" className="h-10 px-4 inline-flex items-center rounded-lg bg-black text-white font-semibold">
            Créer mon compte école
          </Link>
        </div>
      </nav>

      <section className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-xs uppercase font-medium text-text-secondary tracking-normal mb-3">Espace écoles partenaires</p>
        <h1 className="text-3xl sm:text-4xl font-semibold leading-tight mb-4">
          Retrouvez les élèves intéressés par votre établissement
        </h1>
        <p className="text-text-secondary text-base sm:text-lg mb-8">
          Zélia accompagne des milliers de lycéens et étudiants dans leur orientation. Créez votre compte pour
          accéder aux profils des élèves qui ont sélectionné votre école dans leur parcours.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/espace-ecoles/inscription" className="h-12 px-6 inline-flex items-center rounded-lg bg-black text-white font-semibold">
            Créer mon compte école
          </Link>
          <Link to="/espace-ecoles/connexion" className="h-12 px-6 inline-flex items-center rounded-lg border border-line font-semibold hover:border-black">
            J'ai déjà un compte
          </Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 pb-16 grid gap-4 sm:grid-cols-2">
        {BENEFITS.map((benefit) => (
          <div key={benefit.title} className="bg-white border border-line rounded-lg shadow-card p-5">
            <i className={`ph ${benefit.icon} text-2xl`} aria-hidden="true" />
            <h2 className="text-lg font-semibold mt-3 mb-1">{benefit.title}</h2>
            <p className="text-sm text-text-secondary">{benefit.detail}</p>
          </div>
        ))}
      </section>
    </main>
  )
}
