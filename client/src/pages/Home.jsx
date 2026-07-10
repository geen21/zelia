import React, { useEffect, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import SEO from '../components/SEO'
import { supabase } from '../lib/supabase'

function buildZeliaAvatarUrl() {
  const params = new URLSearchParams({
    seed: 'zelia',
    size: '560',
    radius: '15'
  })
  return `https://api.dicebear.com/9.x/lorelei/svg?${params.toString()}`
}

export default function Home() {
  const navigate = useNavigate()
  const location = useLocation()
  const avatarUrl = useMemo(() => buildZeliaAvatarUrl(), [])

  useEffect(() => {
    let active = true
    ;(async () => {
      const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''))
      if (hashParams.get('access_token')) {
        navigate(`/auth/callback${location.hash}`, { replace: true })
        return
      }

      const storedToken = localStorage.getItem('supabase_auth_token') || localStorage.getItem('token')
      const { data } = await supabase.auth.getSession().catch(() => ({ data: null }))
      if (!active) return
      if (storedToken || data?.session?.access_token) {
        if (data?.session?.access_token) localStorage.setItem('supabase_auth_token', data.session.access_token)
        navigate('/app/results', { replace: true })
      }
    })()
    return () => { active = false }
  }, [location.hash, navigate])

  const proof = [
    'Ton profil de personnalité en quelques minutes',
    'Des formations qui te correspondent vraiment',
    'Contacte les écoles en un clic'
  ]

  const steps = [
    { icon: 'ph-chat-circle-dots', title: 'Réponds à 20 questions', detail: "Zélia apprend à te connaître à travers un quiz rapide et sans prise de tête." },
    { icon: 'ph-sparkle', title: 'Découvre ton profil', detail: "Une carte dédiée révèle ta personnalité, tes forces et des idées de métiers qui te correspondent." },
    { icon: 'ph-graduation-cap', title: 'Reçois des formations qui matchent', detail: "Des formations chez nos écoles partenaires, sélectionnées selon ton profil et ta ville." },
    { icon: 'ph-paper-plane-tilt', title: 'Contacte les écoles en un clic', detail: "Demande plus d'infos directement depuis l'appli, sans formulaire interminable." }
  ]

  const pillars = [
    { icon: 'ph-seal-percent', title: '100% gratuit pour les élèves', detail: "Le quiz, ton profil et tes pistes de formation ne te coûtent rien." },
    { icon: 'ph-buildings', title: 'De vraies écoles partenaires', detail: "On te propose des formations réelles, pas juste des idées génériques." },
    { icon: 'ph-shield-check', title: 'Tes données, ton choix', detail: "Rien n'est transmis à une école sans que tu aies demandé à être recontacté·e." },
    { icon: 'ph-fingerprint-simple', title: 'Un profil qui te ressemble', detail: "Basé sur tes réponses, pas sur un test générique copié-collé." }
  ]

  const faqs = [
    { q: 'Est-ce que Zélia est vraiment gratuit ?', a: "Oui. Le quiz d'orientation, la découverte de ton profil et les pistes de formation sont 100% gratuits pour les élèves." },
    { q: 'Comment fonctionne le matching avec les écoles ?', a: "À partir de tes réponses et de ta ville, Zélia te propose des formations chez nos écoles partenaires qui correspondent réellement à ton profil." },
    { q: "Qu'est-ce qui se passe quand je clique sur \"Demande d'infos\" ?", a: "L'école reçoit ton profil et te recontacte directement. Rien n'est transmis sans ton accord." },
    { q: 'Je suis un établissement, comment devenir partenaire ?', a: "Rendez-vous sur notre espace écoles pour créer un compte et recevoir les demandes des élèves intéressés." }
  ]

  return (
    <main className="zelia-home">
      <SEO
        title="Zelia - Trouve ton orientation scolaire et professionnelle"
        description="Zélia aide les étudiants à mieux se connaître, découvrir des pistes de formation et de métiers, et garder un profil personnalisé."
        url="https://zelia.io/"
      />
      <style>{homeStyles}</style>

      <section className="zelia-home-hero">
        <nav className="zelia-home-nav" aria-label="Navigation principale">
          <Link to="/" className="zelia-home-logo" aria-label="Accueil Zelia">
            <img src="/static/images/logo-dark.png" alt="Zelia" />
          </Link>
          <div className="zelia-home-nav-actions">
            <Link to="/formations">Formations</Link>
            <Link to="/blog">Blog</Link>
            <Link to="/espace-ecoles">Espace écoles</Link>
            <Link to="/login">Connexion</Link>
            <Link to="/orientation" className="nav-cta">Commencer</Link>
          </div>
        </nav>

        <img className="zelia-home-avatar" src={avatarUrl} alt="Avatar Zelia" loading="eager" />

        <div className="zelia-home-hero-content">
          <p className="zelia-home-kicker">Orientation scolaire et métiers</p>
          <h1>Zélia t'aide à trouver ta formation et ton métier idéal.</h1>
          <p className="zelia-home-lead">
            Réponds à 20 questions, et Zélia te révèle ton profil, te propose des formations qui te correspondent vraiment et te permet de contacter les écoles en un clic.
          </p>
          <div className="zelia-home-actions">
            <button type="button" onClick={() => navigate('/orientation')}>Commencer le parcours</button>
            <button type="button" className="secondary" onClick={() => navigate('/blog')}>Lire les conseils</button>
          </div>
          <div className="zelia-home-proof" aria-label="Points clés Zelia">
            {proof.map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
      </section>

      <section className="zelia-home-steps">
        <h2>Comment ça marche</h2>
        <div className="zelia-home-steps-grid">
          {steps.map((step, index) => (
            <div key={step.title} className="zelia-home-step-card">
              <span className="zelia-home-step-number">{index + 1}</span>
              <i className={`ph ${step.icon}`} aria-hidden="true" />
              <h3>{step.title}</h3>
              <p>{step.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="zelia-home-pillars">
        <h2>Pourquoi Zélia</h2>
        <div className="zelia-home-pillars-grid">
          {pillars.map((pillar) => (
            <div key={pillar.title} className="zelia-home-pillar-card">
              <i className={`ph ${pillar.icon}`} aria-hidden="true" />
              <h3>{pillar.title}</h3>
              <p>{pillar.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="zelia-home-parents-teaser">
        <div className="zelia-home-parents-teaser-inner">
          <i className="ph ph-users-three" aria-hidden="true" />
          <div>
            <p className="zelia-home-kicker">Pour les parents</p>
            <h2>Devenez le meilleur allié orientation de votre enfant</h2>
            <p>Une formation pas-à-pas pour l'accompagner au lycée avec sérénité, sans stress ni conflit.</p>
          </div>
          <Link to="/parents" className="zelia-home-parents-teaser-cta">Découvrir la formation</Link>
        </div>
      </section>

      <section className="zelia-home-schools">
        <div className="zelia-home-schools-inner">
          <div>
            <p className="zelia-home-kicker">Établissements</p>
            <h2>Vous êtes une école ou un centre de formation ?</h2>
            <p>Rejoignez nos écoles partenaires et recevez les demandes des élèves qui s'intéressent à vos formations.</p>
          </div>
          <Link to="/espace-ecoles" className="zelia-home-schools-cta">Devenir partenaire</Link>
        </div>
      </section>

      <section className="zelia-home-faq">
        <h2>Questions fréquentes</h2>
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
        <div className="zelia-home-footer-top">
          <div className="zelia-home-footer-brand">
            <img src="/static/images/logo-dark.png" alt="Zelia" />
            <p>Zélia t'aide à trouver ta formation et ton métier idéal, et te met en relation directe avec les écoles qui te correspondent.</p>
          </div>
          <div className="zelia-home-footer-col">
            <h3>Produit</h3>
            <Link to="/orientation">Commencer le parcours</Link>
            <Link to="/formations">Formations</Link>
            <Link to="/blog">Blog</Link>
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
        <div className="zelia-home-footer-bottom">
          <span>© {new Date().getFullYear()} Zélia. Tous droits réservés.</span>
        </div>
      </footer>

    </main>
  )
}

const homeStyles = `
.zelia-home {
  min-height: 100vh;
  background: #fffbf7;
  color: #000;
  font-family: inherit;
  overflow-x: hidden;
}
.zelia-home-hero {
  position: relative;
  min-height: 88vh;
  display: flex;
  align-items: center;
  padding: 24px clamp(18px, 6vw, 72px) 72px;
  border-bottom: 1px solid rgba(0,0,0,.08);
  overflow: hidden;
}
.zelia-home-nav {
  position: absolute;
  top: 20px;
  left: clamp(18px, 6vw, 72px);
  right: clamp(18px, 6vw, 72px);
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}
.zelia-home-logo img { height: 30px; width: auto; display: block; }
.zelia-home-nav-actions { display: flex; align-items: center; gap: 8px; }
.zelia-home-nav-actions a {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid rgba(0,0,0,.1);
  background: #fff;
  color: #000;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
}
.zelia-home-nav-actions .nav-cta { background: #000; color: #fff; border-color: #000; }
.zelia-home-avatar {
  position: absolute;
  right: clamp(-40px, 4vw, 80px);
  bottom: -34px;
  z-index: 1;
  width: min(48vw, 560px);
  min-width: 360px;
  pointer-events: none;
}
.zelia-home-hero-content {
  position: relative;
  z-index: 2;
  max-width: 760px;
  padding-top: 80px;
}
.zelia-home-kicker {
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0;
  color: #6b7280;
}
.zelia-home h1,
.zelia-home h2,
.zelia-home h3,
.zelia-home p { letter-spacing: 0; }
.zelia-home h1 {
  margin: 0;
  font-size: 52px;
  line-height: 1.04;
  font-weight: 650;
  max-width: 720px;
}
.zelia-home-lead {
  margin: 22px 0 0;
  max-width: 560px;
  font-size: 20px;
  line-height: 1.45;
  color: #374151;
}
.zelia-home-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 30px;
}
.zelia-home-actions button {
  min-height: 52px;
  padding: 0 26px;
  border-radius: 999px;
  border: 1px solid #000;
  background: #000;
  color: #fff;
  font-weight: 700;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform .15s ease;
}
.zelia-home-actions button:hover { transform: translateY(-2px); }
.zelia-home-actions button.secondary {
  background: #fff;
  color: #000;
  border-color: rgba(0,0,0,.12);
}
.zelia-home-proof {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 22px;
}
.zelia-home-proof span {
  display: inline-block;
  color: #000;
  padding: 0;
  font-size: 13px;
  font-weight: 600;
}
.zelia-home-proof span:not(:last-child)::after { content: '·'; margin-left: 8px; color: #6b7280; }
.zelia-home h2 { margin: 0; font-size: 30px; line-height: 1.12; font-weight: 650; }

.zelia-home-steps {
  padding: clamp(48px, 8vw, 88px) clamp(18px, 6vw, 72px);
  max-width: 1180px;
  margin: 0 auto;
}
.zelia-home-steps h2 { text-align: center; margin-bottom: 36px; }
.zelia-home-steps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 18px;
}
.zelia-home-step-card {
  position: relative;
  background: #fff;
  border: 1px solid rgba(0,0,0,.06);
  border-radius: 28px;
  box-shadow: 0 26px 60px -30px rgba(0,0,0,.22), 0 2px 10px rgba(0,0,0,.04);
  padding: 28px 22px;
  display: grid;
  gap: 10px;
}
.zelia-home-step-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 26px;
  right: 26px;
  height: 6px;
  border-radius: 0 0 8px 8px;
  background: #c1ff72;
}
.zelia-home-step-card:nth-child(2)::before { background: #f68fff; }
.zelia-home-step-card:nth-child(3)::before { background: #111827; }
.zelia-home-step-number {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: #111827;
  color: #c1ff72;
  display: inline-grid;
  place-items: center;
  font-size: 13px;
  font-weight: 800;
}
.zelia-home-step-card i { font-size: 30px; color: #f68fff; }
.zelia-home-step-card h3 { margin: 4px 0 0; font-size: 18px; font-weight: 700; }
.zelia-home-step-card p { margin: 0; font-size: 14px; line-height: 1.5; color: #4b5563; }

/* ---------- Pourquoi Zelia (trust pillars) ---------- */
.zelia-home-pillars {
  padding: clamp(40px, 7vw, 72px) clamp(18px, 6vw, 72px);
  max-width: 1180px;
  margin: 0 auto;
}
.zelia-home-pillars h2 { text-align: center; margin-bottom: 32px; }
.zelia-home-pillars-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}
.zelia-home-pillar-card {
  background: #f2fbe4;
  border: 1px solid rgba(193,255,114,.5);
  border-radius: 22px;
  padding: 22px;
  display: grid;
  gap: 8px;
}
.zelia-home-pillar-card:nth-child(2) { background: #fdf1ff; border-color: rgba(246,143,255,.4); }
.zelia-home-pillar-card:nth-child(3) { background: #f3f4f6; border-color: rgba(17,24,39,.1); }
.zelia-home-pillar-card:nth-child(4) { background: #f2fbe4; border-color: rgba(193,255,114,.5); }
.zelia-home-pillar-card i { font-size: 26px; color: #111827; }
.zelia-home-pillar-card h3 { margin: 4px 0 0; font-size: 16px; font-weight: 700; }
.zelia-home-pillar-card p { margin: 0; font-size: 14px; line-height: 1.5; color: #4b5563; }

/* ---------- Formation parents teaser ---------- */
.zelia-home-parents-teaser {
  padding: 0 clamp(18px, 6vw, 72px);
  max-width: 1180px;
  margin: 0 auto;
}
.zelia-home-parents-teaser-inner {
  background: #f68fff;
  border-radius: 24px;
  padding: clamp(20px, 4vw, 30px) clamp(24px, 5vw, 36px);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
}
.zelia-home-parents-teaser-inner i { flex: 0 0 auto; font-size: 34px; color: #111827; }
.zelia-home-parents-teaser-inner > div { flex: 1 1 320px; }
.zelia-home-parents-teaser-inner .zelia-home-kicker { margin: 0 0 4px; color: #111827; opacity: .7; }
.zelia-home-parents-teaser-inner h2 { margin: 0; font-size: 20px; }
.zelia-home-parents-teaser-inner p { margin: 6px 0 0; font-size: 14px; line-height: 1.5; color: #111827; max-width: 520px; }
.zelia-home-parents-teaser-cta {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 24px;
  border-radius: 999px;
  background: #111827;
  color: #fff;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

/* ---------- Ecole partenaire teaser ---------- */
.zelia-home-schools {
  padding: clamp(32px, 6vw, 56px) clamp(18px, 6vw, 72px);
  max-width: 1180px;
  margin: 0 auto;
}
.zelia-home-schools-inner {
  background: #111827;
  color: #fff;
  border-radius: 28px;
  padding: clamp(28px, 5vw, 44px);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}
.zelia-home-schools-inner .zelia-home-kicker { color: #c1ff72; }
.zelia-home-schools-inner h2 { color: #fff; max-width: 480px; }
.zelia-home-schools-inner p { margin: 10px 0 0; max-width: 480px; color: #d1d5db; font-size: 15px; line-height: 1.5; }
.zelia-home-schools-cta {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  padding: 0 26px;
  border-radius: 999px;
  background: #c1ff72;
  color: #111827;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

/* ---------- FAQ ---------- */
.zelia-home-faq {
  padding: clamp(40px, 7vw, 72px) clamp(18px, 6vw, 72px);
  max-width: 860px;
  margin: 0 auto;
}
.zelia-home-faq h2 { text-align: center; margin-bottom: 28px; }
.zelia-home-faq-list { display: grid; gap: 10px; }
.zelia-home-faq-item {
  background: #fff;
  border: 1px solid rgba(0,0,0,.08);
  border-radius: 16px;
  padding: 16px 20px;
}
.zelia-home-faq-item summary {
  cursor: pointer;
  font-weight: 700;
  font-size: 15px;
  list-style: none;
}
.zelia-home-faq-item summary::-webkit-details-marker { display: none; }
.zelia-home-faq-item summary::before { content: '+'; display: inline-block; width: 18px; color: #111827; font-weight: 800; }
.zelia-home-faq-item[open] summary::before { content: '−'; }
.zelia-home-faq-item p { margin: 12px 0 0 18px; font-size: 14px; line-height: 1.6; color: #4b5563; }

/* ---------- Footer ---------- */
.zelia-home-footer {
  border-top: 1px solid rgba(0,0,0,.08);
  padding: clamp(32px, 6vw, 56px) clamp(18px, 6vw, 72px) 24px;
}
.zelia-home-footer-top {
  max-width: 1180px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1.6fr 1fr 1fr 1fr;
  gap: 32px;
}
.zelia-home-footer-brand img { height: 26px; width: auto; display: block; margin-bottom: 12px; }
.zelia-home-footer-brand p { margin: 0; max-width: 320px; font-size: 13px; line-height: 1.6; color: #6b7280; }
.zelia-home-footer-col { display: flex; flex-direction: column; gap: 10px; }
.zelia-home-footer-col h3 { margin: 0 0 2px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .02em; color: #9ca3af; }
.zelia-home-footer-col a { font-size: 14px; color: #111827; text-decoration: none; }
.zelia-home-footer-col a:hover { text-decoration: underline; }
.zelia-home-footer-bottom {
  max-width: 1180px;
  margin: 32px auto 0;
  padding-top: 18px;
  border-top: 1px solid rgba(0,0,0,.06);
  font-size: 13px;
  color: #9ca3af;
}

@media (max-width: 900px) {
  .zelia-home-hero { min-height: auto; align-items: flex-start; padding-top: 82px; padding-bottom: 46px; }
  .zelia-home-hero-content { padding-top: 0; }
  .zelia-home h1 { font-size: 40px; line-height: 1.08; }
  .zelia-home-lead { font-size: 17px; max-width: 480px; }
  .zelia-home-avatar { opacity: .24; width: 520px; min-width: 520px; right: -170px; }
  .zelia-home-footer-top { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 560px) {
  .zelia-home-nav { align-items: center; flex-wrap: wrap; }
  .zelia-home-nav-actions {
    order: 3;
    width: 100%;
    overflow-x: auto;
    justify-content: flex-start;
    padding-bottom: 4px;
    scrollbar-width: none;
  }
  .zelia-home-nav-actions::-webkit-scrollbar { display: none; }
  .zelia-home-nav-actions a { flex: 0 0 auto; }
  .zelia-home h1 { font-size: 34px; }
  .zelia-home h2 { font-size: 26px; }
  .zelia-home-actions { flex-direction: column; }
  .zelia-home-actions button { width: 100%; }
  .zelia-home-proof { gap: 4px 8px; }
  .zelia-home-proof span { width: auto; }
  .zelia-home-steps { padding: 40px 18px; }
  .zelia-home-parents-teaser-inner { flex-direction: column; align-items: flex-start; }
  .zelia-home-parents-teaser-cta { width: 100%; }
  .zelia-home-schools-inner { flex-direction: column; align-items: flex-start; }
  .zelia-home-schools-cta { width: 100%; }
  .zelia-home-footer-top { grid-template-columns: 1fr; gap: 24px; }
}
`
