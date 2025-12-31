import OpenAI from 'openai'

interface InterviewConfig {
  jobTitle: string
  company: string
  experienceLevel: string
  difficulty: string
  duration: string
  focusAreas: string[]
  customPrompt: string
  interviewType: string
  questionCount: string
}

interface GeneratedQuestion {
  id: string
  text: string
  category: string
  difficulty: string
  expectedTime: number
  followUpQuestions?: string[]
  evaluationCriteria: string[]
}

export class AIInterviewService {
  private openai: OpenAI

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  }

  async generateQuestions(config: InterviewConfig): Promise<GeneratedQuestion[]> {
    const prompt = this.buildPrompt(config)
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an expert interview coach and HR professional. Generate realistic, relevant interview questions based on the provided job details. Always return valid JSON array with exactly the requested number of questions.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 4000 // Increased for more questions
      })

      const content = response.choices[0].message.content
      if (!content) {
        throw new Error('No content received from OpenAI')
      }

      // Clean the response to ensure it's valid JSON
      const cleanContent = content.replace(/```json\n?|```\n?/g, '').trim()
      const questionsData = JSON.parse(cleanContent)
      
      if (!Array.isArray(questionsData)) {
        throw new Error('Response is not an array')
      }

      const formattedQuestions = this.formatQuestions(questionsData)
      
      // Ensure we have the exact number requested
      const requestedCount = parseInt(config.questionCount)
      if (formattedQuestions.length < requestedCount) {
        // If AI didn't generate enough, supplement with fallback
        const fallbackQuestions = this.getFallbackQuestions(config)
        const combined = [...formattedQuestions, ...fallbackQuestions]
        return combined.slice(0, requestedCount)
      }
      
      return formattedQuestions.slice(0, requestedCount)
    } catch (error) {
      console.error('AI question generation failed:', error)
      return this.getFallbackQuestions(config)
    }
  }

  private buildPrompt(config: InterviewConfig): string {
    const focusAreasText = config.focusAreas.length > 0 ? config.focusAreas.join(', ') : 'general skills'
    const customText = config.customPrompt ? `\nAdditional Requirements: ${config.customPrompt}` : ''
    
    return `Generate exactly ${config.questionCount} interview questions for the following position:

**Job Details:**
- Position: ${config.jobTitle}
- Company: ${config.company || 'General company'}
- Experience Level: ${config.experienceLevel} (entry/intermediate/senior/executive)
- Interview Type: ${config.interviewType} (behavioral/technical/case-study/mixed)
- Difficulty Level: ${config.difficulty} (easy/medium/hard/expert)
- Focus Areas: ${focusAreasText}${customText}

**Requirements:**
1. Generate EXACTLY ${config.questionCount} questions
2. Questions must be relevant to ${config.jobTitle} role
3. Match ${config.difficulty} difficulty level
4. Include variety of ${config.interviewType} questions
5. Focus on: ${focusAreasText}
6. Expected answer time: 60-300 seconds per question

**Return Format (Valid JSON Array):**
[
  {
    "text": "Your specific interview question here?",
    "category": "behavioral|technical|situational|closing",
    "difficulty": "easy|medium|hard",
    "expectedTime": 120,
    "evaluationCriteria": ["criteria1", "criteria2", "criteria3"]
  }
]

**Question Distribution:**
- ${config.interviewType === 'behavioral' ? '80% behavioral, 20% situational' : 
   config.interviewType === 'technical' ? '70% technical, 30% behavioral' :
   config.interviewType === 'case-study' ? '60% case-study, 40% behavioral' :
   '40% behavioral, 30% technical, 20% situational, 10% closing'}

Generate ${config.questionCount} unique, relevant questions now:`
  }

  private formatQuestions(questionsData: any[]): GeneratedQuestion[] {
    return questionsData.map((q, index) => ({
      id: `ai-${Date.now()}-${index}`,
      text: q.text,
      category: q.category,
      difficulty: q.difficulty,
      expectedTime: q.expectedTime || 120,
      evaluationCriteria: q.evaluationCriteria || []
    }))
  }

  private getFallbackQuestions(config: InterviewConfig): GeneratedQuestion[] {
    const questionCount = parseInt(config.questionCount) || 10
    
    const baseQuestions = [
      {
        text: `Tell me about yourself and your experience with ${config.jobTitle} roles.`,
        category: 'behavioral',
        difficulty: 'easy',
        expectedTime: 120,
        evaluationCriteria: ['Relevant experience', 'Communication skills']
      },
      {
        text: `Describe a challenging project you worked on in your ${config.experienceLevel} career.`,
        category: 'behavioral', 
        difficulty: 'medium',
        expectedTime: 180,
        evaluationCriteria: ['Problem-solving', 'Technical depth']
      },
      {
        text: `How do you handle tight deadlines and pressure in ${config.jobTitle} work?`,
        category: 'behavioral',
        difficulty: 'medium', 
        expectedTime: 150,
        evaluationCriteria: ['Stress management', 'Time management']
      },
      {
        text: `What interests you most about working at ${config.company || 'this company'}?`,
        category: 'behavioral',
        difficulty: 'easy',
        expectedTime: 120,
        evaluationCriteria: ['Company research', 'Motivation']
      },
      {
        text: `Describe your approach to ${config.focusAreas[0] || 'teamwork'} in professional settings.`,
        category: 'behavioral',
        difficulty: 'medium',
        expectedTime: 160,
        evaluationCriteria: ['Soft skills', 'Examples']
      },
      {
        text: `Tell me about a time you had to learn a new technology or skill quickly.`,
        category: 'behavioral',
        difficulty: 'medium',
        expectedTime: 180,
        evaluationCriteria: ['Learning ability', 'Adaptability']
      },
      {
        text: `How do you stay updated with industry trends in ${config.jobTitle}?`,
        category: 'behavioral',
        difficulty: 'easy',
        expectedTime: 120,
        evaluationCriteria: ['Continuous learning', 'Industry knowledge']
      },
      {
        text: `Describe a situation where you had to work with a difficult team member.`,
        category: 'behavioral',
        difficulty: 'medium',
        expectedTime: 180,
        evaluationCriteria: ['Conflict resolution', 'Interpersonal skills']
      },
      {
        text: `What are your career goals for the next 3-5 years?`,
        category: 'behavioral',
        difficulty: 'easy',
        expectedTime: 150,
        evaluationCriteria: ['Career planning', 'Ambition']
      },
      {
        text: `Tell me about a mistake you made and how you handled it.`,
        category: 'behavioral',
        difficulty: 'medium',
        expectedTime: 180,
        evaluationCriteria: ['Self-awareness', 'Learning from mistakes']
      },
      {
        text: `How would you prioritize multiple urgent tasks in ${config.jobTitle}?`,
        category: 'situational',
        difficulty: 'medium',
        expectedTime: 160,
        evaluationCriteria: ['Prioritization', 'Decision making']
      },
      {
        text: `Describe your experience with ${config.focusAreas[1] || 'problem solving'}.`,
        category: 'behavioral',
        difficulty: 'medium',
        expectedTime: 170,
        evaluationCriteria: ['Specific skills', 'Real examples']
      },
      {
        text: `What motivates you in your ${config.jobTitle} work?`,
        category: 'behavioral',
        difficulty: 'easy',
        expectedTime: 120,
        evaluationCriteria: ['Motivation', 'Passion']
      },
      {
        text: `How do you handle feedback and criticism?`,
        category: 'behavioral',
        difficulty: 'medium',
        expectedTime: 150,
        evaluationCriteria: ['Growth mindset', 'Professionalism']
      },
      {
        text: `Tell me about a time you exceeded expectations in your role.`,
        category: 'behavioral',
        difficulty: 'medium',
        expectedTime: 180,
        evaluationCriteria: ['Achievement', 'Initiative']
      },
      {
        text: `How do you ensure quality in your ${config.jobTitle} deliverables?`,
        category: 'technical',
        difficulty: 'medium',
        expectedTime: 160,
        evaluationCriteria: ['Quality assurance', 'Attention to detail']
      },
      {
        text: `Describe a time when you had to make a decision with incomplete information.`,
        category: 'situational',
        difficulty: 'hard',
        expectedTime: 200,
        evaluationCriteria: ['Decision making', 'Risk assessment']
      },
      {
        text: `How would you approach onboarding to a new ${config.jobTitle} team?`,
        category: 'situational',
        difficulty: 'medium',
        expectedTime: 150,
        evaluationCriteria: ['Integration', 'Proactivity']
      },
      {
        text: `What questions do you have about this ${config.jobTitle} role or our company?`,
        category: 'closing',
        difficulty: 'easy',
        expectedTime: 120,
        evaluationCriteria: ['Curiosity', 'Preparation']
      },
      {
        text: `Why should we hire you for this ${config.jobTitle} position?`,
        category: 'closing',
        difficulty: 'medium',
        expectedTime: 180,
        evaluationCriteria: ['Self-promotion', 'Value proposition']
      }
    ]
    
    // Shuffle and select the requested number of questions
    const shuffled = baseQuestions.sort(() => 0.5 - Math.random())
    const selectedQuestions = shuffled.slice(0, questionCount)
    
    return selectedQuestions.map((q, index) => ({
      id: `fallback-${Date.now()}-${index}`,
      text: q.text,
      category: q.category,
      difficulty: q.difficulty,
      expectedTime: q.expectedTime,
      evaluationCriteria: q.evaluationCriteria
    }))
  }
}