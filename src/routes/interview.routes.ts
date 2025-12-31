import { Router } from 'express'
import { InterviewController } from '../controllers/interview.controller'

const router = Router()
const interviewController = new InterviewController()

router.post('/generate-questions', interviewController.generateQuestions)

export default router