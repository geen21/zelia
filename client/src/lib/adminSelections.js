export function selectedFormations(value) {
  let parsed = value
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed) } catch { return [] }
  }
  const candidates = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.candidates) ? parsed.candidates : []
  return candidates.filter((candidate) => candidate?.type === 'formation' && candidate.requestMoreInformation === true)
}