import React, { useState } from 'react'
import { authAPI } from '../lib/api'
import supabase from '../lib/supabase'
import { Link, useNavigate } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [profileType, setProfileType] = useState('student')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    
    try {
      // Login with Supabase
      const { data: signInData, error: authError } = await supabase.auth.signInWithPassword({ 
        email, 
        password 
      })
      
      if (authError) throw authError

      // Store auth token for API requests
      if (signInData.session?.access_token) {
        localStorage.setItem('supabase_auth_token', signInData.session.access_token)
      }

      // Update profile with profile type if needed
      if (profileType) {
        try {
          const { data } = await supabase
            .from('profiles')
            .upsert({ 
              id: signInData.user.id, 
              profile_type: profileType,
              updated_at: new Date().toISOString()
            })
        } catch (profileError) {
          console.warn('Profile update failed:', profileError)
        }
      }

      // Check for cached questionnaire answers
      const cached = localStorage.getItem('answers_cache')
      if (cached) {
        try {
          // TODO: Submit cached answers when questionnaire API is ready
          localStorage.removeItem('answers_cache')
          navigate('/app/results')
          return
        } catch (cacheError) {
          console.warn('Failed to submit cached answers:', cacheError)
        }
      }

      navigate('/app')
    } catch (err) {
      const msg = err?.message || err?.error_description || err?.response?.data?.error || 'Échec de connexion'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white text-text-primary flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Se connecter</h1>
          <p className="text-text-secondary">Sélectionnez votre profil et connectez-vous pour continuer.</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-surface border border-line rounded-xl shadow-card p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input className="border border-line rounded-lg px-3 py-2 outline-none" type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required />
            <input className="border border-line rounded-lg px-3 py-2 outline-none" type="password" placeholder="Mot de passe" value={password} onChange={e=>setPassword(e.target.value)} required />
          </div>
          <div className="flex gap-2">
            <button type="button" className={`px-3 py-2 rounded-lg border ${profileType==='student'?'border-black bg-black text-white':'border-line'}`} onClick={()=>setProfileType('student')}>Étudiant</button>
            <button type="button" className={`px-3 py-2 rounded-lg border ${profileType==='company'?'border-black bg-black text-white':'border-line'}`} onClick={()=>setProfileType('company')}>Entreprise</button>
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <div>
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-black text-white rounded-lg h-11 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </div>
        </form>
  <p className="mt-3 text-sm text-text-secondary">Pas de compte ? <Link to="/avatar" className="underline">S'inscrire</Link></p>
      </div>
    </div>
  )
}
