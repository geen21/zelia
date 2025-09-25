import express from 'express'

const router = express.Router()

// Simple ping route to verify dev router works
router.get('/ping', (req, res) => {
  res.json({ ok: true, ts: Date.now() })
})

export default router
