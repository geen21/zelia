// Persisted URLs must not change when a formation title is enriched or renamed.
export function getPinnedFormationSlug(row = {}) {
  if (row.canonical_slug === null || row.canonical_slug === undefined) return null
  const slug = row.canonical_slug
  if (typeof slug !== 'string' || slug.length > 200 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
    || !slug.endsWith(`-${row.id}`)) {
    throw new Error('Invalid persisted formation canonical URL')
  }
  return slug
}
