import { supabase } from './supabase'
import { orientationAPI, usersAPI } from './api'

const AUTH_AFTER_KEY = 'zelia_auth_after'
const REGISTRATION_CONSENT_KEY = 'registration_consent'

function getStoredJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function buildAuthCallbackUrl(after = '') {
  const url = new URL('/auth/callback', window.location.origin)
  if (after) url.searchParams.set('after', after)
  return url.toString()
}

export function rememberAuthAfter(after = '') {
  if (after) localStorage.setItem(AUTH_AFTER_KEY, after)
  else localStorage.removeItem(AUTH_AFTER_KEY)
}

export function resolveAuthAfter(explicitAfter = '') {
  return explicitAfter || localStorage.getItem(AUTH_AFTER_KEY) || ''
}

export function getAuthTarget(after = '') {
  const resolved = resolveAuthAfter(after)
  if (resolved === 'orientation-analysis') return '/orientation'
  if (resolved === 'results' || localStorage.getItem('answers_cache')) return '/app/results'
  return '/app'
}

export function getOnboardingCache() {
  const avatarConfig = getStoredJson('avatar_cfg')
  const avatarUrl = localStorage.getItem('avatar_url') || ''
  const answersPayload = getStoredJson('answers_cache', {})
  const microProfile = getStoredJson('orientation_micro_profile', {})
  const registrationDepartment = getStoredJson('registration_department', {})
  const registrationConsent = getStoredJson(REGISTRATION_CONSENT_KEY, {})

  return {
    avatarData: avatarConfig && avatarUrl
      ? { ...avatarConfig, url: avatarUrl, provider: 'dicebear/lorelei' }
      : null,
    answers: Array.isArray(answersPayload?.answers)
      ? answersPayload.answers
      : Array.isArray(answersPayload?.responses)
        ? answersPayload.responses
        : [],
    microProfile: microProfile && typeof microProfile === 'object' ? microProfile : {},
    registrationDepartment: registrationDepartment && typeof registrationDepartment === 'object'
      ? registrationDepartment
      : { code: '', name: '' },
    registrationConsent: registrationConsent && typeof registrationConsent === 'object'
      ? registrationConsent
      : {}
  }
}

export function rememberRegistrationConsent(consent = {}) {
  localStorage.setItem(REGISTRATION_CONSENT_KEY, JSON.stringify(consent))
}

export function buildProfileFromSupabaseUser(user, overrides = {}) {
  const metadata = user?.user_metadata || {}
  const fullName = metadata.full_name || metadata.name || ''
  const [firstFromName, ...restName] = fullName.split(' ').filter(Boolean)
  const firstName = overrides.first_name || overrides.prenom || metadata.first_name || firstFromName || ''
  const lastName = overrides.last_name || overrides.nom || metadata.last_name || restName.join(' ') || ''
  const avatar = metadata.avatar_url || metadata.picture || overrides.avatar || ''
  const department = overrides.department || metadata.department || metadata.departement || ''

  const profile = {
    ...overrides,
    institution_data: {
      profile_type: 'student',
      ...(overrides.institution_data || {})
    }
  }
  delete profile.profile_type
  delete profile.prenom
  delete profile.nom

  if (firstName) {
    profile.first_name = firstName
  }
  if (lastName) {
    profile.last_name = lastName
  }
  if (department) profile.department = department
  if (avatar) profile.avatar = avatar

  return profile
}

function buildMicroProfileEntries(profile) {
  if (!profile || typeof profile !== 'object') return []
  const entries = [
    { question_id: 'orientation_grade_confidence', question_text: 'Moyenne matières fortes', answer_text: profile.grade_confidence || '' },
    { question_id: 'orientation_school_level', question_text: 'Classe actuelle', answer_text: profile.school_level || '' },
    { question_id: 'orientation_study_location', question_text: 'Preference geographique', answer_text: profile.study_location || '' },
    { question_id: 'orientation_department', question_text: 'Departement', answer_text: profile.department || '' },
    { question_id: 'orientation_department_name', question_text: 'Nom departement', answer_text: profile.department_name || '' },
    { question_id: 'orientation_school_type', question_text: 'Preference public/prive', answer_text: profile.school_type || '' },
    { question_id: 'orientation_budget', question_text: 'Budget etudes', answer_text: profile.budget || '' },
    { question_id: 'orientation_strong_subjects', question_text: 'Matieres fortes', answer_text: JSON.stringify(profile.strong_subjects || []) },
    { question_id: 'orientation_formation_preferences', question_text: 'Formats de formation à privilégier', answer_text: JSON.stringify(profile.formation_preferences || []) },
    { question_id: 'orientation_career_domains', question_text: 'Domaines professionnels attirants', answer_text: JSON.stringify(profile.career_domains || []) }
  ]
  return entries.filter((entry) => entry.answer_text && entry.answer_text !== '[]')
}

export function clearOnboardingCache() {
  localStorage.removeItem('avatar_cfg')
  localStorage.removeItem('avatar_url')
  localStorage.removeItem('answers_cache')
  localStorage.removeItem('answers_progress')
  localStorage.removeItem('orientation_micro_profile')
  localStorage.removeItem('registration_department')
  localStorage.removeItem(REGISTRATION_CONSENT_KEY)
  localStorage.removeItem('pending_registration_email')
  localStorage.removeItem('pending_registration_after')
  localStorage.removeItem(AUTH_AFTER_KEY)
}

export async function persistAuthSessionAndOnboarding({ after = '', profileData = null, submitAnswers = true } = {}) {
  const { data } = await supabase.auth.getSession()
  const session = data?.session
  if (!session?.access_token) throw new Error('Session Supabase introuvable')

  localStorage.setItem('supabase_auth_token', session.access_token)

  const cache = getOnboardingCache()
  const updates = { ...(profileData || {}) }
  if (cache.registrationDepartment?.code) {
    updates.department = cache.registrationDepartment.code
  }
  if (cache.registrationDepartment?.name) {
    updates.institution_data = {
      ...(updates.institution_data || {}),
      department_name: cache.registrationDepartment.name
    }
  }
  if (cache.registrationConsent && Object.keys(cache.registrationConsent).length) {
    updates.contact_preference = Boolean(cache.registrationConsent.accept_data_transfer)
    updates.institution_data = {
      ...(updates.institution_data || {}),
      newsletter_opt_in: Boolean(cache.registrationConsent.newsletter_opt_in),
      accept_terms: Boolean(cache.registrationConsent.accept_terms),
      accept_data_transfer: Boolean(cache.registrationConsent.accept_data_transfer),
      terms_accepted_at: cache.registrationConsent.terms_accepted_at || new Date().toISOString()
    }
  }
  if (cache.avatarData) {
    updates.avatar_json = cache.avatarData
    updates.avatar = cache.avatarData.url || cache.avatarData.provider
  }

  if (Object.keys(updates).length) {
    await usersAPI.updateProfile(updates).catch((error) => {
      console.warn('Profile onboarding update failed:', error)
    })
  }

  const microEntries = buildMicroProfileEntries({
    ...cache.microProfile,
    department: cache.registrationDepartment?.code || cache.microProfile?.department || '',
    department_name: cache.registrationDepartment?.name || cache.microProfile?.department_name || ''
  })
  if (microEntries.length) {
    await usersAPI.saveExtraInfo(microEntries).catch((error) => {
      console.warn('Micro profile onboarding save failed:', error)
    })
  }

  const resolvedAfter = resolveAuthAfter(after)
  const resumeOrientation = resolvedAfter === 'orientation-analysis'

  if (submitAnswers && cache.answers.length && !resumeOrientation) {
    await orientationAPI.submitInitialAnswers(cache.answers).catch((error) => {
      console.warn('Questionnaire onboarding submit failed:', error)
    })
  }

  const target = getAuthTarget(after)
  if (resumeOrientation) {
    localStorage.setItem('orientation_resume_after_auth', 'analysis')
    localStorage.removeItem(AUTH_AFTER_KEY)
  } else {
    clearOnboardingCache()
  }
  return target
}
