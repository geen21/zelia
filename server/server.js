import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import paymentsRoutes, { paymentsWebhookHandler, parentTrainingWebhookHandler } from './routes/payments.js'

// Import routes
import authRoutes from './routes/auth.js'
import userRoutes from './routes/users.js'
import activityRoutes from './routes/activities.js'
import jobRoutes from './routes/jobs.js'
import formationRoutes from './routes/formations.js'
import questionnaireRoutes from './routes/questionnaire.js'
import resultsRoutes from './routes/results.js'
import analysisRoutes from './routes/analysis.js'
import catalogRoutes from './routes/catalog.js'
import progressionRoutes from './routes/progression.js'
import chatRoutes from './routes/chat.js'
import letterRoutes from './routes/letter.js'
import shareRoutes from './routes/share.js'
import supportRoutes from './routes/support.js'
import waitlistRoutes from './routes/waitlist.js'
import ecolesRoutes from './routes/ecoles.js'
import schoolPortalRoutes from './routes/schoolPortal.js'
import sitemapRoutes from './routes/sitemap.js'

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001
const HOST = process.env.HOST || '0.0.0.0'

function resolveTrustProxy(value) {
  if (value === undefined) return 1
  const lower = String(value).toLowerCase().trim()
  if (lower === 'false' || lower === '0') return false
  if (lower === 'true') return true
  if (/^\d+$/.test(lower)) return Number(lower)
  if (lower.includes(',')) {
    return lower.split(',').map((part) => part.trim()).filter(Boolean)
  }
  return value
}

const trustProxy = resolveTrustProxy(process.env.TRUST_PROXY)
app.set('trust proxy', trustProxy)
console.log('Express trust proxy:', trustProxy)

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}))

// Rate limiting
// Public, read-only, crawler-facing endpoints (formation pages + sitemap) are
// exempt: with ~127k programmatic SEO pages, Googlebot/other crawlers can
// easily exceed a per-IP cap while indexing the site, which would get them
// throttled with 429s and stall indexing. These endpoints only ever return
// already-public data (RLS allows anon SELECT) with no mutation, so this is safe.
function isPublicCrawlablePath(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  return /^\/api\/formations(\/|$|\?)/.test(req.path) || /^\/api\/sitemap/.test(req.path)
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: isPublicCrawlablePath,
})

app.use(limiter)

// Stripe webhook (must be registered before JSON body parsing)
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), paymentsWebhookHandler)
app.post('/api/payments/parent-training/webhook', express.raw({ type: 'application/json' }), parentTrainingWebhookHandler)

// CORS configuration
// Allow listed dev origins; can be extended via CLIENT_URL or ADDITIONAL_CLIENT_ORIGINS env vars
const baseAllowedOrigins = [
  process.env.CLIENT_URL || 'https://zelia.io',
  'https://www.zelia.io',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5173',
  'https://localhost:5173'
]

if (process.env.ADDITIONAL_CLIENT_ORIGINS) {
  baseAllowedOrigins.push(
    ...process.env.ADDITIONAL_CLIENT_ORIGINS
      .split(',')
      .map(o => o.trim())
      .filter(Boolean)
  )
}

const allowedOrigins = Array.from(new Set(baseAllowedOrigins))

const corsOptions = {
  origin(origin, callback) {
    // Allow non-browser (no origin) or matching allowed origins
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true)
    }
    console.warn(`CORS blocked origin: ${origin}`)
    callback(new Error('Not allowed by CORS'))
  },
  credentials: true,
  optionsSuccessStatus: 200
}

app.use(cors(corsOptions))
// Helpful at startup to verify CORS config
console.log('CORS allowed origins:', allowedOrigins)

// Compression middleware
app.use(compression())

// Logging middleware
app.use(morgan('combined'))

// Body parsing middleware
app.use(express.json({ limit: '25mb' }))
app.use(express.urlencoded({ extended: true, limit: '25mb' }))

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  })
})

// API routes
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/activities', activityRoutes)
app.use('/api/jobs', jobRoutes)
app.use('/api/formations', formationRoutes)
app.use('/api/questionnaires', questionnaireRoutes)
app.use('/api/questionnaire', questionnaireRoutes)
app.use('/api/results', resultsRoutes)
app.use('/api/progression', progressionRoutes)
app.use('/api/analysis', analysisRoutes)
app.use('/api/catalog', catalogRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/letter', letterRoutes)
app.use('/api/payments', paymentsRoutes)
app.use('/api/share', shareRoutes)
app.use('/api/support', supportRoutes)
app.use('/api/waitlist', waitlistRoutes)
app.use('/api/ecoles', ecolesRoutes)
app.use('/api/school-portal', schoolPortalRoutes)
app.use('/api', sitemapRoutes)

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Zelia API Server',
    version: '1.0.0',
    docs: '/api',
    health: '/health'
  })
})

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'Zelia API',
    version: '1.0.0',
    endpoints: {
      auth: {
        'POST /api/auth/register': 'Register a new user',
        'POST /api/auth/login': 'Login user',
        'POST /api/auth/logout': 'Logout user',
        'POST /api/auth/refresh': 'Refresh authentication token',
        'POST /api/auth/reset-password': 'Reset password'
      },
      users: {
        'GET /api/users/profile': 'Get user profile (authenticated)',
        'PUT /api/users/profile': 'Update user profile (authenticated)',
        'GET /api/users/me': 'Get current user info (authenticated)'
      },
      activities: {
        'GET /api/activities': 'Get all activities',
        'GET /api/activities/:id': 'Get activity by ID',
        'POST /api/activities': 'Create activity (authenticated)',
        'PUT /api/activities/:id': 'Update activity (authenticated)',
        'DELETE /api/activities/:id': 'Delete activity (authenticated)'
      },
      jobs: {
        'GET /api/jobs': 'Get all job listings',
        'GET /api/jobs/:id': 'Get job by ID',
        'POST /api/jobs': 'Create job listing (authenticated)',
        'PUT /api/jobs/:id': 'Update job listing (authenticated)',
        'DELETE /api/jobs/:id': 'Delete job listing (authenticated)'
      },
      formations: {
        'GET /api/formations': 'Get all formations',
        'GET /api/formations/:id': 'Get formation by ID',
        'POST /api/formations': 'Create formation (authenticated)',
        'PUT /api/formations/:id': 'Update formation (authenticated)',
        'DELETE /api/formations/:id': 'Delete formation (authenticated)'
      },
      questionnaires: {
        'GET /api/questionnaires/:id': 'Get questionnaire by ID (authenticated)',
        'POST /api/questionnaires/:id/responses': 'Submit questionnaire response (authenticated)',
        'GET /api/questionnaires/:id/responses': 'Get user responses for questionnaire (authenticated)',
        'GET /api/questionnaires/user/responses': 'Get all user questionnaire responses (authenticated)'
      },
      questionnaire: {
        'GET /api/questionnaire/questions': 'Get questionnaire questions',
        'POST /api/questionnaire/submit': 'Submit questionnaire responses (authenticated)',
        'POST /api/questionnaire/submit/temp': 'Store questionnaire responses for pre-registration (no auth)'
      },
      results: {
        'GET /api/results/latest': 'Get latest user results (authenticated)',
        'POST /api/results/generate': 'Generate results from questionnaire (authenticated)',
        'GET /api/results/avatar': 'Get user avatar info (authenticated)',
        'PUT /api/results/avatar': 'Update user avatar (authenticated)',
        'POST /api/results/avatar/temp': 'Store avatar for pre-registration (no auth)'
      }
    }
  })
})

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  })
})

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error)

  if (error?.type === 'entity.too.large' || error?.status === 413) {
    return res.status(413).json({
      error: 'Payload trop lourd. Réduis la taille du fichier puis réessaie.'
    })
  }
  
  res.status(error.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
  })
})

const server = app.listen(PORT, HOST, () => {
  const displayHost = HOST === '0.0.0.0' ? 'all interfaces (0.0.0.0)' : HOST
  console.log(`🚀 Server is running on ${displayHost}:${PORT}`)
  console.log(`📚 API documentation available at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/api`)
  console.log(`🏥 Health check available at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/health`)
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`)
})

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the existing server before starting a new one.`)
  } else {
    console.error('Server listen error:', error)
  }
  process.exit(1)
})

function shutdown(signal, done = () => process.exit(0)) {
  console.log(`${signal} received, shutting down gracefully`)
  server.close((error) => {
    if (error) {
      console.error('Error while closing server:', error)
      process.exit(1)
      return
    }
    done()
  })
}

process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGUSR2', () => shutdown('SIGUSR2', () => process.kill(process.pid, 'SIGUSR2')))
