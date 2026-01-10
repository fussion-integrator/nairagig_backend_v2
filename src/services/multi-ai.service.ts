// services/multi-ai.service.ts
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'

export class MultiAIService {
  private openai: OpenAI
  private gemini: GoogleGenerativeAI
  
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    this.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  }

  async generateQuestions(config: any): Promise<any[]> {
    // Try free options first
    try {
      return await this.generateWithGemini(config)
    } catch (error) {
      console.log('Gemini failed, trying OpenAI...')
      
      try {
        return await this.generateWithOpenAI(config)
      } catch (error) {
        console.log('OpenAI failed, using fallback...')
        return this.getFallbackQuestions(config)
      }
    }
  }

  private async generateWithGemini(config: any) {
    const model = this.gemini.getGenerativeModel({ model: 'gemini-pro' })
    const prompt = this.buildPrompt(config)
    
    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()
    
    return JSON.parse(text)
  }

  private async generateWithOpenAI(config: any) {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo', // Cheaper option
      messages: [
        { role: 'system', content: 'Generate interview questions...' },
        { role: 'user', content: this.buildPrompt(config) }
      ],
      temperature: 0.7,
      max_tokens: 2000
    })

    return JSON.parse(response.choices[0].message.content || '[]')
  }

  private buildPrompt(config: any): string {
    // Same prompt building logic
    return `Generate ${config.questionCount} interview questions...`
  }

  private getFallbackQuestions(config: any) {
    // Your existing fallback questions
    return []
  }
}