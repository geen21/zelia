// API client utilities for the Zelia application
import axios from 'axios'
import { supabase } from './supabase'
import { buildToolModeResponse, isStandaloneToolRoute } from './toolMode'

const DEFAULT_API_BASE = typeof window !== 'undefined' && window.location?.origin
  ? `${window.location.origin.replace(/\/$/, '')}/api`
  : 'http://localhost:3001/api'

function resolveApiBaseUrl() {
  const raw = (import.meta.env.VITE_API_URL || '').trim()
  if (!raw) return DEFAULT_API_BASE
  try {
    const parsed = new URL(raw)
    const normalized = parsed.toString().replace(/\/$/, '')
    return normalized
  } catch (error) {
    console.warn(`[api] Invalid VITE_API_URL "${raw}" – falling back to ${DEFAULT_API_BASE}.`, error)
    return DEFAULT_API_BASE
  }
}

const API_BASE_URL = resolveApiBaseUrl()

// Create axios instance with default configuration
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add auth token to requests if available
apiClient.interceptors.request.use(
  async (config) => {
    // Always try to use the freshest Supabase access token
    try {
      const { data } = await supabase.auth.getSession()
      const liveToken = data?.session?.access_token
      const fallbackToken = localStorage.getItem('supabase_auth_token') || localStorage.getItem('token')
      const token = liveToken || fallbackToken
      if (token) {
        config.headers = config.headers || {}
        if (!config.headers.Authorization) {
          config.headers.Authorization = `Bearer ${token}`
        }
      }
    } catch {
      // ignore and fall back to any stored token
      const token = localStorage.getItem('supabase_auth_token') || localStorage.getItem('token')
      if (token) {
        config.headers = config.headers || {}
        if (!config.headers.Authorization) {
          config.headers.Authorization = `Bearer ${token}`
        }
      }
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Handle response errors globally
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear auth token on unauthorized
      localStorage.removeItem('supabase_auth_token')
      // Redirect to login or refresh token
    }
    return Promise.reject(error)
  }
)

// Auth API
export const authAPI = {
  register: (userData) => apiClient.post('/auth/register', userData),
  login: (credentials) => apiClient.post('/auth/login', credentials),
  logout: () => apiClient.post('/auth/logout'),
  resetPassword: (email) => apiClient.post('/auth/reset-password', { email }),
  refreshToken: (refreshToken) => apiClient.post('/auth/refresh', { refreshToken }),
}

// Users API
export const usersAPI = {
  getProfile: () => apiClient.get('/users/profile'),
  updateProfile: (profileData) => apiClient.put('/users/profile', profileData),
  getCurrentUser: () => apiClient.get('/users/me'),
  saveExtraInfo: (entries) => isStandaloneToolRoute()
    ? buildToolModeResponse({ entries: Array.isArray(entries) ? entries : [] })
    : apiClient.post('/users/profile/extra-info', { entries }),
  getExtraInfo: () => apiClient.get('/users/profile/extra-info'),
  saveNotes: (notes) => isStandaloneToolRoute()
    ? buildToolModeResponse({ notes: Array.isArray(notes) ? notes : [] })
    : apiClient.post('/users/profile/notes', { notes }),
  getNotes: () => apiClient.get('/users/profile/notes'),
  saveFields: (fields) => isStandaloneToolRoute()
    ? buildToolModeResponse({ fields: Array.isArray(fields) ? fields : [] })
    : apiClient.post('/users/profile/fields', { fields }),
  getFields: () => apiClient.get('/users/profile/fields'),
  saveSchools: (schools, contactAccepted) => isStandaloneToolRoute()
    ? buildToolModeResponse({ schools: Array.isArray(schools) ? schools : [], contactAccepted })
    : apiClient.post('/users/profile/schools', { schools, contactAccepted }),
  getSchools: () => apiClient.get('/users/profile/schools'),
}

// Activities API
export const activitiesAPI = {
  getAll: (params = {}) => apiClient.get('/activities', { params }),
  getById: (id) => apiClient.get(`/activities/${id}`),
  create: (activityData) => apiClient.post('/activities', activityData),
  update: (id, activityData) => apiClient.put(`/activities/${id}`, activityData),
  delete: (id) => apiClient.delete(`/activities/${id}`),
}

// Jobs API
export const jobsAPI = {
  getAll: (params = {}) => apiClient.get('/jobs', { params }),
  getById: (id) => apiClient.get(`/jobs/${id}`),
  create: (jobData) => apiClient.post('/jobs', jobData),
  update: (id, jobData) => apiClient.put(`/jobs/${id}`, jobData),
  delete: (id) => apiClient.delete(`/jobs/${id}`),
}

// Formations API
export const formationsAPI = {
  getAll: (params = {}) => apiClient.get('/formations', { params }),
  getById: (id) => apiClient.get(`/formations/${id}`),
  create: (formationData) => apiClient.post('/formations', formationData),
  update: (id, formationData) => apiClient.put(`/formations/${id}`, formationData),
  delete: (id) => apiClient.delete(`/formations/${id}`),
}

// Questionnaires API
export const questionnairesAPI = {
  getById: (id) => apiClient.get(`/questionnaires/${id}`),
  submitResponse: (id, responses) => apiClient.post(`/questionnaires/${id}/responses`, { responses }),
  getUserResponses: (id) => apiClient.get(`/questionnaires/${id}/responses`),
  getAllUserResponses: (params = {}) => apiClient.get('/questionnaires/user/responses', { params }),
}

// Analysis API
export const analysisAPI = {
  getMyResults: () => apiClient.get('/analysis/my-results'),
  evaluateJob: ({ job, context }) => apiClient.post('/analysis/level7/evaluate-job', { job, context }),
  getLevel10Bilan: () => apiClient.get('/analysis/level10/bilan'),
  saveShareImage: ({ dataUrl, questionnaireType = 'mbti', metadata }) =>
    apiClient.post('/analysis/share-image', {
      image: dataUrl,
      questionnaireType,
      metadata
    }),
  saveSharePdf: ({ dataUrl, documentType = 'cv', metadata }) =>
    apiClient.post('/analysis/share-pdf', {
      pdf: dataUrl,
      documentType,
      metadata
    })
}

export const orientationAPI = {
  getInitialQuestions: (limit = 20) => apiClient.get('/questionnaire/questions', {
    params: { type: 'inscription', limit }
  }),
  submitInitialAnswers: (answers) => apiClient.post('/questionnaire/submit', {
    answers,
    questionnaireType: 'inscription'
  }),
  generateInitialAnalysis: () => apiClient.post('/analysis/generate-analysis', {}),
  getResults: () => apiClient.get('/analysis/my-results', {
    headers: { 'Cache-Control': 'no-cache' },
    params: { _: Date.now() }
  }),
  searchFormations: (params = {}) => apiClient.get('/catalog/formations/search', { params }),
  searchMetiers: (params = {}) => apiClient.get('/catalog/metiers/search', { params }),
  getMatchedSchools: () => apiClient.get('/ecoles/matched'),
  getPartnerSchools: () => apiClient.get('/ecoles/partenaires'),
  getCurrentUser: () => apiClient.get('/users/me')
}

export default apiClient

// Chat API
export const chatAPI = {
  getMessages: (params = {}) => apiClient.get('/chat/messages', { params }),
  getMessageById: (id) => apiClient.get(`/chat/messages/${id}`),
  sendMessage: (content) => apiClient.post('/chat/message', { content }),
  clearMyMessages: () => apiClient.delete('/chat/messages/me'),
  getPersonaQuota: (persona) => apiClient.get('/chat/ai/quota', { params: { persona } }),
  aiChat: (payload = {}, config = {}) => apiClient.post('/chat/ai', payload, config)
}

// Letter API
export const letterAPI = {
  suggest: ({ q, type }) => apiClient.get('/letter/suggest', { params: { q, type } }),
  generate: ({ selection, style, emploi_selection, formation_selection }) => apiClient.post('/letter/generate', { selection, style, emploi_selection, formation_selection })
}

export const progressionAPI = {
  get: async () => {
    const { data: sessionData } = await supabase.auth.getUser()
    const userId = sessionData?.user?.id
    if (!userId) throw new Error('No user')
    return apiClient.get(`/progression/${userId}`)
  },
  update: async ({ level, xp, quests, perks }) => {
    if (isStandaloneToolRoute()) {
      return buildToolModeResponse({ level, xp, quests, perks })
    }
    const { data: sessionData } = await supabase.auth.getUser()
    const userId = sessionData?.user?.id
    if (!userId) throw new Error('No user')
    return apiClient.post(`/progression/${userId}`, { level, xp, quests, perks })
  }
}

export const paymentsAPI = {
  getConfig: () => apiClient.get('/payments/config'),
  createCheckout: (payload = {}) => apiClient.post('/payments/checkout', payload),
  verifySession: (sessionId) => apiClient.post('/payments/verify', { sessionId })
}

export const shareAPI = {
  sendResults: (payload = {}) => apiClient.post('/share/results', payload)
}

export const supportAPI = {
  reportBug: ({ title, description, location, userAgent, email }) =>
    apiClient.post('/support/bug', { title, description, location, userAgent, email })
}

export const waitlistAPI = {
  join: (payload = {}) => apiClient.post('/waitlist', payload),
  getMyEntry: () => apiClient.get('/waitlist/me')
}

export const ecolesAPI = {
  partenaires: () => apiClient.get('/ecoles/partenaires'),
  formation: (id) => apiClient.get(`/ecoles/partenaires/${id}`),
  matched: () => apiClient.get('/ecoles/matched'),
  submit: (formationId) => apiClient.post('/ecoles/submit', { formation_id: formationId }),
  mySubmissions: () => apiClient.get('/ecoles/my-submissions')
}
