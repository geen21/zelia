import React, { useMemo, useState } from 'react'
import axios from 'axios'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [profileType, setProfileType] = useState('student' as 'student'|'company')
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const after = useMemo(() => params.get('after') || '', [params])

  async function handleSubmit(e: any) {
    e.preventDefault()
    setError('')
    try {
      const { data } = await axios.post('/api/auth/register', { email, password, profile_type: profileType })
      const token: string = data.access_token
      localStorage.setItem('token', token)

      // After account creation: push avatar (if any), questionnaire answers, then trigger results
      const headers = { Authorization: `Bearer ${token}` }
      try {
        const cfgStr = localStorage.getItem('avatar_cfg')
        const url = localStorage.getItem('avatar_url')
        if (url && cfgStr) {
          const cfg = JSON.parse(cfgStr)
          await axios.put('/api/results/avatar', { ...cfg, url, provider: 'dicebear/lorelei' }, { headers })
        }
      } catch {}
      try {
        const answersPayloadStr = localStorage.getItem('answers_cache')
        if (answersPayloadStr && profileType === 'student') {
          const payload = JSON.parse(answersPayloadStr)
          if (payload && Array.isArray(payload.answers) && payload.answers.length) {
            await axios.post('/api/questionnaire/submit', payload, { headers })
          }
        }
      } catch {}
      try {
        if (profileType === 'student') {
          await axios.post('/api/results/generate', {}, { headers })
        }
      } catch {}

      // Navigate
      if (after === 'results' && profileType === 'student') {
        navigate('/app/results?first=1')
      } else {
        navigate('/app')
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Échec d\'inscription')
    }
  }

  return (
    <div className="aximo-all-section bg-light2" style={{minHeight:'100vh'}}>
      <div className="container" style={{paddingTop:'120px'}}>
        <div className="row justify-content-center">
          <div className="col-md-8">
            <div className="aximo-default-content clash-grotesk">
              <h2>Créer un compte</h2>
              <p>Choisissez votre type de profil pour une expérience personnalisée.</p>
            </div>
            <form onSubmit={handleSubmit} className="aximo-contact-form">
              <div className="row">
                <div className="col-md-6 mb-3">
                  <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required />
                </div>
                <div className="col-md-6 mb-3">
                  <input type="password" placeholder="Mot de passe" value={password} onChange={e=>setPassword(e.target.value)} required />
                </div>
                <div className="col-12 mb-3">
                  <div className="d-flex gap-3">
                    <label className={`aximo-default-btn ${profileType==='student'?'active':''}`}>
                      <input type="radio" name="profile" value="student" checked={profileType==='student'} onChange={()=>setProfileType('student')} style={{display:'none'}}/>
                      <span className="aximo-label-up">Profil étudiant</span>
                    </label>
                    <label className={`aximo-default-btn outline-btn ${profileType==='company'?'active':''}`}>
                      <input type="radio" name="profile" value="company" checked={profileType==='company'} onChange={()=>setProfileType('company')} style={{display:'none'}}/>
                      <span className="aximo-label-up">Profil entreprise</span>
                    </label>
                  </div>
                </div>
                {error && <div className="col-12 text-danger mb-2">{error}</div>}
                <div className="col-12">
                  <button type="submit" className="aximo-default-btn">
                    <span className="aximo-label-up">S'inscrire</span>
                  </button>
                </div>
              </div>
            </form>
            <p className="mt-3">Vous avez déjà un compte ? <Link to="/login">Se connecter</Link></p>
          </div>
        </div>
      </div>
    </div>
  )
}
