export async function assertAccountActive(db, userId) {
  if (!db) throw Object.assign(new Error('ACCOUNT_STATUS_UNAVAILABLE'), { status: 503 })
  const { data, error } = await db.from('backoffice_account_suspensions')
    .select('is_suspended').eq('user_id', userId).maybeSingle()
  if (error) throw Object.assign(new Error('ACCOUNT_STATUS_UNAVAILABLE'), { status: 503 })
  if (data?.is_suspended) throw Object.assign(new Error('ACCOUNT_SUSPENDED'), { status: 403 })
}