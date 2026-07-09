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
  exportLeadsCsv: (params = {}) => schoolPortalApiClient.get('/school-portal/leads/export.csv', { params, responseType: 'blob' }),
  updateLeadStatus: (leadKey, payload) => schoolPortalApiClient.patch(`/school-portal/leads/${encodeURIComponent(leadKey)}/status`, payload),
  revealLead: (userId) => schoolPortalApiClient.post(`/school-portal/leads/${userId}/reveal`),
  revealDirectRequest: (id) => schoolPortalApiClient.post(`/school-portal/direct-requests/${id}/reveal`),
  getStats: () => schoolPortalApiClient.get('/school-portal/stats'),
  getFormations: () => schoolPortalApiClient.get('/school-portal/formations'),
  getSchoolFormations: () => schoolPortalApiClient.get('/school-portal/school-formations'),
  createSchoolFormation: (payload) => schoolPortalApiClient.post('/school-portal/school-formations', payload),
  updateSchoolFormation: (id, payload) => schoolPortalApiClient.put(`/school-portal/school-formations/${id}`, payload),
  deleteSchoolFormation: (id) => schoolPortalApiClient.delete(`/school-portal/school-formations/${id}`),
  getMembers: () => schoolPortalApiClient.get('/school-portal/members'),
  inviteMember: (payload) => schoolPortalApiClient.post('/school-portal/members', payload),
  removeMember: (id) => schoolPortalApiClient.delete(`/school-portal/members/${id}`)
}

export default schoolPortalApiClient
