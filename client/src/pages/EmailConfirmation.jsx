import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import supabase from '../lib/supabase'

export default function EmailConfirmation() {
  const [status, setStatus] = useState('loading') // loading, success, error
  const [message, setMessage] = useState('')
  const [bypassLoading, setBypassLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const pendingEmail = localStorage.getItem('pending_registration_email') || ''
  const pendingAfter = localStorage.getItem('pending_registration_after') || ''

  const navigateAfterConfirmation = () => {
    const destination = pendingAfter === 'results' ? '/login?after=results' : '/login'
    navigate(destination)
  }

  const bypassEmailConfirmation = async () => {
    if (!pendingEmail || bypassLoading) return

    setBypassLoading(true)
    try {
      await fetch('/api/auth/confirm-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail })
      }).then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload?.error || 'Impossible de confirmer cet email')
        }
      })

      setStatus('success')
      setMessage('Email validé manuellement')
      setTimeout(() => {
        navigateAfterConfirmation()
      }, 1200)
    } catch (error) {
      console.error('Manual email confirmation error:', error)
      setStatus('error')
      setMessage(error?.message || "Impossible de valider l'email manuellement")
    } finally {
      setBypassLoading(false)
    }
  }

  useEffect(() => {
    const handleEmailConfirmation = async () => {
      try {
        // Get the URL hash parameters from the current location
        const hashParams = new URLSearchParams(location.hash.substring(1))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        const type = hashParams.get('type')

        if (type === 'signup' && accessToken) {
          // Set the session with the tokens
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })

          if (error) {
            console.error('Error setting session:', error)
            setStatus('error')
            setMessage('Erreur lors de la validation de l\'email')
            return
          }

          // Store the token in localStorage
          localStorage.setItem('supabase_auth_token', accessToken)
          
          // Show success message
          setStatus('success')
          setMessage('Email validé')
          
          // Redirect after a short delay (without alert)
          setTimeout(() => {
            const redirectToResults = pendingAfter === 'results' || Boolean(localStorage.getItem('answers_cache'))
            localStorage.removeItem('pending_registration_email')
            localStorage.removeItem('pending_registration_after')
            if (redirectToResults) {
              navigate('/app/results')
            } else {
              navigate('/app')
            }
          }, 2000)
        } else {
          setStatus('error')
          setMessage('Lien de confirmation invalide')
        }
      } catch (error) {
        console.error('Email confirmation error:', error)
        setStatus('error')
        setMessage('Erreur lors de la validation de l\'email')
      }
    }

    handleEmailConfirmation()
  }, [location, navigate])

  return (
    <div className="min-h-screen bg-white text-text-primary flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {status === 'loading' && (
          <>
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2">Validation en cours...</h1>
            <p className="text-text-secondary">Nous validons votre email, veuillez patienter.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2 text-green-600">{message}</h1>
            <p className="text-text-secondary">Redirection vers votre tableau de bord...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2 text-red-600">Erreur</h1>
            <p className="text-text-secondary mb-4">{message}</p>
            <button 
              onClick={() => navigate('/login')}
              className="bg-black text-white px-6 py-2 rounded-lg"
            >
              Retour à la connexion
            </button>
          </>
        )}

        {pendingEmail && (
          <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
            <p className="text-sm text-text-secondary">
              Si tu n'as pas reçu l'email, tu peux valider ton compte manuellement.
            </p>
            <button
              type="button"
              onClick={bypassEmailConfirmation}
              disabled={bypassLoading}
              className="mt-3 inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bypassLoading ? 'Validation...' : "Je n'ai pas reçu mon mail"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
