import express from 'express'
import nodemailer from 'nodemailer'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i
const REQUIRED_ENV = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD']
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key])

if (missingEnv.length) {
  console.warn('Share route SMTP configuration missing environment variables:', missingEnv.join(', '))
}

const smtpPort = Number(process.env.SMTP_PORT || 0)
const inferredSecure = smtpPort === 465
const useSecure = process.env.SMTP_SECURE
  ? process.env.SMTP_SECURE.toLowerCase() === 'true'
  : inferredSecure

let transporter = null

async function resolveTransporter() {
  if (!transporter) {
    if (missingEnv.length) {
      throw new Error('SMTP configuration is incomplete. Missing environment variables.')
    }

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
  port: smtpPort || 465,
      secure: useSecure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    })

    try {
      await transporter.verify()
    } catch (error) {
      console.warn('SMTP transporter verification failed:', error.message)
    }
  }

  return transporter
}

router.post('/results', authenticateToken, async (req, res) => {
  const {
    recipients,
    subject,
    text,
    html,
    attachment,
    replyTo
  } = req.body || {}

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'recipients must be a non-empty array of email addresses' })
  }

  const invalidRecipients = recipients.filter((email) => !EMAIL_REGEX.test(email))
  if (invalidRecipients.length) {
    return res.status(400).json({ error: `Invalid email addresses: ${invalidRecipients.join(', ')}` })
  }

  if (!attachment?.filename || !attachment?.content) {
    return res.status(400).json({ error: 'attachment with filename and base64 content is required' })
  }

  let attachmentBuffer
  try {
    attachmentBuffer = Buffer.from(attachment.content, 'base64')
  } catch (error) {
    return res.status(400).json({ error: 'attachment content must be valid base64' })
  }

  const safeSubject = subject && typeof subject === 'string' ? subject : "Partage des résultats Zélia"
  const safeText = text && typeof text === 'string' && text.trim().length
    ? text
    : 'Retrouvez en pièce jointe le dossier de résultats Zélia.'
  const safeHtml = html && typeof html === 'string' && html.trim().length
    ? html
    : '<p>Retrouvez en pièce jointe le dossier de résultats Zélia.</p>'

  const fromAddress = process.env.EMAIL_FROM || 'Zélia <no-reply@zelia.io>'

  try {
    const mailTransporter = await resolveTransporter()

    await mailTransporter.sendMail({
      from: fromAddress,
      to: recipients,
      subject: safeSubject,
      text: safeText,
      html: safeHtml,
      attachments: [
        {
          filename: attachment.filename,
          content: attachmentBuffer,
          contentType: attachment.contentType || 'application/pdf'
        }
      ],
      ...(replyTo ? { replyTo } : {}),
      ...(process.env.EMAIL_BCC ? { bcc: process.env.EMAIL_BCC } : {})
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Failed to send results email:', error)
    res.status(500).json({ error: 'Failed to send email', details: process.env.NODE_ENV === 'production' ? undefined : error.message })
  }
})

export default router
