import { Request, Response, NextFunction } from 'express'
import { AIInterviewService } from '../services/ai-interview.service'

export class InterviewController {
  private aiService: AIInterviewService

  constructor() {
    this.aiService = new AIInterviewService()
  }

  generateQuestions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const config = req.body
      
      // Validate required fields
      if (!config.jobTitle || !config.questionCount) {
        return res.status(400).json({
          success: false,
          error: 'Job title and question count are required'
        })
      }

      const questions = await this.aiService.generateQuestions(config)
      
      res.json({
        success: true,
        data: {
          questions,
          config,
          generatedAt: new Date().toISOString()
        }
      })
    } catch (error) {
      console.error('Generate questions error:', error)
      next(error)
    }
  }
}