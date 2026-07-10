import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import SEO from '../components/SEO.jsx'
import { parentTrainingAPI } from '../lib/api.js'
import './OrientationFlow.css'
import './ParentsFormation.css'

// Live session booking, embedded via Calendly (same widget for every attendee
// after payment — not a per-user pre-generated link).
const CALENDLY_URL = 'https://calendly.com/nicolas-wiegele-zelia/formation-orientation-zelia'
const CALENDLY_SCRIPT_SRC = 'https://assets.calendly.com/assets/external/widget.js'

const STATS = [
  {
    value: '48%',
    tone: 'lime',
    text: 'des étudiants déclarent choisir leur orientation sur la base de leur goût personnel pour une filière ou un métier.'
  },
  {
    value: '70%',
    tone: 'pink',
    text: "des lycéens se disent stressés et paniqués à l'approche de Parcoursup."
  },
  {
    value: '20%',
    tone: 'pink',
    text: 'des étudiants se réorientent après une seule année dans le supérieur.'
  }
]

const MODULES = [
  {
    icon: 'ph-brain',
    title: 'Décoder',
    summary: "Comprendre la psychologie, les doutes profonds, les craintes et les envies propres à la génération actuelle d'adolescents au lycée.",
    bullets: [
      'La peur de faire le « mauvais choix » et de s\u2019enfermer.',
      'La sensation de ne pas se connaître eux-mêmes.',
      'La peur de décevoir leurs parents et leurs professeurs.'
    ]
  },
  {
    icon: 'ph-chats-circle',
    title: 'Briser la glace',
    summary: 'Instaurer un dialogue sain, constructif et sans tension autour de son avenir, en évitant les écueils classiques du blocage.',
    bullets: [
      'Éviter les interrogatoires, la projection de vos rêves non accomplis et la précipitation.',
      "Privilégier l'écoute active et les questions ouvertes plutôt que les métiers de suite.",
      'Un rituel court : 15 minutes par semaine, pour ne pas en faire un sujet de conflit.'
    ],
    accent: 'accent-pink'
  },
  {
    icon: 'ph-toolbox',
    title: 'Les outils',
    summary: "Maîtriser Parcoursup, utiliser l'intelligence artificielle comme alliée et naviguer efficacement sur les plateformes de recherche.",
    bullets: [
      'Désacraliser Parcoursup : calendrier, vœux et sous-vœux, projet de formation motivé.',
      "Utiliser l'IA (Zélia, GPT, Claude…) pour générer des idées de métiers, jamais pour décider à sa place.",
      "Savoir analyser une fiche métier et les réelles opportunités d'insertion professionnelle."
    ]
  }
]

const ACTION_PLAN = [
  {
    icon: 'ph-calendar-check',
    title: 'Planifiez le rituel « orientation »',
    text: "Convenez ensemble d'un créneau fixe de 15 minutes par semaine (par exemple le dimanche avant le dîner) pour en parler de façon exclusive et calme."
  },
  {
    icon: 'ph-puzzle-piece',
    title: 'Faites des tests ensemble',
    text: "Utilisez des outils d'IA (comme Zélia ou GPT) pour faire un premier bilan de personnalité de votre enfant, en renseignant ses envies, ses hobbies, ses passions."
  },
  {
    icon: 'ph-binoculars',
    title: 'Laissez votre enfant faire son exploration',
    text: 'Votre enfant grandit et devient plus mature. Laissez-le explorer et se confier à vous sur ses trouvailles, sans le stresser davantage.'
  }
]

export default function ParentsFormation() {
  const [searchParams] = useSearchParams()
  const verifyingRef = useRef(false)

  const [config, setConfig] = useState(null)
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '' })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [banner, setBanner] = useState(null)
  const [paid, setPaid] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await parentTrainingAPI.getConfig()
        if (!cancelled) setConfig(data)
      } catch (err) {
        console.error('Unable to load parent-training config', err)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const checkout = searchParams.get('checkout')
    const sessionId = searchParams.get('session_id')

    if (checkout === 'cancelled') {
      setBanner({ tone: 'info', text: 'Paiement annulé. Vous pouvez réessayer quand vous le souhaitez.' })
      scrollToInscription()
      return
    }

    if (!sessionId || verifyingRef.current) return
    verifyingRef.current = true
    setBanner({ tone: 'info', text: 'Vérification de votre paiement en cours…' })
    scrollToInscription()

    ;(async () => {
      try {
        const { data } = await parentTrainingAPI.verifySession(sessionId)
        if (data?.paid) {
          setPaid(true)
          setBanner({ tone: 'success', text: 'Paiement confirmé ! Bienvenue dans la formation Zélia.' })
        } else {
          setBanner({ tone: 'warning', text: 'Paiement en attente ou incomplet. Si le débit apparaît sur votre compte, contactez-nous.' })
        }
      } catch (err) {
        console.error('Parent training payment verification failed', err)
        setBanner({ tone: 'error', text: 'Impossible de vérifier le paiement. Contactez-nous si besoin : nicolas.wiegele@zelia.io' })
      }
    })()
  }, [searchParams])

  // Load the Calendly widget script only once the payment is confirmed and
  // the inline widget is actually rendered.
  useEffect(() => {
    if (!paid) return
    if (document.querySelector(`script[src="${CALENDLY_SCRIPT_SRC}"]`)) return
    const script = document.createElement('script')
    script.src = CALENDLY_SCRIPT_SRC
    script.async = true
    document.body.appendChild(script)
  }, [paid])

  const formattedPrice = useMemo(() => {
    if (!config?.priceAmount || config.priceAmount <= 0) return null
    try {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: (config.priceCurrency || 'eur').toUpperCase()
      }).format(config.priceAmount / 100)
    } catch {
      return `${(config.priceAmount / 100).toFixed(2)} ${(config.priceCurrency || 'EUR').toUpperCase()}`
    }
  }, [config])

  const updateField = (field) => (event) => {
    const { value } = event.target
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const scrollToInscription = () => {
    document.getElementById('inscription')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFormError('')

    const firstName = form.firstName.trim()
    const lastName = form.lastName.trim()
    const email = form.email.trim()

    if (!firstName || !lastName || !email) {
      setFormError('Merci de renseigner votre prénom, nom et email.')
      return
    }

    setSubmitting(true)
    try {
      const { data } = await parentTrainingAPI.checkout({ firstName, lastName, email })
      if (data?.url) {
        window.location.href = data.url
        return
      }
      throw new Error('Missing checkout url')
    } catch (err) {
      console.error('Parent training checkout failed', err)
      const message = err.response?.data?.error || 'Impossible de lancer le paiement. Merci de réessayer dans quelques instants.'
      setFormError(message)
      setSubmitting(false)
    }
  }

  return (
    <main className="orientation-flow parents-landing">
      <SEO
        title="Devenez le meilleur allié orientation de votre enfant | Formation Zélia"
        description="Une formation pas-à-pas pour accompagner votre enfant au lycée dans son orientation : décoder ses angoisses, instaurer un dialogue sain et maîtriser Parcoursup et l'IA, sans stress ni conflit."
        url="https://zelia.io/parents"
        type="website"
      />

      <header className="parents-header">
        <a href="/" className="parents-logo-link">
          <img src="/static/images/logo-dark.png" alt="Zélia" />
        </a>
        <button type="button" className="secondary-action parents-header-cta" onClick={scrollToInscription}>
          Je m'inscris
        </button>
      </header>

      <section className="parents-hero">
        <span className="orientation-pill">Formation pour les parents</span>
        <h1>Devenez un véritable conseiller d'orientation pour votre enfant</h1>
        <p>La méthode pas-à-pas pour l'accompagner au lycée avec sérénité.</p>
        <button type="button" className="primary-action" onClick={scrollToInscription}>
          Je m'inscris à la formation
        </button>
      </section>

      <section className="parents-section">
        <h2 className="parents-section-title">Le vrai constat</h2>
        <div className="parents-stats-grid">
          {STATS.map((stat) => (
            <div key={stat.value} className={`parents-stat-card tone-${stat.tone}`}>
              <span className="parents-stat-value">{stat.value}</span>
              <p>{stat.text}</p>
            </div>
          ))}
        </div>
        <p className="parents-stat-note">Sauf qu'à l'âge de faire ces choix, on ne se connaît pas encore vraiment…</p>
      </section>

      <section className="parents-section parents-challenge-section">
        <div className="orientation-card parents-challenge-card">
          <span className="parents-challenge-figure">1</span>
          <span className="parents-challenge-label">conseiller d'orientation pour</span>
          <strong className="parents-challenge-figure-big">1 500 élèves</strong>
        </div>
        <div className="parents-challenge-text">
          <h2>Votre rôle est crucial !</h2>
          <p>
            Les établissements scolaires manquent structurellement de ressources pour guider chaque
            adolescent de façon personnalisée.
          </p>
          <p>
            En tant que parent, vous n'êtes pas un professionnel du conseil d'orientation… et c'est
            parfaitement normal ! Mais vous êtes le premier observateur de son potentiel. Nous vous
            formons aux bases pour faire équipe avec lui.
          </p>
        </div>
      </section>

      <section className="parents-section">
        <h2 className="parents-section-title">Programme de la formation</h2>
        <div className="parents-modules-grid">
          {MODULES.map((module) => (
            <div key={module.title} className={`orientation-card parents-module-card ${module.accent || ''}`}>
              <div className="question-icon-badge">
                <i className={`ph ${module.icon}`} aria-hidden="true" />
              </div>
              <h3>{module.title}</h3>
              <p>{module.summary}</p>
              <ul>
                {module.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="parents-section">
        <h2 className="parents-section-title">Votre plan d'action</h2>
        <div className="parents-plan-list">
          {ACTION_PLAN.map((step, index) => (
            <div key={step.title} className="parents-plan-row">
              <span className="parents-plan-icon"><i className={`ph ${step.icon}`} aria-hidden="true" /></span>
              <div>
                <h3>{index + 1}. {step.title}</h3>
                <p>{step.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="parents-quote-section">
        <p className="parents-quote">
          N'oubliez pas que l'orientation est un marathon, pas un sprint de dernière minute.
          <br />
          Écouter d'abord, outiller ensuite, accompagner toujours.
        </p>
      </section>

      <section className="parents-section" id="inscription">
        <h2 className="parents-section-title">Accéder à la formation</h2>

        {banner && (
          <div className={`parents-banner tone-${banner.tone}`}>{banner.text}</div>
        )}

        {config && config.enabled === false && (
          <div className="parents-banner tone-warning">
            Le paiement n'est pas encore configuré. Merci de réessayer plus tard.
          </div>
        )}

        {paid ? (
          <div className="orientation-card parents-confirmation">
            <span className="orientation-pill">Inscription confirmée</span>
            <h3>Merci, votre accès à la formation est validé !</h3>
            <p>Choisissez votre créneau pour la session en direct :</p>
            <div
              className="calendly-inline-widget"
              data-url={CALENDLY_URL}
              style={{ minWidth: 320, height: 700, width: '100%' }}
            />
          </div>
        ) : (
          <form className="orientation-card identity-card parents-pricing-card" onSubmit={handleSubmit}>
            <span className="orientation-pill">Formation Zélia — Parents</span>
            {formattedPrice && <span className="parents-price-value">{formattedPrice}</span>}
            <p className="parents-price-note">Paiement sécurisé par carte bancaire via Stripe. Accès immédiat après paiement.</p>
            <div className="identity-form-grid">
              <label>
                <span>Prénom</span>
                <input type="text" value={form.firstName} onChange={updateField('firstName')} autoComplete="given-name" required />
              </label>
              <label>
                <span>Nom</span>
                <input type="text" value={form.lastName} onChange={updateField('lastName')} autoComplete="family-name" required />
              </label>
              <label>
                <span>Email</span>
                <input type="email" value={form.email} onChange={updateField('email')} autoComplete="email" required />
              </label>
            </div>
            {formError && <p className="identity-error">{formError}</p>}
            <button type="submit" className="primary-action identity-submit" disabled={submitting}>
              {submitting ? 'Redirection vers le paiement…' : "Je m'inscris et je paie"}
            </button>
          </form>
        )}
      </section>

      <footer className="parents-footer">
        <p>Une question sur la formation ?</p>
        <p>
          <strong>Nicolas Wiegele</strong> — Dirigeant de Zélia —{' '}
          <a href="mailto:nicolas.wiegele@zelia.io">nicolas.wiegele@zelia.io</a>
        </p>
      </footer>
    </main>
  )
}
