import rateLimit from 'express-rate-limit'

function isReadRequest(req) {
  return req.method === 'GET' || req.method === 'HEAD'
}

function isPublicCrawlablePath(req) {
  return /^\/formations(?:\/|$)/.test(req.path) || /^\/sitemap/.test(req.path)
}

export function createApiRateLimiters() {
  const options = {
    windowMs: 15 * 60 * 1000,
    message: {
      error: 'Too many requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
  }

  return [
    rateLimit({
      ...options,
      max: 1000,
      skip: (req) => !isReadRequest(req) || isPublicCrawlablePath(req)
    }),
    rateLimit({
      ...options,
      max: 100,
      skip: (req) => isReadRequest(req) || req.method === 'OPTIONS'
    })
  ]
}
