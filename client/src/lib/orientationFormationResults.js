export function mixFormationResults(formations = [], partners = []) {
  const seen = new Set()
  const selected = partners
    .filter((partner) => partner?.id && partner.is_active !== false && partner.show_in_results !== false)
    .sort((left, right) => (Number(right.results_priority) || 0) - (Number(left.results_priority) || 0)
      || (Number(right.match_score) || 0) - (Number(left.match_score) || 0)
      || String(left.id).localeCompare(String(right.id)))
    .filter((partner) => {
      if (seen.has(String(partner.id))) return false
      seen.add(String(partner.id))
      return true
    })
    .slice(0, 3)
  const results = []
  let partnerIndex = 0
  for (const [index, formation] of formations.entries()) {
    results.push({ key: `formation-${formation.id}`, source: 'national', formation })
    if ((index + 1) % 3 === 0 && selected[partnerIndex]) {
      const partner = selected[partnerIndex++]
      results.push({ key: `partner-${partner.id}`, source: 'partner', formation: partner })
    }
  }
  while (selected[partnerIndex]) {
    const partner = selected[partnerIndex++]
    results.push({ key: `partner-${partner.id}`, source: 'partner', formation: partner })
  }
  return results
}