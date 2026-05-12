import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { buildProfileFromSupabaseUser, persistAuthSessionAndOnboarding, resolveAuthAfter } from '../lib/authFlow'

export default function AuthCallback() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [message, setMessage] = useState('Connexion en cours')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const after = resolveAuthAfter(params.get('after') || '')
        const code = params.get('code')
        const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) throw exchangeError
        } else if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })
          if (sessionError) throw sessionError
        }

        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        const user = data?.session?.user
        if (!user) throw new Error('Session Supabase introuvable')

        if (active) setMessage('Préparation de ton espace')
        const target = await persistAuthSessionAndOnboarding({
          after,
          profileData: buildProfileFromSupabaseUser(user)
        })

        if (active) navigate(target, { replace: true })
      } catch (callbackError) {
        console.error('Auth callback error:', callbackError)
        if (!active) return
        setError(callbackError?.message || 'Connexion impossible')
      }
    })()
    return () => { active = false }
  }, [location.hash, navigate, params])

  return (
    <main className="min-h-screen bg-[#fffbf7] text-black grid place-items-center px-4">
      <div className="w-full max-w-md bg-white border border-line rounded-lg p-6 text-center shadow-card">
        <img src="/static/images/logo-dark.png" alt="Zelia" className="h-8 mx-auto mb-5" />
        {error ? (
          <>
            <h1 className="text-2xl font-semibold mb-2">Connexion interrompue</h1>
            <p className="text-sm text-text-secondary mb-5">{error}</p>
            <button onClick={() => navigate('/login', { replace: true })} className="h-11 px-5 rounded-lg bg-black text-white font-bold">
              Retour à la connexion
            </button>
          </>
        ) : (
          <>
            <div className="w-10 h-10 rounded-full border-2 border-black border-t-transparent animate-spin mx-auto mb-5" />
            <h1 className="text-2xl font-semibold mb-2">{message}</h1>
            <p className="text-sm text-text-secondary">On récupère ton compte Supabase et tes réponses.</p>
          </>
        )}
      </div>
    </main>
  )
}
