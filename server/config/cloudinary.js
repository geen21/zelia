import { v2 as cloudinary } from 'cloudinary'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

if (!process.env.CLOUDINARY_URL && !process.env.CLOUDINARY_API_KEY) {
  const serverEnvPath = path.resolve(__dirname, '../.env')
  dotenv.config({ path: serverEnvPath, override: false })
}

const {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  CLOUDINARY_URL
} = process.env

function extractCredentialsFromUrl(url) {
  if (!url) return {}
  try {
    const parsed = new URL(url)
    const cloudName = parsed.hostname
    const apiKey = decodeURIComponent(parsed.username || '') || undefined
    const apiSecret = decodeURIComponent(parsed.password || '') || undefined
    const queryParams = Object.fromEntries(parsed.searchParams.entries())
    return {
      cloud_name: cloudName || undefined,
      api_key: apiKey,
      api_secret: apiSecret,
      ...('upload_preset' in queryParams ? { upload_preset: queryParams.upload_preset } : {})
    }
  } catch (error) {
    console.warn('[cloudinary] Failed to parse CLOUDINARY_URL. Falling back to individual env vars.', error)
    return {}
  }
}

const urlCreds = extractCredentialsFromUrl(CLOUDINARY_URL)
const directCreds = {
  cloud_name: CLOUDINARY_CLOUD_NAME || undefined,
  api_key: CLOUDINARY_API_KEY || undefined,
  api_secret: CLOUDINARY_API_SECRET || undefined
}

const config = {
  secure: true,
  ...urlCreds,
  ...Object.fromEntries(Object.entries(directCreds).filter(([, value]) => value))
}

if (!config.cloud_name || !config.api_key || !config.api_secret) {
  console.warn('[cloudinary] Missing Cloudinary credentials. Uploads will fail until configured.')
} else {
  cloudinary.config(config)
}

export function isCloudinaryConfigured() {
  return Boolean((CLOUDINARY_URL || (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET)))
}

export { cloudinary }
