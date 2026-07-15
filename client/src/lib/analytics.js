const ORIENTATION_PARAMETER_KEYS = new Set([
  'orientation_step',
  'orientation_step_index',
  'orientation_total_steps',
  'orientation_question_number',
  'orientation_question_category',
  'orientation_answer_position',
  'orientation_micro_step',
  'orientation_item_count',
  'orientation_source',
  'orientation_action',
  'orientation_error_stage'
])

function normalizeEventName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

function normalizeParameters(parameters = {}) {
  return Object.fromEntries(
    Object.entries(parameters)
      .filter(([key]) => ORIENTATION_PARAMETER_KEYS.has(key))
      .map(([key, value]) => {
        if (typeof value === 'number' || typeof value === 'boolean') return [key, value]
        return [key, String(value || '').trim().slice(0, 80)]
      })
      .filter(([, value]) => value !== '')
  )
}

export function trackAnalyticsEvent(eventName, parameters = {}) {
  if (typeof window === 'undefined') return
  const event = normalizeEventName(eventName)
  if (!event) return

  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({ event, ...parameters })
}

export function trackOrientationEvent(eventName, parameters = {}) {
  trackAnalyticsEvent(eventName, {
    orientation_flow: 'orientation_v1',
    ...normalizeParameters(parameters)
  })
}