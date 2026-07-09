// Shared SMTP mailer helper for the school-portal "new lead" notifications.
// Mirrors the transporter setup already duplicated in routes/letter.js,
// routes/share.js and routes/support.js (kept those untouched - this is only
// used by the new notification code paths added in schoolPortal.js/users.js/
// formations.js).
import nodemailer from 'nodemailer'

const REQUIRED_SMTP_ENV = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD']
const missingSmtpEnv = REQUIRED_SMTP_ENV.filter((key) => !process.env[key])

if (missingSmtpEnv.length) {
  console.warn('Mailer: SMTP configuration missing environment variables:', missingSmtpEnv.join(', '))
}

const smtpPort = Number(process.env.SMTP_PORT || 0)
const inferredSecure = smtpPort === 465
const useSecure = process.env.SMTP_SECURE
  ? process.env.SMTP_SECURE.toLowerCase() === 'true'
  : inferredSecure

let transporter = null

export function isMailerConfigured() {
  return missingSmtpEnv.length === 0
}

async function getTransporter() {
  if (!transporter) {
    if (missingSmtpEnv.length) throw new Error('SMTP configuration incomplete')
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: smtpPort || 465,
      secure: useSecure,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    })
  }
  return transporter
}

// Best-effort send: never throws, so callers can fire-and-forget without
// risking the parent request (e.g. a lead creation) failing because of an
// email/SMTP issue.
export async function sendMailSafe({ to, subject, html }) {
  if (!isMailerConfigured()) {
    console.warn('Mailer: skipped sending email, SMTP not configured:', subject)
    return false
  }
  try {
    const smtpTransporter = await getTransporter()
    const fromAddress = process.env.EMAIL_FROM || 'Zélia <no-reply@zelia.io>'
    await smtpTransporter.sendMail({ from: fromAddress, to, subject, html })
    return true
  } catch (error) {
    console.warn('Mailer: failed to send email:', error.message)
    return false
  }
}
