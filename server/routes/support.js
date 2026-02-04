import express from 'express'
import nodemailer from 'nodemailer'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i
const REQUIRED_ENV = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD']
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key])

if (missingEnv.length) {
  console.warn('Support route SMTP configuration missing environment variables:', missingEnv.join(', '))
}

const smtpPort = Number(process.env.SMTP_PORT || 0)
const inferredSecure = smtpPort === 465
const useSecure = process.env.SMTP_SECURE
  ? process.env.SMTP_SECURE.toLowerCase() === 'true'
  : inferredSecure

let transporter = null

async function getTransporter() {
  if (!transporter) {
    if (missingEnv.length) throw new Error('SMTP configuration incomplete')
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: smtpPort || 465,
      secure: useSecure,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    })
    try { await transporter.verify() } catch (e) {
      console.warn('SMTP verification (support) failed:', e.message)
    }
  }
  return transporter
}

// Report a bug from in-app sidebar modal
router.post('/bug', authenticateToken, async (req, res) => {
  const { title, description, location, userAgent, email } = req.body || {}

  if (!description || typeof description !== 'string' || description.trim().length < 5) {
    return res.status(400).json({ error: 'Description is required (min 5 characters)' })
  }

  const toAddress = 'nicolas.wiegele@zelia.io'
  const fromAddress = process.env.EMAIL_FROM || 'Zélia <no-reply@zelia.io>'

  const user = req.user || {}
  const reporterEmail = (email && EMAIL_REGEX.test(email)) ? email : (user.email || null)

  const safeTitle = (typeof title === 'string' && title.trim()) ? title.trim() : 'Bug report (Version BETA 1.0)'
  const safeLocation = typeof location === 'string' ? location : ''
  const safeUA = typeof userAgent === 'string' ? userAgent : ''

  const html = `
    <h2>Bug report - Version BETA 1.0</h2>
    <p><strong>Reporter:</strong> ${reporterEmail ? reporterEmail : 'Unknown'}</p>
    <p><strong>User ID:</strong> ${user?.id || 'n/a'}</p>
    <p><strong>Location:</strong> ${safeLocation}</p>
    <p><strong>User-Agent:</strong> ${safeUA}</p>
    <hr/>
    <p style="white-space:pre-wrap;">${description.replace(/</g, '&lt;')}</p>
  `

  const text = `Bug report - Version BETA 1.0\n\nReporter: ${reporterEmail || 'Unknown'}\nUser ID: ${user?.id || 'n/a'}\nLocation: ${safeLocation}\nUser-Agent: ${safeUA}\n\n${description}`

  try {
    const tx = await getTransporter()
    await tx.sendMail({
      from: fromAddress,
      to: toAddress,
      subject: safeTitle,
      text,
      html,
      ...(reporterEmail ? { replyTo: reporterEmail } : {})
    })
    res.json({ success: true })
  } catch (error) {
    console.error('Failed to send bug report:', error)
    res.status(500).json({ error: 'Failed to send bug report' })
  }
})

export default router
