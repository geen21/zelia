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
    'Des pistes qui collent vraiment à ce que tu aimes',
    'Des formations à garder sous la main pour comparer',
    'Des écoles repérées quand elles peuvent te correspondre'
  ]

  return (
    <main className="zelia-home">
      <SEO
        title="Zelia - Trouve ton orientation scolaire et professionnelle"
        description="Zélia aide les étudiants à mieux se connaître, comparer des métiers, trouver des formations et garder une sélection personnalisée."
        url="https://zelia.io/"
      />
      <style>{homeStyles}</style>

      <section className="zelia-home-hero">
        <nav className="zelia-home-nav" aria-label="Navigation principale">
          <Link to="/" className="zelia-home-logo" aria-label="Accueil Zelia">
            <img src="/static/images/logo-dark.png" alt="Zelia" />
          </Link>
          <div className="zelia-home-nav-actions">
            <Link to="/blog">Blog</Link>
            <Link to="/login">Connexion</Link>
            <Link to="/orientation" className="nav-cta">Commencer</Link>
          </div>
        </nav>

        <img className="zelia-home-avatar" src={avatarUrl} alt="Avatar Zelia" loading="eager" />

        <div className="zelia-home-hero-content">
          <p className="zelia-home-kicker">Orientation scolaire et métiers</p>
          <h1>Zélia t'aide à trouver des formations et métiers qui te ressemblent.</h1>
          <p className="zelia-home-lead">
            Tu réponds à 40 questions, tu choisis ton avatar, puis Zélia analyse tes forces et cherche des pistes concrètes à valider.
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
  border-radius: 8px;
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
  padding: 0 22px;
  border-radius: 8px;
  border: 1px solid #000;
  background: #000;
  color: #fff;
  font-weight: 600;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
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
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  border-radius: 999px;
  background: #c1ff72;
  color: #000;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 600;
}
.zelia-home-proof span:nth-child(2) { background: #f68fff; color: #000; }
.zelia-home-proof span:nth-child(3) { background: #fff; border: 1px solid rgba(0,0,0,.1); }
.zelia-home h2 { margin: 0; font-size: 30px; line-height: 1.12; font-weight: 650; }
@media (max-width: 900px) {
  .zelia-home-hero { min-height: auto; align-items: flex-start; padding-top: 82px; padding-bottom: 46px; }
  .zelia-home-hero-content { padding-top: 0; }
  .zelia-home h1 { font-size: 40px; line-height: 1.08; }
  .zelia-home-lead { font-size: 17px; max-width: 480px; }
  .zelia-home-avatar { opacity: .24; width: 520px; min-width: 520px; right: -170px; }
}
@media (max-width: 560px) {
  .zelia-home-nav { align-items: flex-start; }
  .zelia-home-nav-actions a:not(.nav-cta) { display: none; }
  .zelia-home h1 { font-size: 34px; }
  .zelia-home h2 { font-size: 26px; }
  .zelia-home-actions { flex-direction: column; }
  .zelia-home-actions button { width: 100%; }
  .zelia-home-proof span { width: 100%; justify-content: center; }
}
`
