import React, { useState } from 'react'
import axios from 'axios'
import { Link, useNavigate } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function handleSubmit(e: any) {
    e.preventDefault()
    setError('')
    try {
      // Backend expects JSON: { email, password, profile_type }
      const { data } = await axios.post('/api/auth/login', {
        email,
        password,
        profile_type: 'student',
      })
  localStorage.setItem('token', data.access_token)
  // Rediriger vers la page d'accueil de l'application après connexion
  navigate('/app')
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Échec de connexion')
    }
  }

  return (
    <div className="aximo-all-section bg-light2" style={{minHeight:'100vh'}}>
      <div className="container" style={{paddingTop:'120px'}}>
        <div className="row justify-content-center">
          <div className="col-md-6">
            <div className="aximo-default-content clash-grotesk">
              <h2>Se connecter</h2>
            </div>
            <form onSubmit={handleSubmit} className="aximo-contact-form">
              <div className="row">
                <div className="col-12 mb-3">
                  <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required />
                </div>
                <div className="col-12 mb-3">
                  <input type="password" placeholder="Mot de passe" value={password} onChange={e=>setPassword(e.target.value)} required />
                </div>
                {error && <div className="col-12 text-danger mb-2">{error}</div>}
                <div className="col-12">
                  <button type="submit" className="aximo-default-btn">
                    <span className="aximo-label-up">Se connecter</span>
                  </button>
                </div>
              </div>
            </form>
            <p className="mt-3">Pas de compte ? <Link to="/avatar">S'inscrire</Link></p>
          </div>
        </div>
      </div>
    </div>
  )
}
