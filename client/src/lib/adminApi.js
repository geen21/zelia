import axios from 'axios'
import { API_BASE_URL } from './api'
import { adminSupabase } from './adminSupabase'

export const adminApi = axios.create({ baseURL: `${API_BASE_URL}/admin`, headers: { 'Content-Type': 'application/json' } })
adminApi.interceptors.request.use(async (config) => {
  const { data } = await adminSupabase.auth.getSession()
  if (data.session?.access_token) config.headers.Authorization = `Bearer ${data.session.access_token}`
  return config
})
adminApi.interceptors.response.use((response) => response, (error) => {
  const status = error.response?.status
  const code = error.response?.data?.error
  if (status === 401 || (status === 403 && ['ADMIN_ACCESS_DENIED','ACCOUNT_SUSPENDED','Invalid or expired token','Invalid token'].includes(code))) {
    window.dispatchEvent(new CustomEvent('bo:access-error', { detail: { status, code } }))
  }
  return Promise.reject(error)
})

export function adminError(error) {
  return error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Service indisponible.'
}