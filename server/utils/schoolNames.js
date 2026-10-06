function normalizeSchoolName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export async function findKnownSchoolName(db, schoolName) {
  const { data, error } = await db.rpc('search_partner_schools', {
    p_query: schoolName,
    p_limit: 20
  })
  if (error) throw error

  const target = normalizeSchoolName(schoolName)
  const match = (data || []).find((row) => normalizeSchoolName(row.school_name) === target)
  return match ? match.school_name : null
}
