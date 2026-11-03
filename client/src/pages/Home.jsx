import React, { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FiArrowRight, FiArrowUpRight, FiBookOpen, FiCheck, FiCompass, FiFeather, FiGrid, FiHeart, FiMessageCircle, FiSend, FiShare2, FiShield, FiSmile, FiStar, FiUsers } from 'react-icons/fi'
import SEO from '../components/SEO'
import PublicHeader from '../components/PublicHeader'
import BlogCover from './blog/BlogCover'
import { blogPosts } from './blog/posts'
import './blog/blog-editorial.css'
import './Home.css'

export default function Home() {
  const navigate = useNavigate()
  const location = useLocation()
  const [shareStatus, setShareStatus] = useState('')
  const latestPosts = useMemo(() => (
    [...blogPosts].sort((a, b) => new Date(b.dateIso) - new Date(a.dateIso)).slice(0, 3)
  ), [])

  const shareLanding = async () => {
    const shareData = {
      title: 'Zélia',
      text: 'Découvre Zélia pour mieux te connaître et préparer sereinement ton futur.',
      url: window.location.href
    }

    setShareStatus('')
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share(shareData)
        setShareStatus('Merci de faire découvrir Zélia !')
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`)
        setShareStatus('Lien copié ! À toi de le partager.')
      } else {
        window.prompt('Copie ce lien pour le partager :', shareData.url)
      }
    } catch (shareError) {
      if (shareError?.name !== 'AbortError') {
        console.warn('Landing share failed', shareError)
        setShareStatus("Le partage n'a pas fonctionné. Tu peux copier l'adresse de cette page.")
      }
    }
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''))
      if (hashParams.get('access_token')) {
        navigate(`/auth/callback${location.hash}`, { replace: true })
        return
      }

      const storedToken = localStorage.getItem('supabase_auth_token') || localStorage.getItem('token')
      const { data } = await import('../lib/supabase')
        .then(({ supabase }) => supabase.auth.getSession())
        .catch((error) => {
          console.warn('Landing session check failed', error)
          return { data: null }
        })
      if (!active) return
      if (storedToken || data?.session?.access_token) {
        if (data?.session?.access_token) localStorage.setItem('supabase_auth_token', data.session.access_token)
        navigate('/app', { replace: true })
      }
    })()
    return () => { active = false }
  }, [location.hash, navigate])

  const steps = [
    { Icon: FiMessageCircle, title: 'Réponds à 20 questions', detail: "Zélia apprend à te connaître à travers un quiz rapide et sans prise de tête." },
    { Icon: FiSmile, title: 'Découvre ton profil', detail: 'Une carte dédiée révèle ta personnalité et tes forces.' },
    { Icon: FiCompass, title: 'Reçois des formations qui matchent', detail: 'Des formations chez nos écoles partenaires, sélectionnées selon ton profil et ta ville.' },
    { Icon: FiSend, title: 'Contacte les écoles en un clic', detail: "Demande plus d'infos directement depuis l'appli, sans formulaire interminable." }
  ]

  const pillars = [
    { Icon: FiHeart, title: '100% gratuit pour les élèves', detail: 'Le quiz, ton profil et tes pistes de formation ne te coûtent rien.' },
    { Icon: FiGrid, title: 'De vraies écoles partenaires', detail: 'On te propose des formations réelles, pas juste des idées génériques.' },
    { Icon: FiShield, title: 'Tes données, ton choix', detail: "Rien n'est transmis à une école sans que tu aies demandé à être recontacté·e." },
    { Icon: FiFeather, title: 'Un profil qui te ressemble', detail: 'Basé sur tes réponses, pas sur un test générique copié-collé.' }
  ]

  const faqs = [
    { q: 'Est-ce que Zélia est vraiment gratuit ?', a: "Oui. Le quiz d'orientation, la découverte de ton profil et les pistes de formation sont 100% gratuits pour les élèves." },
    { q: 'Comment fonctionne le matching avec les écoles ?', a: "À partir de tes réponses et de ta ville, Zélia te propose des formations chez nos écoles partenaires qui correspondent réellement à ton profil." },
    { q: "Qu'est-ce qui se passe quand je clique sur \"Demande d'infos\" ?", a: "L'école reçoit ton profil et te recontacte directement. Rien n'est transmis sans ton accord." },
    { q: 'Je suis un établissement, comment devenir partenaire ?', a: "Remplissez le formulaire d'inscription sur notre espace écoles. Notre équipe vous recontactera dans les 2 jours ouvrés." }
  ]

  return (
    <main className="zelia-home">
      <SEO
        title="Zelia - Trouve ton orientation scolaire et professionnelle"
        description="Zélia accompagne les 15-20 ans pour apprendre à mieux se connaître et préparer sereinement leur futur."
        url="https://zelia.io/"
      />
      <a className="zelia-home-skip" href="#landing-content">Aller au contenu</a>
      <PublicHeader />

      <section id="landing-content" className="zelia-home-hero zelia-home-container" tabIndex={-1} aria-labelledby="landing-title">
        <div className="zelia-home-hero-content">
          <h1 id="landing-title">L'expérience ultime des 15-20 ans pour <span>apprendre à se connaître</span> et préparer sereinement son futur.</h1>
          <ul className="zelia-home-proof" aria-label="Les petits plus du quiz">
            {['5 minutes', '20 questions originales', '100% gratuit'].map((item) => (
              <li key={item}><FiCheck aria-hidden="true" />{item}</li>
            ))}
          </ul>
          <p className="zelia-home-lead">
            On découvre ensemble qui tu es et quelles formations sont faites pour toi !
          </p>
          <div className="zelia-home-actions">
            <Link to="/orientation" className="zelia-home-button zelia-home-button--primary">
              Commencer ! <FiArrowUpRight aria-hidden="true" />
            </Link>
            <button type="button" className="zelia-home-button zelia-home-button--share" onClick={shareLanding}>
              <FiShare2 aria-hidden="true" /> Partager à un.e proche
            </button>
          </div>
          <p className="zelia-home-share-status" role="status">{shareStatus}</p>
        </div>
        <div className="zelia-home-avatar-scene">
          <div className="zelia-home-avatar-frame">
            <img
              className="zelia-home-avatar"
              src="https://api.dicebear.com/9.x/lorelei/svg?seed=zelia&size=560&radius=15"
              alt="Avatar Zélia"
              width="560"
              height="560"
              loading="eager"
            />
          </div>
          <FiStar className="zelia-home-avatar-star" aria-hidden="true" />
          <span className="zelia-home-avatar-label" aria-hidden="true">Zélia <FiHeart /></span>
        </div>
      </section>

      <section className="zelia-home-steps zelia-home-section zelia-home-container" aria-labelledby="landing-steps-title">
        <div className="zelia-home-section-heading">
          <h2 id="landing-steps-title">Comment ça marche</h2>
        </div>
        <ol className="zelia-home-steps-grid">
          {steps.map(({ Icon, title, detail }, index) => (
            <li key={title} className="zelia-home-step-card">
              <div className="zelia-home-step-top"><Icon aria-hidden="true" /><span>0{index + 1}</span></div>
              <h3>{title}</h3>
              <p>{detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="zelia-home-pillars" aria-labelledby="landing-pillars-title">
        <div className="zelia-home-pillars-inner zelia-home-section zelia-home-container">
          <div className="zelia-home-section-heading">
            <h2 id="landing-pillars-title">Pourquoi Zélia</h2>
            <Link to="/orientation" className="zelia-home-button zelia-home-button--primary">Commencer ! <FiArrowUpRight aria-hidden="true" /></Link>
          </div>
          <div className="zelia-home-pillars-grid">
            {pillars.map(({ Icon, title, detail }) => (
              <div key={title} className="zelia-home-pillar-card">
                <Icon aria-hidden="true" />
                <h3>{title}</h3>
                <p>{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="zelia-home-blog zelia-home-section zelia-home-container" aria-labelledby="landing-blog-title">
        <div className="zelia-home-blog-heading">
          <div className="zelia-home-section-heading">
            <p className="zelia-home-kicker"><FiBookOpen aria-hidden="true" /> Le blog Zélia</p>
            <h2 id="landing-blog-title">Un peu de lecture,<br />plein de déclics.</h2>
            <p>Des conseils, des idées et l'actu décryptée pour y voir plus clair.</p>
          </div>
          <Link to="/blog" className="zelia-home-text-link">Voir tous les articles <FiArrowRight aria-hidden="true" /></Link>
        </div>
        <div className="zelia-home-blog-grid">
          {latestPosts.map((post) => (
            <article key={post.slug} className="zelia-home-blog-card" style={{ '--accent': post.accent, '--accent-soft': post.accentSoft }}>
              <Link to={`/blog/${post.slug}`} aria-labelledby={`landing-post-${post.slug}`}>
                <BlogCover post={post} />
                <div className="zelia-home-blog-body">
                  <span className="zelia-home-blog-category">{post.category}</span>
                  <h3 id={`landing-post-${post.slug}`}>{post.title}</h3>
                  <p>{post.description}</p>
                  <div className="zelia-home-blog-meta"><span>{post.readingTime} de lecture</span><FiArrowUpRight aria-hidden="true" /></div>
                </div>
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="zelia-home-audiences zelia-home-container" aria-label="Parents et établissements">
        <div className="zelia-home-audience-card zelia-home-audience-card--parents">
          <FiUsers className="zelia-home-audience-icon" aria-hidden="true" />
          <p className="zelia-home-kicker">Pour les parents</p>
          <h2>Devenez le meilleur allié orientation de votre enfant</h2>
          <p>Une formation pas-à-pas pour l'accompagner au lycée avec sérénité, sans stress ni conflit.</p>
          <Link to="/parents" className="zelia-home-text-link">Découvrir la formation <FiArrowUpRight aria-hidden="true" /></Link>
        </div>
        <div className="zelia-home-audience-card zelia-home-audience-card--schools">
          <FiGrid className="zelia-home-audience-icon" aria-hidden="true" />
          <p className="zelia-home-kicker">Établissements</p>
          <h2>Vous êtes une école ou un centre de formation ?</h2>
          <p>Rejoignez nos écoles partenaires et recevez les demandes des élèves qui s'intéressent à vos formations.</p>
          <Link to="/espace-ecoles" className="zelia-home-text-link">Devenir partenaire <FiArrowUpRight aria-hidden="true" /></Link>
        </div>
      </section>

      <section className="zelia-home-faq zelia-home-section zelia-home-container" aria-labelledby="landing-faq-title">
        <div className="zelia-home-section-heading">
          <h2 id="landing-faq-title">Questions fréquentes</h2>
        </div>
        <div className="zelia-home-faq-list">
          {faqs.map((item) => (
            <details key={item.q} className="zelia-home-faq-item">
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="zelia-home-footer">
        <div className="zelia-home-container">
          <div className="zelia-home-footer-top">
            <div className="zelia-home-footer-brand">
              <Link to="/" aria-label="Accueil Zélia"><img src="/static/images/logo-dark.png" alt="Zélia" width="100" height="40" /></Link>
              <p>Zélia t'aide à trouver les formations qui te correspondent et te met en relation directe avec les écoles adaptées à ton projet.</p>
            </div>
            <div className="zelia-home-footer-col">
              <h3>Produit</h3>
              <Link to="/orientation">Commencer le parcours</Link>
              <Link to="/formations">Formations</Link>
              <Link to="/blog">Le blog</Link>
              <Link to="/parents">Espace parents</Link>
            </div>
            <div className="zelia-home-footer-col">
              <h3>Établissements</h3>
              <Link to="/espace-ecoles">Devenir partenaire</Link>
              <Link to="/espace-ecoles/connexion">Connexion école</Link>
            </div>
            <div className="zelia-home-footer-col">
              <h3>Légal</h3>
              <Link to="/legal/mentions-legales">Mentions légales</Link>
              <Link to="/legal/conditions">CGU, CGV &amp; confidentialité</Link>
              <a href="mailto:nicolas.wiegele@zelia.io">Nous contacter</a>
            </div>
          </div>
          <div className="zelia-home-footer-bottom"><span>© {new Date().getFullYear()} Zélia. Tous droits réservés.</span></div>
        </div>
      </footer>
    </main>
  )
}
