// Avatar helpers shared across the app
export function buildAvatarFromProfile(profile, seed = 'zelia') {
  try {
    if (profile?.avatar_url && typeof profile.avatar_url === 'string') return profile.avatar_url
    if (profile?.avatar && typeof profile.avatar === 'string') {
      try {
        const url = new URL(profile.avatar)
        if (!url.searchParams.has('seed')) url.searchParams.set('seed', String(seed))
        if (!url.searchParams.has('size')) url.searchParams.set('size', '300')
        return url.toString()
      } catch {
        // fall through
      }
    }
    if (profile?.avatar_json) {
      let conf = profile.avatar_json
      if (typeof conf === 'string') {
        try {
          conf = JSON.parse(conf)
        } catch {
          conf = null
        }
      }
      if (conf && typeof conf === 'object') {
        if (conf.url && typeof conf.url === 'string') {
          try {
            const url = new URL(conf.url)
            if (!url.searchParams.has('seed')) url.searchParams.set('seed', String(seed))
            if (!url.searchParams.has('size')) url.searchParams.set('size', '300')
            return url.toString()
          } catch {
            // fall back to param builder
          }
        }
        const params = new URLSearchParams()
        params.set('seed', String(seed))
        Object.entries(conf).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            params.set(key, String(value))
          }
        })
        if (!params.has('size')) params.set('size', '300')
        return `https://api.dicebear.com/9.x/lorelei/svg?${params.toString()}`
      }
    }
  } catch {
    // ignore and fall back to default
  }
  const fallbackParams = new URLSearchParams({ seed: String(seed), size: '300', radius: '15' })
  return `https://api.dicebear.com/9.x/lorelei/svg?${fallbackParams.toString()}`
}

export function buildAvatarFromAnalysis(analysis, seed = 'zelia') {
  if (!analysis) return ''
  try {
    if (analysis.avatarUrlBase && typeof analysis.avatarUrlBase === 'string') {
      try {
        const base = new URL(analysis.avatarUrlBase)
        if (!base.searchParams.has('seed')) base.searchParams.set('seed', String(seed))
        if (!base.searchParams.has('size')) base.searchParams.set('size', '300')
        return base.toString()
      } catch {
        // ignore parsing error, continue
      }
    }

    if (analysis.avatarConfig) {
      let conf = analysis.avatarConfig
      if (typeof conf === 'string') {
        try {
          conf = JSON.parse(conf)
        } catch {
          conf = null
        }
      }
      if (conf && typeof conf === 'object') {
        if (conf.url && typeof conf.url === 'string') {
          try {
            const url = new URL(conf.url)
            if (!url.searchParams.has('seed')) url.searchParams.set('seed', String(seed))
            if (!url.searchParams.has('size')) url.searchParams.set('size', '300')
            return url.toString()
          } catch {
            // continue to params fallback
          }
        }
        const params = new URLSearchParams()
        params.set('seed', String(seed))
        Object.entries(conf).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            params.set(key, String(value))
          }
        })
        if (!params.has('size')) params.set('size', '300')
        return `https://api.dicebear.com/9.x/lorelei/svg?${params.toString()}`
      }
    }
  } catch {
    // ignore and return empty string
  }
  return ''
}

export function resolveAvatarUrl({ profile, analysis, seed = 'zelia' }) {
  const fromAnalysis = buildAvatarFromAnalysis(analysis, seed)
  if (fromAnalysis) return fromAnalysis
  return buildAvatarFromProfile(profile, seed)
}
