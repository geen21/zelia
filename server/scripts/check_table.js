import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env') })

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function check() {
  console.log('Checking waitlist_requests table...')
  const { error } = await supabase.from('waitlist_requests').select('count', { count: 'exact', head: true })
  
  if (error) {
    console.error('Error accessing table:', error.message)
    if (error.message.includes('does not exist')) {
      console.log('TABLE MISSING: The table waitlist_requests does not exist.')
    }
  } else {
    console.log('Table exists and is accessible.')
  }
}

check()
