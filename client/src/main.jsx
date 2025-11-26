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
import Niveau2 from './pages/niveau/Niveau2.jsx'
import Niveau3 from './pages/niveau/Niveau3.jsx'
import Niveau4 from './pages/niveau/Niveau4.jsx'
import Niveau5 from './pages/niveau/Niveau5.jsx'
import EmailConfirmation from './pages/EmailConfirmation.jsx'
import Chat from './pages/Chat.jsx'
import BlogIndex from './pages/blog/BlogIndex.jsx'
import BlogExploreMetiers from './pages/blog/BlogExploreMetiers.jsx'
import BlogQuestionnaire from './pages/blog/BlogQuestionnaire.jsx'
import BlogParents from './pages/blog/BlogParents.jsx'
import TagManager from 'react-gtm-module'
import { usePageTracking } from './lib/usePageTracking.js'

const tagManagerArgs = {
    gtmId: 'GTM-TTNGZ2H8'
}

TagManager.initialize(tagManagerArgs)

const dynamicNiveauModules = import.meta.glob([
  './pages/niveau/Niveau[6-9].jsx',
  './pages/niveau/Niveau[1-4][0-9].jsx',
  './pages/niveau/Niveau50.jsx'
])

const dynamicNiveauComponents = Object.entries(dynamicNiveauModules).reduce((acc, [path, loader]) => {
  const match = path.match(/Niveau(\d+)\.jsx$/)
  if (!match) return acc
  const level = Number(match[1])
  if (Number.isNaN(level) || level <= 5) return acc
  acc[level] = lazy(() => loader())
  return acc
}, /** @type {Record<number, React.LazyExoticComponent<React.ComponentType<any>>>} */ ({}))

loadLegacyStyles()

const dynamicNiveauLevels = Object.keys(dynamicNiveauComponents)
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
          <Route path="niveau/1" element={<Niveau1 />} />
          <Route path="niveau/2" element={<Niveau2 />} />
          <Route path="niveau/3" element={<Niveau3 />} />
          <Route path="niveau/4" element={<Niveau4 />} />
          <Route path="niveau/5" element={<Niveau5 />} />
          {dynamicNiveauLevels.map((level) => {
            const Component = dynamicNiveauComponents[level]
            return (
              <Route
                key={level}
                path={`niveau/${level}`}
                element={
                  <Suspense fallback={<div className="p-6 text-center">Chargement du niveau…</div>}>
                    <Component />
                  </Suspense>
                }
              />
            )
          })}
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
