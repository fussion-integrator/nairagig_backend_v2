import { Router } from 'express'

const router = Router()

router.post('/', (req, res) => {
  const { level, message, data } = req.body
  
  // Print directly to terminal
  console.log(`[FRONTEND ${level.toUpperCase()}] ${message}`, data || '')
  
  res.status(200).json({ success: true })
})

export { router as logRoutes }