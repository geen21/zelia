// Dedicated axios client for the school/établissement portal ("Espace écoles").
// Kept fully separate from the student apiClient (lib/api.js): it authenticates
// using the isolated schoolPortalSupabase session so the two interfaces never
// share tokens or interfere with each other.
import axios from 'axios'
import { API_BASE_URL } from './api'
import { schoolPortalSupabase } from './schoolPortalSupabase'

const schoolPortalApiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

schoolPortalApiClient.interceptors.request.use(
  async (config) => {
    try {
      const { data } = await schoolPortalSupabase.auth.getSession()
      const token = data?.session?.access_token
      if (token) {
        config.headers = config.headers || {}
        config.headers.Authorization = `Bearer ${token}`
      }
    } catch {
      // no session available, request proceeds unauthenticated
    }
    return config
  },
  (error) => Promise.reject(error)
)

export const schoolPortalAPI = {
  searchSchools: (q) => schoolPortalApiClient.get('/school-portal/schools/search', { params: { q } }),
  register: (payload) => schoolPortalApiClient.post('/school-portal/register', payload),
  getMe: () => schoolPortalApiClient.get('/school-portal/me'),
  updateMe: (payload) => schoolPortalApiClient.put('/school-portal/me', payload),
  getLeads: (params = {}) => schoolPortalApiClient.get('/school-portal/leads', { params }),
  exportLeadsCsv: () => schoolPortalApiClient.get('/school-portal/leads/export.csv', { responseType: 'blob' }),
  getFormations: () => schoolPortalApiClient.get('/school-portal/formations')
}

export default schoolPortalApiClient
