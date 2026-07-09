import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { schoolPortalSupabase } from '../../lib/schoolPortalSupabase'

export default function SchoolPortalLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(event) {
    event.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)

    try {
      const { error: signInError } = await schoolPortalSupabase.auth.signInWithPassword({ email, password })
      if (signInError) throw signInError
      navigate('/espace-ecoles/leads', { replace: true })
    } catch (loginError) {
      setError(loginError?.message || 'Échec de connexion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#fffbf7] text-black flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <Link to="/espace-ecoles" className="inline-flex mb-8" aria-label="Espace écoles Zelia">
          <img src="/static/images/logo-dark.png" alt="Zelia" className="h-8 w-auto" />
        </Link>

        <div className="bg-white border border-line rounded-lg shadow-card p-6 sm:p-7">
          <div className="mb-6">
            <p className="text-xs uppercase font-medium text-text-secondary tracking-normal mb-2">Espace écoles</p>
            <h1 className="text-2xl font-semibold leading-tight mb-2">Connexion école</h1>
            <p className="text-sm text-text-secondary">Accédez aux leads de votre établissement.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block">
              <span className="block text-xs font-medium text-text-secondary mb-1">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="contact@ecole.fr"
                className="w-full h-11 rounded-lg border border-line px-3 outline-none focus:border-black text-sm sm:text-base"
                autoComplete="email"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-text-secondary mb-1">Mot de passe</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full h-11 rounded-lg border border-line px-3 outline-none focus:border-black text-sm sm:text-base"
                autoComplete="current-password"
              />
            </label>

            {error && <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-lg bg-black text-white font-semibold disabled:opacity-60"
            >
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-text-secondary">
          Pas encore de compte ? <Link to="/espace-ecoles/inscription" className="text-black font-medium underline">Créer un compte école</Link>
        </p>
      </div>
    </main>
  )
}
