import React, { Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import './landing.css'
import './admin.css'
import { loadLegacyStyles } from './lib/loadLegacyStyles.js'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Questionnaire from './pages/Questionnaire.jsx'
import Home from './pages/Home.jsx'
import AvatarCreate from './pages/AvatarCreate.jsx'
import Results from './pages/Results.jsx'
import Profile from './pages/Profile.jsx'
import Layout from './pages/Layout.jsx'
import Formations from './pages/Formations.jsx'
import Emplois from './pages/Emplois.jsx'
import MentionsLegales from './pages/MentionsLegales.jsx'
import ConditionsConfidentialite from './pages/ConditionsConfidentialite.jsx'
const Activites = lazy(() => import('./pages/Activites.jsx'))
import Lettre from './pages/Lettre.jsx'
import Niveau1 from './pages/niveau/Niveau1.jsx'
import Niveau3 from './pages/niveau/Niveau3.jsx'
import EmailConfirmation from './pages/EmailConfirmation.jsx'
import Chat from './pages/Chat.jsx'
import BlogIndex from './pages/blog/BlogIndex.jsx'
import BlogExploreMetiers from './pages/blog/BlogExploreMetiers.jsx'
import BlogQuestionnaire from './pages/blog/BlogQuestionnaire.jsx'
import BlogParents from './pages/blog/BlogParents.jsx'
import BlogMetierFaitPourSoi from './pages/blog/BlogMetierFaitPourSoi.jsx'
import BlogChoisirSesEtudes from './pages/blog/BlogChoisirSesEtudes.jsx'
import BlogEtudeSalaire from './pages/blog/BlogEtudeSalaire.jsx'
import TagManager from 'react-gtm-module'
import { usePageTracking } from './lib/usePageTracking.js'

const tagManagerArgs = {
    gtmId: 'GTM-TTNGZ2H8'
}

TagManager.initialize(tagManagerArgs)

// New 10-level parcours: lazy-load components mapped from old levels
const Niveau11 = lazy(() => import('./pages/niveau/Niveau11.jsx'))
const Niveau15 = lazy(() => import('./pages/niveau/Niveau15.jsx'))
const Niveau7 = lazy(() => import('./pages/niveau/Niveau7.jsx'))
const Niveau12 = lazy(() => import('./pages/niveau/Niveau12.jsx'))
const Niveau21 = lazy(() => import('./pages/niveau/Niveau21.jsx'))
const Niveau22 = lazy(() => import('./pages/niveau/Niveau22.jsx'))
const Niveau23 = lazy(() => import('./pages/niveau/Niveau23.jsx'))
const NiveauBilanFinal = lazy(() => import('./pages/niveau/NiveauBilanFinal.jsx'))

// Boite à outils: all old level components for standalone tool access
const toolModules = import.meta.glob([
  './pages/niveau/Niveau[2-9].jsx',
  './pages/niveau/Niveau[1-3][0-9].jsx',
  './pages/niveau/Niveau40.jsx'
])

const toolComponents = Object.entries(toolModules).reduce((acc, [path, loader]) => {
  const match = path.match(/Niveau(\d+)\.jsx$/)
  if (!match) return acc
  const level = Number(match[1])
  if (Number.isNaN(level)) return acc
  acc[level] = lazy(() => loader())
  return acc
}, /** @type {Record<number, React.LazyExoticComponent<React.ComponentType<any>>>} */ ({}))

const BoiteAOutils = lazy(() => import('./pages/BoiteAOutils.jsx'))
const EcolesPartenaires = lazy(() => import('./pages/EcolesPartenaires.jsx'))
const FormationDetail = lazy(() => import('./pages/FormationDetail.jsx'))

loadLegacyStyles()

const toolLevels = Object.keys(toolComponents)
  .map((level) => Number(level))
  .sort((a, b) => a - b)

// Component to handle page tracking (must be inside BrowserRouter)
function PageTracker() {
  usePageTracking()
  return null
}

function App() {
  return (
    <HelmetProvider>
      <BrowserRouter>
        <PageTracker />
        <Routes>
    <Route path="/" element={<Home />} />
  <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/email-confirmation" element={<EmailConfirmation />} />
  <Route path="/avatar" element={<AvatarCreate />} />
  <Route path="/questionnaire" element={<Questionnaire />} />
        <Route path="/legal/mentions-legales" element={<MentionsLegales />} />
        <Route path="/legal/conditions" element={<ConditionsConfidentialite />} />
    <Route path="/blog" element={<BlogIndex />} />
    <Route path="/blog/ia-remplacer-futur-metier" element={<BlogExploreMetiers />} />
    <Route path="/blog/pourquoi-ecole-ne-t-aide-pas" element={<BlogQuestionnaire />} />
    <Route path="/blog/accompagner-parents" element={<BlogParents />} />
    <Route path="/blog/metier-bien-fait-pour-soi-mode-emploi" element={<BlogMetierFaitPourSoi />} />
    <Route path="/blog/choisir-ses-etudes-sans-pression" element={<BlogChoisirSesEtudes />} />
    <Route path="/blog/etude-salaire-bon-salaire-ados" element={<BlogEtudeSalaire />} />
        <Route path="/app" element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={
            <Suspense fallback={<div className="p-6 text-center">Chargement des activités…</div>}>
              <Activites />
            </Suspense>
          } />
          <Route path="profile" element={<Profile />} />
          <Route path="results" element={<Results />} />
          <Route path="formations" element={<Formations />} />
          <Route path="emplois" element={<Emplois />} />
          <Route path="activites" element={
            <Suspense fallback={<div className="p-6 text-center">Chargement des activités…</div>}>
              <Activites />
            </Suspense>
          } />
          <Route path="lettre" element={<Lettre />} />
          <Route path="chat" element={<Chat />} />
          {/* New 10-level parcours */}
          <Route path="niveau/1" element={<Niveau1 />} />
          <Route path="niveau/2" element={<Suspense fallback={<div className="p-6 text-center">Chargement du niveau…</div>}><Niveau11 /></Suspense>} />
          <Route path="niveau/3" element={<Niveau3 />} />
          <Route path="niveau/4" element={<Suspense fallback={<div className="p-6 text-center">Chargement du niveau…</div>}><Niveau15 /></Suspense>} />
          <Route path="niveau/5" element={<Suspense fallback={<div className="p-6 text-center">Chargement du niveau…</div>}><Niveau7 /></Suspense>} />
          <Route path="niveau/6" element={<Suspense fallback={<div className="p-6 text-center">Chargement du niveau…</div>}><Niveau12 /></Suspense>} />
          <Route path="niveau/7" element={<Suspense fallback={<div className="p-6 text-center">Chargement du niveau…</div>}><Niveau21 /></Suspense>} />
          <Route path="niveau/8" element={<Suspense fallback={<div className="p-6 text-center">Chargement du niveau…</div>}><Niveau22 /></Suspense>} />
          <Route path="niveau/9" element={<Suspense fallback={<div className="p-6 text-center">Chargement du niveau…</div>}><Niveau23 /></Suspense>} />
          <Route path="niveau/10" element={<Suspense fallback={<div className="p-6 text-center">Chargement du niveau…</div>}><NiveauBilanFinal /></Suspense>} />
          {/* Boite à outils */}
          <Route path="outils" element={<Suspense fallback={<div className="p-6 text-center">Chargement…</div>}><BoiteAOutils /></Suspense>} />
          {toolLevels.map((level) => {
            const Component = toolComponents[level]
            return (
              <Route
                key={`tool-${level}`}
                path={`outils/${level}`}
                element={
                  <Suspense fallback={<div className="p-6 text-center">Chargement de l'outil…</div>}>
                    <Component />
                  </Suspense>
                }
              />
            )
          })}
          {/* Ecoles partenaires */}
          <Route path="ecoles-partenaires" element={<Suspense fallback={<div className="p-6 text-center">Chargement…</div>}><EcolesPartenaires /></Suspense>} />
          <Route path="ecoles-partenaires/:id" element={<Suspense fallback={<div className="p-6 text-center">Chargement…</div>}><FormationDetail /></Suspense>} />
        </Route>
        <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </HelmetProvider>
  )
}

const root = createRoot(document.getElementById('root'))
root.render(<App />)

function RequireAuth({ children }) {
  const token = localStorage.getItem('token') || localStorage.getItem('supabase_auth_token')
  if (!token) return <Navigate to="/login" />
  return children
}
