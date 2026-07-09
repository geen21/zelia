// Minimal client for the school-portal admin routes (approve/revoke school
// accounts). Authenticated with a shared secret header instead of a Supabase
// session, since there is no admin role/UI elsewhere in the app yet.
import axios from 'axios'
import { API_BASE_URL } from './api'

const ADMIN_KEY_STORAGE = 'zelia_school_portal_admin_key'

export function getStoredAdminKey() {
  return sessionStorage.getItem(ADMIN_KEY_STORAGE) || ''
}

export function storeAdminKey(key) {
  if (key) sessionStorage.setItem(ADMIN_KEY_STORAGE, key)
  else sessionStorage.removeItem(ADMIN_KEY_STORAGE)
}

function client(adminKey) {
  return axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': adminKey
    }
  })
}

export const schoolPortalAdminAPI = {
  listCompanies: (adminKey, status = 'pending') =>
    client(adminKey).get('/school-portal/admin/companies', { params: { status } }),
  approve: (adminKey, id) => client(adminKey).post(`/school-portal/admin/companies/${id}/approve`),
  revoke: (adminKey, id) => client(adminKey).post(`/school-portal/admin/companies/${id}/revoke`)
}
