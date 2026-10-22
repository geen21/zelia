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
    if (['/school-portal/schools/search', '/school-portal/register'].includes(config.url)) return config
    const { data, error } = await schoolPortalSupabase.auth.getSession()
    if (error) throw error
    const token = data?.session?.access_token
    if (token) {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${token}`
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
  revealLead: (userId) => schoolPortalApiClient.post(`/school-portal/lead/${encodeURIComponent(`user:${userId}`)}/reveal`),
  revealDirectRequest: (id) => schoolPortalApiClient.post(`/school-portal/lead/${encodeURIComponent(`request:${id}`)}/reveal`),
  getStats: (params = {}) => schoolPortalApiClient.get('/school-portal/stats', { params }),
  getCatalog: (params = {}) => schoolPortalApiClient.get('/school-portal/catalog', { params }),
  getLead: (key) => schoolPortalApiClient.get(`/school-portal/lead/${encodeURIComponent(key)}`),
  reveal: (key) => schoolPortalApiClient.post(`/school-portal/lead/${encodeURIComponent(key)}/reveal`),
  getFormations: () => schoolPortalApiClient.get('/school-portal/formations'),
  getSchoolFormations: () => schoolPortalApiClient.get('/school-portal/school-formations'),
  createSchoolFormation: (payload) => schoolPortalApiClient.post('/school-portal/school-formations', payload),
  updateSchoolFormation: (id, payload) => schoolPortalApiClient.put(`/school-portal/school-formations/${id}`, payload),
  deleteSchoolFormation: (id) => schoolPortalApiClient.delete(`/school-portal/school-formations/${id}`),
  getMembers: () => schoolPortalApiClient.get('/school-portal/members'),
  inviteMember: (payload) => schoolPortalApiClient.post('/school-portal/members', payload),
  removeMember: (id) => schoolPortalApiClient.delete(`/school-portal/members/${id}`)
}

export function createDashboardAPI(client, base) {
  return {
    getMe: () => client.get(`${base}/company`),
    getLeads: (params = {}) => client.get(`${base}/leads`, { params }),
    getStats: (params = {}) => client.get(`${base}/stats`, { params }),
    getLead: (key) => client.get(`${base}/lead/${encodeURIComponent(key)}`),
    getCatalog: (params = {}) => client.get(`${base}/catalog`, { params }),
    getSchoolFormations: () => client.get(`${base}/school-formations`),
    getMembers: () => client.get(`${base}/members`),
    exportLeadsCsv: (params = {}) => client.get(`${base}/leads/export.csv`, { params, responseType: 'blob' })
  }
}

export default schoolPortalApiClient
