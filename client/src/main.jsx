import React, { Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import './landing.css'
import './admin.css'
import { loadLegacyStyles } from './lib/loadLegacyStyles.js'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Questionnaire from './pages/Questionnaire.jsx'
import Home from './pages/Home.jsx'
import Results from './pages/Results.jsx'
import Profile from './pages/Profile.jsx'
import Layout from './pages/Layout.jsx'
import FormationsEcoles from './pages/FormationsEcoles.jsx'
import Emplois from './pages/Emplois.jsx'
import MentionsLegales from './pages/MentionsLegales.jsx'
import ConditionsConfidentialite from './pages/ConditionsConfidentialite.jsx'
import Lettre from './pages/Lettre.jsx'
import AuthCallback from './pages/AuthCallback.jsx'
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
import { TOOLBOX_ITEMS } from './lib/levelMapping.js'

const tagManagerArgs = {
    gtmId: 'GTM-TTNGZ2H8'
}

TagManager.initialize(tagManagerArgs)

const ConversationalHome = lazy(() => import('./pages/ConversationalHome.jsx'))

// Boîte à outils : les anciens composants restent internes, exposés via des URLs fonctionnelles.
const toolModules = import.meta.glob([
  './pages/niveau/Niveau4.jsx',
  './pages/niveau/Niveau5.jsx',
  './pages/niveau/Niveau17.jsx',
  './pages/niveau/Niveau18.jsx',
  './pages/niveau/Niveau19.jsx',
  './pages/niveau/Niveau24.jsx',
  './pages/niveau/Niveau26.jsx',
  './pages/niveau/Niveau28.jsx',
  './pages/niveau/Niveau29.jsx',
  './pages/niveau/Niveau31.jsx',
  './pages/niveau/Niveau32.jsx',
  './pages/niveau/Niveau33.jsx',
  './pages/niveau/Niveau34.jsx',
  './pages/niveau/Niveau36.jsx',
  './pages/niveau/Niveau37.jsx',
  './pages/niveau/Niveau38.jsx',
  './pages/niveau/Niveau39.jsx'
])

const toolComponents = Object.entries(toolModules).reduce((acc, [path, loader]) => {
  const match = path.match(/Niveau(\d+)\.jsx$/)
  if (!match) return acc
  const level = Number(match[1])
  if (Number.isNaN(level)) return acc
  acc[level] = lazy(() => loader())
  return acc
}, {})

const BoiteAOutils = lazy(() => import('./pages/BoiteAOutils.jsx'))
const OrientationVideos = lazy(() => import('./pages/OrientationVideos.jsx'))
const FormationDetail = lazy(() => import('./pages/FormationDetail.jsx'))
const FormationsDirectory = lazy(() => import('./pages/FormationsDirectory.jsx'))
const FormationPublicPage = lazy(() => import('./pages/FormationPublicPage.jsx'))

loadLegacyStyles()

function toAppChildRoutePath(path) {
  return String(path || '').replace(/^\/app\/?/, '')
}

const toolRouteItems = TOOLBOX_ITEMS
  .filter((tool) => Number.isFinite(tool.componentLevel) && tool.path?.startsWith('/app/outils/'))
  .map((tool) => ({ ...tool, routePath: toAppChildRoutePath(tool.path) }))

const LEGACY_FUNCTIONAL_REDIRECTS = new Map([
  [1, '/app'],
  [3, '/app'],
  [7, '/app/emplois'],
  [10, '/app/results'],
  [11, '/app'],
  [12, '/app/emplois'],
  [15, '/app'],
  [20, '/app/results'],
  [21, '/app/formations'],
  [22, '/app/formations'],
  [23, '/app/ecoles-partenaires'],
  [30, '/app/results'],
  [40, '/app/results'],
  [50, '/app/results']
])

const legacyToolRedirects = TOOLBOX_ITEMS.reduce((redirects, tool) => {
  const levels = Array.isArray(tool.legacyLevels) ? tool.legacyLevels : []
  levels.forEach((level) => {
    const numericLevel = Number(level)
    if (Number.isFinite(numericLevel) && tool.path) {
      redirects.set(numericLevel, tool.path)
    }
  })
  return redirects
}, new Map(LEGACY_FUNCTIONAL_REDIRECTS))

const legacyToolRedirectRoutes = Array.from(legacyToolRedirects.entries()).sort((a, b) => a[0] - b[0])

// Component to handle page tracking (must be inside BrowserRouter)
function PageTracker() {
  usePageTracking()
  return null
}

function LegacyLevelRedirect() {
  const { level } = useParams()
  const target = legacyToolRedirects.get(Number(level)) || '/app'
  return <Navigate to={target} replace />
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
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/avatar" element={<Navigate to="/orientation" replace />} />
        <Route path="/orientation" element={<Questionnaire />} />
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
    <Route path="/formations" element={<Suspense fallback={<div className="p-6 text-center">Chargement des formations…</div>}><FormationsDirectory /></Suspense>} />
    <Route path="/formations/:slug" element={<Suspense fallback={<div className="p-6 text-center">Chargement de la formation…</div>}><FormationPublicPage /></Suspense>} />
        <Route path="/app" element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<Suspense fallback={<div className="p-6 text-center">Chargement de Zélia…</div>}><ConversationalHome /></Suspense>} />
          <Route path="profile" element={<Profile />} />
          <Route path="results" element={<Results />} />
          <Route path="formations" element={<FormationsEcoles />} />
          <Route path="emplois" element={<Emplois />} />
          <Route path="activites" element={<Navigate to="/app" replace />} />
          <Route path="lettre" element={<Lettre />} />
          <Route path="chat" element={<Chat />} />
          <Route path="niveau/:level" element={<LegacyLevelRedirect />} />
          <Route path="outils" element={<Suspense fallback={<div className="p-6 text-center">Chargement…</div>}><BoiteAOutils /></Suspense>} />
          <Route path="outils/videos-orientation" element={<Suspense fallback={<div className="p-6 text-center">Chargement des vidéos…</div>}><OrientationVideos /></Suspense>} />
          {toolRouteItems.map((tool) => {
            const Component = toolComponents[tool.componentLevel]
            if (!Component) return null
            return (
              <Route
                key={`tool-${tool.id}`}
                path={tool.routePath}
                element={<Suspense fallback={<div className="p-6 text-center">Chargement de l'outil…</div>}><Component /></Suspense>}
              />
            )
          })}
          {legacyToolRedirectRoutes.map(([level, path]) => (
            <Route key={`legacy-tool-${level}`} path={`outils/${level}`} element={<Navigate to={path} replace />} />
          ))}
          <Route path="outils/:tool" element={<Navigate to="/app/outils" replace />} />
          <Route path="ecoles-partenaires" element={<FormationsEcoles />} />
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
