import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FiArrowUpRight, FiBookOpen, FiCalendar, FiCheck, FiClock, FiCompass, FiHelpCircle, FiLock, FiMessageCircle, FiShield, FiTool, FiUsers } from 'react-icons/fi'
import SEO from '../components/SEO.jsx'
import PublicHeader from '../components/PublicHeader.jsx'
import { parentTrainingAPI } from '../lib/api.js'
import { withZeliaUtm } from '../lib/outboundUrl.js'
import { trackSiteEvent } from '../lib/analytics.js'
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
    Icon: FiCompass,
    title: 'Décoder',
    summary: "Comprendre la psychologie, les doutes profonds, les craintes et les envies propres à la génération actuelle d'adolescents au lycée.",
    bullets: [
      'La peur de faire le « mauvais choix » et de s\u2019enfermer.',
      'La sensation de ne pas se connaître eux-mêmes.',
      'La peur de décevoir leurs parents et leurs professeurs.'
    ]
  },
  {
    Icon: FiMessageCircle,
    title: 'Briser la glace',
    summary: 'Instaurer un dialogue sain, constructif et sans tension autour de son avenir, en évitant les écueils classiques du blocage.',
    bullets: [
      'Éviter les interrogatoires, la projection de vos rêves non accomplis et la précipitation.',
      "Privilégier l'écoute active et les questions ouvertes plutôt que les métiers de suite.",
      'Un rituel court : 15 minutes par semaine, pour ne pas en faire un sujet de conflit.'
    ]
  },
  {
    Icon: FiTool,
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
    Icon: FiMessageCircle,
    title: 'Le mur du silence',
    text: 'Dès que vous abordez le sujet « Que veux-tu faire plus tard ? », la discussion se bloque ou finit en dispute.'
  },
  {
    Icon: FiUsers,
    title: 'Le sentiment de désarroi',
    text: "Avec 1 conseiller d'orientation pour 1 500 élèves, vous sentez bien que l'école n'a pas le temps d'offrir un accompagnement sur-mesure."
  },
  {
    Icon: FiHelpCircle,
    title: 'La jungle administrative',
    text: 'Entre les vœux, les sous-vœux et la lettre de motivation, le système Parcoursup vous paraît obscur et anxiogène.'
  }
]

function TrainingCallToAction({ formattedPrice, onClick, children }) {
  return (
    <div className="parents-cta-block">
      <p className="parents-cta-note">{children}</p>
      <button type="button" className="primary-action zelia-button--lime" onClick={onClick}>
        Obtenir mon accès immédiat à la formation{formattedPrice ? ` — ${formattedPrice}` : ''}
        <FiArrowUpRight aria-hidden="true" />
      </button>
      <p className="parents-booking-note">Le choix du créneau d'une heure se fait juste après le règlement.</p>
    </div>
  )
}

function scrollToInscription(behavior = 'smooth') {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // Cancel an interrupted smooth scroll before starting the next anchor navigation.
  window.scrollTo({ top: window.scrollY, behavior: 'instant' })
  document.getElementById('inscription')?.scrollIntoView({ behavior: reducedMotion ? 'instant' : behavior, block: 'start' })
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
      trackSiteEvent('parent_training_checkout_cancelled')
      setBanner({ tone: 'info', text: 'Paiement annulé. Vous pouvez réessayer quand vous le souhaitez.' })
      return
    }

    if (!sessionId || verifyingRef.current) return
    verifyingRef.current = true
    setBanner({ tone: 'info', text: 'Vérification de votre paiement en cours…' })

    ;(async () => {
      try {
        const { data } = await parentTrainingAPI.verifySession(sessionId)
        if (data?.paid) {
          if (sessionStorage.getItem('parent_training_tracked_payment') !== sessionId) {
            trackSiteEvent('parent_training_payment_confirmed')
            sessionStorage.setItem('parent_training_tracked_payment', sessionId)
          }
          setPaid(true)
          setBanner({ tone: 'success', text: 'Paiement confirmé ! Bienvenue dans la formation Zélia.' })
        } else {
          trackSiteEvent('parent_training_payment_pending')
          setBanner({ tone: 'warning', text: 'Paiement en attente ou incomplet. Si le débit apparaît sur votre compte, contactez-nous.' })
        }
      } catch (err) {
        trackSiteEvent('parent_training_payment_failed', { error_stage: 'verify' })
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

  useEffect(() => {
    if (!paid) return
    let booked = false
    const onMessage = (event) => {
      if (event.origin !== 'https://calendly.com' || event.data?.event !== 'calendly.event_scheduled' || booked) return
      booked = true
      trackSiteEvent('parent_training_booking_completed')
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
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

  useEffect(() => {
    if (!banner) return
    let cancelled = false
    // Payment status, price and fonts can all change the anchor's position.
    document.fonts.ready.then(() => {
      if (!cancelled) scrollToInscription('instant')
    })
    return () => { cancelled = true }
  }, [banner, paid, formattedPrice])

  const updateField = (field) => (event) => {
    const { value } = event.target
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return
    setFormError('')

    const firstName = form.firstName.trim()
    const lastName = form.lastName.trim()
    const email = form.email.trim()

    if (!firstName || !lastName || !email) {
      setFormError('Merci de renseigner votre prénom, nom et email.')
      return
    }

    setSubmitting(true)
    trackSiteEvent('parent_training_checkout_started')
    try {
      const { data } = await parentTrainingAPI.checkout({ firstName, lastName, email })
      if (data?.url) {
        trackSiteEvent('parent_training_checkout_redirected')
        window.location.href = withZeliaUtm(data.url)
        return
      }
      throw new Error('Missing checkout url')
    } catch (err) {
      trackSiteEvent('parent_training_checkout_failed', { error_stage: 'checkout' })
      console.error('Parent training checkout failed', err)
      const message = err.response?.data?.error || 'Impossible de lancer le paiement. Merci de réessayer dans quelques instants.'
      setFormError(message)
      setSubmitting(false)
    }
  }

  const openRegistration = () => {
    trackSiteEvent('parent_training_cta_clicked')
    scrollToInscription()
  }

  return (
    <main className="parents-landing">
      <SEO
        title="Retrouvez le dialogue avec votre enfant | Formation parents Zélia"
        description="Une formation d'une heure pour les parents de lycéens : devenez un allié orientation, retrouvez le dialogue et accompagnez votre ado sans conflit. Satisfait ou remboursé sous 14 jours."
        url="https://zelia.io/parents"
        type="website"
      />

      <a className="parents-skip" href="#parents-content">Aller au contenu</a>
      <PublicHeader />

      <section className="parents-hero" id="parents-content" tabIndex={-1} aria-labelledby="parents-title">
        <div className="parents-hero-copy">
          <span className="parents-eyebrow"><FiUsers aria-hidden="true" /> Formation pour les parents</span>
          <h1 id="parents-title">
            La méthode pas-à-pas pour <span className="parents-title-mark">les parents de lycéens</span>{' '}
            <span className="parents-hero-levels">(Seconde, Première, Terminale)</span>
          </h1>
          <p className="parents-hero-lead">Devenez un allié orientation pour votre enfant et retrouvez le dialogue avec lui.</p>
          <ul className="parents-proof" aria-label="La formation en bref">
            <li><FiClock aria-hidden="true" /> 1 heure en direct</li>
            <li><FiCalendar aria-hidden="true" /> Selon vos disponibilités</li>
          </ul>
          <div className="parents-hero-actions">
            <button type="button" className="primary-action zelia-button--lime parents-hero-cta" onClick={openRegistration}>
              Je m'inscris <FiArrowUpRight aria-hidden="true" />
            </button>
            <a className="secondary-action" href="#programme">Découvrir le programme</a>
          </div>
          <span className="parents-hero-guarantee"><FiShield aria-hidden="true" /> 100% satisfait ou remboursé sous 14 jours.</span>
        </div>
        <div className="parents-hero-media">
          <div className="parents-video-heading"><FiBookOpen aria-hidden="true" /> La formation, en quelques mots</div>
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
          <div className="parents-video-caption">
            <span>Moins de pression.<br /><strong>Plus de dialogue.</strong></span>
            <FiMessageCircle aria-hidden="true" />
          </div>
        </div>
      </section>

      <nav className="parents-section parents-page-nav" aria-label="Sur cette page">
        <a href="#constat">Le constat</a>
        <a href="#programme">Le programme</a>
        <a href="#plan-action">Votre plan d'action</a>
        <a href="#inscription">L'inscription <FiArrowUpRight aria-hidden="true" /></a>
      </nav>

      <section className="parents-section parents-introduction" aria-labelledby="parents-intro-title">
        <div>
          <span className="parents-eyebrow">L'accompagnement Zélia</span>
          <h2 className="parents-section-title" id="parents-intro-title">Une heure pour mieux l'accompagner.</h2>
          <p className="parents-section-copy">
            Nous avons sondé et échangé avec de jeunes élèves des générations Z et Alpha.
            Aujourd'hui, nous vous partageons la méthode simple et les outils pour guider votre ado
            avec assurance, sans conflit et sans devenir un expert du système scolaire.
          </p>
        </div>
        <div className="zelia-card parents-offer">
          <TrainingCallToAction formattedPrice={formattedPrice} onClick={openRegistration}>
            Un bilan d'orientation privé classique coûte entre 300 et 800 €. Nous vous proposons
            une formation d'une heure, selon vos disponibilités, pour avoir les bonnes clefs de lecture
            et pouvoir l'accompagner au mieux. 100% satisfait ou remboursé sous 14 jours.
          </TrainingCallToAction>
        </div>
      </section>

      <section className="parents-diagnosis" id="constat" aria-labelledby="parents-constat-title">
        <div className="parents-section">
          <div className="parents-section-heading">
            <span className="parents-eyebrow">Comprendre avant d'agir</span>
            <h2 className="parents-section-title" id="parents-constat-title">Le vrai constat</h2>
          </div>
          <div className="parents-stats-grid">
            {STATS.map((stat) => (
              <div key={stat.value} className={`parents-stat-card tone-${stat.tone}`}>
                <span className="parents-stat-value">{stat.value}</span>
                <p>{stat.text}</p>
              </div>
            ))}
          </div>
          <p className="parents-stat-note">Sauf qu'à l'âge de faire ces choix, on ne se connaît pas encore vraiment…</p>
          <h3 className="parents-situations-title">Reconnaissez-vous votre quotidien de parent dans l'une de ces situations ?</h3>
          <div className="parents-situations-grid">
            {SITUATIONS.map(({ Icon, ...situation }) => (
              <div key={situation.title} className="zelia-card parents-situation-card">
                <Icon className="parents-card-icon" aria-hidden="true" />
                <h4>{situation.title}</h4>
                <p>{situation.text}</p>
              </div>
            ))}
          </div>
          <div className="parents-reassurance">
            <div>
              <span className="parents-eyebrow">Vous n'avez pas à tout savoir.</span>
              <p className="parents-section-copy">
                Ce n'est pas de votre faute. Vous n'êtes pas formé à l'orientation. Mais bonne nouvelle :
                vous êtes la personne la mieux placée pour révéler le potentiel de votre enfant.
                Il lui faut juste la bonne méthode.
              </p>
            </div>
            <TrainingCallToAction formattedPrice={formattedPrice} onClick={openRegistration}>
              Une formation d'une heure selon vos disponibilités pour avoir les clefs afin de
              l'accompagner au mieux, 100% satisfait ou remboursé sous 14 jours.
            </TrainingCallToAction>
          </div>
        </div>
      </section>

      <section className="parents-section parents-program" id="programme" aria-labelledby="parents-program-title">
        <div className="parents-section-heading">
          <span className="parents-eyebrow">Trois étapes, une méthode</span>
          <h2 className="parents-section-title" id="parents-program-title">Programme de la formation</h2>
        </div>
        <ol className="parents-modules-grid">
          {MODULES.map(({ Icon, ...module }, index) => (
            <li key={module.title} className="zelia-card parents-module-card">
              <div className="parents-module-top">
                <Icon className="parents-card-icon" aria-hidden="true" />
                <span className="parents-module-number">0{index + 1}</span>
              </div>
              <h3>{module.title}</h3>
              <p>{module.summary}</p>
              <ul>
                {module.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <section className="parents-section parents-outcome" id="plan-action" aria-labelledby="parents-plan-title">
        <div>
          <span className="parents-eyebrow"><FiCheck aria-hidden="true" /> Et après la formation ?</span>
          <h2 className="parents-section-title" id="parents-plan-title">Votre plan d'action</h2>
          <p className="parents-section-copy">
            Vous obtenez un plan d'action clair, une analyse et des méthodes. Vous rejoignez un groupe
            WhatsApp avec d'autres parents, pour échanger sur vos craintes et obtenir des conseils
            pratiques entre pairs.
          </p>
        </div>
        <TrainingCallToAction formattedPrice={formattedPrice} onClick={openRegistration}>
          Vous repartez motivés en sachant quelles actions concrètes mettre en place et où trouver
          les bonnes informations. 100% satisfait ou remboursé sous 14 jours.
        </TrainingCallToAction>
      </section>

      <section className="parents-section parents-registration" id="inscription" aria-labelledby="parents-registration-title">
        <div className="parents-section-heading">
          <span className="parents-eyebrow">On passe à l'action ?</span>
          <h2 className="parents-section-title" id="parents-registration-title">Accéder à la formation</h2>
        </div>

        {banner && (
          <div className={`parents-banner tone-${banner.tone}`} role={banner.tone === 'error' ? 'alert' : 'status'}>{banner.text}</div>
        )}

        {config && config.enabled === false && (
          <div className="parents-banner tone-warning">
            Le paiement n'est pas encore configuré. Merci de réessayer plus tard.
          </div>
        )}

        {paid ? (
          <div className="zelia-card parents-confirmation">
            <span className="parents-eyebrow"><FiCheck aria-hidden="true" /> Inscription confirmée</span>
            <h3>Merci, votre accès à la formation est validé !</h3>
            <p>Choisissez votre créneau d'une heure pour la session en direct :</p>
            <div
              className="calendly-inline-widget"
              data-url={CALENDLY_URL}
              style={{ minWidth: 0, height: 700, width: '100%' }}
            />
          </div>
        ) : (
          <div className="parents-registration-grid">
            <div className="parents-registration-details">
              <h3>Votre prochaine étape, en toute simplicité.</h3>
              <ol className="parents-registration-steps">
                <li><span>01</span><div><strong>Inscrivez-vous</strong><p>Renseignez vos coordonnées et réglez votre formation par carte bancaire.</p></div></li>
                <li><span>02</span><div><strong>Choisissez votre créneau</strong><p>Après le règlement, réservez votre session d'une heure selon vos disponibilités.</p></div></li>
                <li><span>03</span><div><strong>Avancez avec les bons outils</strong><p>Une méthode, un plan d'action et un groupe WhatsApp pour continuer à échanger.</p></div></li>
              </ol>
              <div className="parents-registration-guarantee"><FiShield aria-hidden="true" /><span>100% satisfait ou remboursé sous 14 jours.</span></div>
            </div>
            <form className="zelia-card parents-pricing-card" onSubmit={handleSubmit}>
              <div className="parents-price-heading">
                <span className="parents-eyebrow">Formation Zélia — Parents</span>
                {formattedPrice && <span className="parents-price-value">{formattedPrice}</span>}
                <p>Une heure en direct, selon vos disponibilités.</p>
              </div>
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
              {formError && <p className="identity-error" role="alert">{formError}</p>}
              <button type="submit" className="primary-action zelia-button--lime identity-submit" disabled={submitting}>
                {submitting ? 'Redirection vers le paiement…' : "Je m'inscris et je paie"}
                <FiArrowUpRight aria-hidden="true" />
              </button>
              <p className="parents-price-note"><FiLock aria-hidden="true" /> Paiement sécurisé par carte bancaire via Stripe. Accès immédiat après paiement.</p>
              <p className="parents-price-note">Le choix du créneau d'une heure se fait juste après le règlement.</p>
            </form>
          </div>
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
