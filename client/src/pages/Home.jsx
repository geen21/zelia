import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { blogPosts } from './blog/posts'

// Simple typewriter for a single message
function useTypewriter(message, durationMs) {
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)
  const rafRef = useRef(0)

  useEffect(() => {
    setText('')
    setDone(false)
    if (!message) return
    const total = Math.max(1, Math.floor(durationMs / 30))
    let i = 0
    const step = () => {
      i++
      const n = Math.min(message.length, Math.floor((i / total) * message.length))
      setText(message.slice(0, n))
      if (n >= message.length) {
        setDone(true)
        return
      }
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [message, durationMs])

  const skip = useCallback(() => {
    setText(message || '')
    setDone(true)
  }, [message])

  return { text, done, skip }
}

function buildAvatarUrl(seed = 'zelia') {
  const p = new URLSearchParams({ seed: String(seed), size: '320', radius: '15' })
  return `https://api.dicebear.com/9.x/lorelei/svg?${p.toString()}`
}

function modifyDicebearUrl(urlStr, params = {}) {
  try {
    const u = new URL(urlStr)
    Object.entries(params).forEach(([k, v]) => {
      if (v === null) {
        u.searchParams.delete(k)
      } else if (Array.isArray(v)) {
        u.searchParams.delete(k)
        v.forEach((vv) => u.searchParams.append(k, vv))
      } else {
        u.searchParams.set(k, String(v))
      }
    })
    return u.toString()
  } catch {
    return urlStr
  }
}

export default function Home() {
  const navigate = useNavigate()
  const location = useLocation()
  const heroRef = useRef(null)
  const motionOff = useRef(false)

  // Auth and email-confirmation redirects (preserved)
  useEffect(() => {
    const token = localStorage.getItem('token') || localStorage.getItem('supabase_auth_token')
    if (token) {
      navigate('/app', { replace: true })
      return
    }
    const hashParams = new URLSearchParams(location.hash.substring(1))
    const accessToken = hashParams.get('access_token')
    const type = hashParams.get('type')
    if (type === 'signup' && accessToken) {
      navigate(`/email-confirmation#${location.hash.substring(1)}`, { replace: true })
    }
  }, [location, navigate])

  // Parallax mouse controller
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    motionOff.current = prefersReduced
    const el = heroRef.current
    if (!el || prefersReduced) return

    let raf = 0
    const target = { x: 0, y: 0 }
    const current = { x: 0, y: 0 }

    const onMove = (e) => {
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      target.x = (e.clientX - cx) / rect.width
      target.y = (e.clientY - cy) / rect.height
    }

    const tick = () => {
      current.x += (target.x - current.x) * 0.06
      current.y += (target.y - current.y) * 0.06
      const layers = el.querySelectorAll('[data-depth]')
      layers.forEach((layer) => {
        const d = parseFloat(layer.getAttribute('data-depth') || '0')
        const tx = current.x * d * 30
        const ty = current.y * d * 30
        layer.style.transform = `translate3d(${tx}px, ${ty}px, 0)`
      })
      raf = requestAnimationFrame(tick)
    }

    el.addEventListener('mousemove', onMove)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('mousemove', onMove)
    }
  }, [])

  // Intro dialogue inspired by Niveau1
  const messages = useMemo(() => ([
    { text: "Salut, je suis Zélia.", durationMs: 1200 },
    { text: "On va explorer tes intérêts et tes forces pour t'éclairer sur des métiers et des études.", durationMs: 3800 },
    { text: "Tu es prêt ? C'est simple et ça ne prend que quelques minutes.", durationMs: 2600 },
  ]), [])
  const [idx, setIdx] = useState(0)
  const current = messages[idx] || { text: '', durationMs: 1000 }
  const { text: typed, done, skip } = useTypewriter(current.text, current.durationMs)
  const showNext = done && idx < messages.length - 1
  const finished = done && idx === messages.length - 1

  const onNext = () => setIdx((i) => Math.min(i + 1, messages.length - 1))
  const startTest = () => navigate('/avatar')

  // Mouth animation: toggle while typing using DiceBear 'mouth' parameter
  const [mouthAlt, setMouthAlt] = useState(false)
  const speaking = !done
  useEffect(() => {
    if (!speaking) return
    const id = setInterval(() => setMouthAlt((m) => !m), 280)
    return () => clearInterval(id)
  }, [speaking])
  const displayedAvatarUrl = useMemo(() => {
    const base = buildAvatarUrl('zelia')
    if (speaking) {
      // Toggle between two mouth variants for a talking effect (DiceBear lorelei)
      return modifyDicebearUrl(base, { mouth: mouthAlt ? 'happy05' : 'happy08' })
    }
    return modifyDicebearUrl(base, { mouth: 'happy05' })
  }, [speaking, mouthAlt])

  // Simple scroll reveal for below sections
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('.reveal'))
    if (!els.length) return
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      els.forEach((n) => n.classList.add('show'))
      return
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('show')
      })
    }, { threshold: 0.15 })
    els.forEach((n) => io.observe(n))
    return () => io.disconnect()
  }, [])

  const featuredPosts = useMemo(() => blogPosts.slice(0, 3), [])

  return (
    <div className="aximo-all-section landing-lock" style={{ background: '#fffbf7', color: '#000' }}>
      {/* Full-screen parallax scene with overlay nav */}
      <section className="landing-hero parallax-hero fullscreen" ref={heroRef}>
        {/* Background parallax layers */}
        <div className="parallax-scene" aria-hidden="true">
          <div className="layer layer-sky" data-depth="0.05" />
          <div className="layer layer-hill-1" data-depth="0.18" />
          <div className="layer layer-hill-2" data-depth="0.26" />
          <div className="layer layer-dots" data-depth="0.35" />
        </div>

        {/* Modern top navigation */}
        <nav className="hero-overlay-nav modern-nav">
          <div className="container">
            <div className="nav-content">
              <Link to="/" className="brand-logo" aria-label="Accueil">
                <img src="/assets/images/logo-dark.png" alt="Zélia" className="logo-image" />
              </Link>
              <div className="nav-actions">
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

        <div className="landing-legal-links" aria-label="Liens légaux">
          <Link to="/legal/mentions-legales" className="landing-legal-link" aria-label="Mentions légales">
            <i className="ph ph-identification-card" aria-hidden="true"></i>
            <span className="sr-only">Mentions légales</span>
          </Link>
          <Link to="/legal/conditions" className="landing-legal-link" aria-label="CGU et politique de confidentialité">
            <i className="ph ph-shield-check" aria-hidden="true"></i>
            <span className="sr-only">CGU et politique de confidentialité</span>
          </Link>
        </div>

        {/* Modern two-column hero layout */}
        <div className="container position-relative hero-center" style={{ zIndex: 2 }}>
          <div className="row align-items-center justify-content-between g-5 hero-two-col">
            {/* Left: Interactive chat experience */}
            <div className="col-lg-6">
              <div className="chat-section reveal">
                <div className="chat-container">
                  <div className="chat-header">
                    <div className="chat-status">
                      <span className="status-dot active"></span>
                      <span className="status-text">Zélia est en ligne</span>
                    </div>
                  </div>
                  
                  <div className="chat-messages">
                    <div className={`message-bubble ${done ? 'complete' : 'typing'}`}>
                      <div className="message-content">
                        <p className="message-text">
                          {typed}<span className={`typing-cursor ${done ? 'hide' : ''}`}>▍</span>
                        </p>
                      </div>
                      
                      <div className="message-actions">
                        {showNext && (
                          <button className="action-btn secondary" onClick={onNext}>
                            <span>Suivant</span>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        )}
                        {!showNext && !finished && (
                          <button className="action-btn ghost" onClick={skip}>
                            <span>Passer</span>
                          </button>
                        )}
                        {finished && (
                          <button className="action-btn primary" onClick={startTest}>
                            <span>Commencer maintenant</span>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                              <path d="M5 12h14m-7-7l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        )}
                      </div>
                      
                      <div className="conversation-progress">
                        {messages.map((_, i) => (
                          <div key={i} className={`progress-dot ${i <= idx ? 'active' : ''}`} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="avatar-container">
                  <div className={`avatar-frame modern ${done ? 'idle' : 'speaking'}`}>
                    <div className="avatar-image">
                      <img src={displayedAvatarUrl} alt="Avatar Zélia" loading="eager" />
                    </div>
                    <div className="avatar-ring"></div>
                  </div>
                </div>
              </div>
            </div>
            {/* Right: Modern brand presentation */}
            <div className="col-lg-5">
              <div className="brand-section reveal">
                <div className="brand-content">
                  <h1 className="brand-title">
                    zé<span className="accent-text">li</span>a
                  </h1>
                  
                  <div className="brand-tagline">
                    <div className="tagline-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor"/>
                      </svg>
                    </div>
                    <span className="tagline-text">L’ORIENTATION DEVIENT UN JEU D’ENFANT</span>
                  </div>
                  
                  <div className="brand-stats">
                    <div className="stat-item">
                      <div className="stat-number">83%</div>
                      <div className="stat-label">
                        des étudiants se disent inquiets lorsqu’ils pensent à des choix en matière d’orientation
                      </div>
                    </div>
                  </div>
                  <div className="brand-features">
                    <div className="feature-item">
                      <span>+ de 50 modules et jeux interactifs</span>

                    </div>
                    <div className="feature-item">
                      <span>Apprendre à se connaître</span>
                    </div>
                    <div className="feature-item">
                      <span>Trouver sa voie professionnelle </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Levels Section */}
      <section className="levels-section">
        <div className="container mx-auto px-4">
          <div className="levels-content">
            {/* Header intentionally removed per request */}
            
            <div className="levels-grid">
              {[
                { levels: '1-5', title: 'Exploration', emoji: '🌟', description: 'Découvre tes premiers intérêts', current: true },
                { levels: '6-10', title: 'Intérêts & Forces', emoji: '💪', description: 'Identifie tes points forts' },
                { levels: '11-15', title: 'Recherche Métiers', emoji: '🔍', description: 'Explore les métiers qui te correspondent' },
                { levels: '16-20', title: 'Immersions', emoji: '🤝', description: 'Rencontre des professionnels' },
                { levels: '21-25', title: 'Compétences', emoji: '🎯', description: 'Développe tes soft skills' },
                { levels: '26-30', title: 'CV & LM', emoji: '📄', description: 'Crée tes premiers documents' },
                { levels: '31-35', title: 'Parcoursup', emoji: '🎓', description: 'Prépare ton dossier d\'excellence' },
                { levels: '36-40', title: 'Oraux', emoji: '🎤', description: 'Maîtrise tes entretiens' },
                
              ].map((arc, index) => (
                <div 
                  key={index}
                  className={`level-card ${arc.current ? 'current' : ''}`}
                >
                  <div className="level-emoji">{arc.emoji}</div>
                  <div className="level-info">
                    <div className="level-range">Niveaux {arc.levels}</div>
                    <div className="level-title">{arc.title}</div>
                    <div className="level-description">{arc.description}</div>
                  </div>
                  {arc.current && (
                    <div className="current-badge">
                      <span>En cours</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div className="levels-cta">
              <p className="levels-cta-text">
                Prêt(e) à commencer ton parcours d'orientation personnalisé ?
              </p>
              <button 
                onClick={() => navigate('/app/questionnaire')}
                className="levels-cta-btn"
              >
                Débuter le Niveau 1
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="blog-section">
        <div className="container">
          <div className="blog-section__header reveal">
            <span className="blog-section__eyebrow">Blog</span>
            <h2 className="blog-section__title">Les coulisses de l'orientation</h2>
            <p className="blog-section__subtitle">
              Histoires, conseils et tendances pour éclairer chaque étape du parcours d'orientation.
            </p>
            <div className="blog-section__actions">
              <Link to="/blog" className="blog-section__cta">
                Voir tous les articles
              </Link>
            </div>
          </div>

          <div className="blog-section__grid">
            {featuredPosts.map((post) => (
              <article
                key={post.slug}
                className="blog-card reveal"
                style={{ '--accent': post.accent, '--accent-soft': post.accentSoft }}
              >
                <div className="blog-card__meta">
                  <span>{post.category}</span>
                  <span>{post.readingTime}</span>
                </div>
                <h3 className="blog-card__title">{post.title}</h3>
                <p className="blog-card__description">{post.description}</p>
                <div className="blog-card__footer">
                  <span className="blog-card__date">{post.publishedAt}</span>
                  <Link to={`/blog/${post.slug}`} className="blog-card__cta">
                    Lire
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

    </div>
  )
}
