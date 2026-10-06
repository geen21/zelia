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

const SITUATIONS = [
  {
    title: 'Le mur du silence',
    text: 'Dès que vous abordez le sujet « Que veux-tu faire plus tard ? », la discussion se bloque ou finit en dispute.'
  },
  {
    title: 'Le sentiment de désarroi',
    text: "Avec 1 conseiller d'orientation pour 1 500 élèves, vous sentez bien que l'école n'a pas le temps d'offrir un accompagnement sur-mesure.",
    accent: 'accent-pink'
  },
  {
    title: 'La jungle administrative',
    text: 'Entre les vœux, les sous-vœux et la lettre de motivation, le système Parcoursup vous paraît obscur et anxiogène.'
  }
]

function TrainingCallToAction({ formattedPrice, onClick, showContact = false, children }) {
  return (
    <div className="parents-cta-block">
      <button type="button" className="primary-action" onClick={onClick}>
        Obtenir mon accès immédiat à la formation{formattedPrice ? ` — ${formattedPrice}` : ''}
      </button>
      <p className="parents-cta-note">{children}</p>
      {showContact && (
        <p className="parents-cta-note">
          Pour toute question sur la formation :{' '}
          <a href="mailto:nicolas.wiegele@zelia.io">nicolas.wiegele@zelia.io</a>
        </p>
      )}
      <p className="parents-booking-note">Le choix du créneau d'une heure se fait juste après le règlement.</p>
    </div>
  )
}

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
        title="Retrouvez le dialogue avec votre enfant | Formation parents Zélia"
        description="Une formation d'une heure pour les parents de lycéens : devenez un allié orientation, retrouvez le dialogue et accompagnez votre ado sans conflit. Satisfait ou remboursé sous 14 jours."
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
        <h1>La méthode pas-à-pas pour les parents de lycéens (Seconde, Première, Terminale)</h1>
        <p>Devenez un allié orientation pour votre enfant et retrouvez le dialogue avec lui.</p>
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

      <section className="parents-section parents-introduction">
        <p className="parents-section-copy">
          Nous avons sondé et échangé avec de jeunes élèves des générations Z et Alpha.
          Aujourd'hui, nous vous partageons la méthode simple et les outils pour guider votre ado
          avec assurance, sans conflit et sans devenir un expert du système scolaire.
        </p>
        <div className="parents-video">
          <iframe
            width="560"
            height="315"
            src="https://www.youtube.com/embed/__cJzw_RYnM?si=pdYeNzrpT6uN0tOO"
            title="Présentation de la formation Zélia pour les parents"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            loading="lazy"
          />
        </div>
        <TrainingCallToAction formattedPrice={formattedPrice} onClick={scrollToInscription}>
          Un bilan d'orientation privé classique coûte entre 300 et 800 €. Nous vous proposons
          une formation d'une heure, selon vos disponibilités, pour avoir les bonnes clefs de lecture
          et pouvoir l'accompagner au mieux. 100% satisfait ou remboursé sous 14 jours.
        </TrainingCallToAction>
      </section>

      <section className="parents-section">
        <h2 className="parents-section-title">Reconnaissez-vous votre quotidien de parent dans l'une de ces situations ?</h2>
        <div className="parents-situations-grid">
          {SITUATIONS.map((situation) => (
            <div key={situation.title} className={`orientation-card parents-module-card ${situation.accent || ''}`}>
              <h3>{situation.title}</h3>
              <p>{situation.text}</p>
            </div>
          ))}
        </div>
        <p className="parents-section-copy parents-reassurance">
          Ce n'est pas de votre faute. Vous n'êtes pas formé à l'orientation. Mais bonne nouvelle :
          vous êtes la personne la mieux placée pour révéler le potentiel de votre enfant.
          Il lui faut juste la bonne méthode.
        </p>
        <TrainingCallToAction formattedPrice={formattedPrice} onClick={scrollToInscription} showContact>
          Une formation d'une heure selon vos disponibilités pour avoir les clefs afin de
          l'accompagner au mieux, 100% satisfait ou remboursé sous 14 jours.
        </TrainingCallToAction>
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
        <p className="parents-section-copy">
          Vous obtenez un plan d'action clair, une analyse et des méthodes. Vous rejoignez un groupe
          WhatsApp avec d'autres parents, pour échanger sur vos craintes et obtenir des conseils
          pratiques entre pairs.
        </p>
        <TrainingCallToAction formattedPrice={formattedPrice} onClick={scrollToInscription} showContact>
          Vous repartez motivés en sachant quelles actions concrètes mettre en place et où trouver
          les bonnes informations. 100% satisfait ou remboursé sous 14 jours.
        </TrainingCallToAction>
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
            <p>Choisissez votre créneau d'une heure pour la session en direct :</p>
            <div
              className="calendly-inline-widget"
              data-url={CALENDLY_URL}
              style={{ minWidth: 0, height: 700, width: '100%' }}
            />
          </div>
        ) : (
          <form className="orientation-card identity-card parents-pricing-card" onSubmit={handleSubmit}>
            <span className="orientation-pill">Formation Zélia — Parents</span>
            {formattedPrice && <span className="parents-price-value">{formattedPrice}</span>}
            <p className="parents-price-note">Paiement sécurisé par carte bancaire via Stripe. Accès immédiat après paiement.</p>
            <p className="parents-price-note">Le choix du créneau d'une heure se fait juste après le règlement.</p>
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
