import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function seedChallenges() {
  // Get a user to be the creator
  const creator = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
  if (!creator) {
    console.log('No admin user found. Please create an admin user first.')
    return
  }

  const challenges = [
    {
      title: 'Build a Todo App',
      description: 'Create a full-stack todo application with CRUD operations',
      requirements: 'React/Vue/Angular frontend, REST API backend, Database integration',
      difficultyLevel: 'BEGINNER',
      category: 'Web Development',
      maxParticipants: 100,
      registrationStart: new Date('2024-01-01'),
      registrationEnd: new Date('2024-12-31'),
      submissionStart: new Date('2024-01-01'),
      submissionEnd: new Date('2024-12-31'),
      judgingEnd: new Date('2024-12-31'),
      status: 'ACTIVE',
      totalPrizePool: 50000,
      createdBy: creator.id,
      tags: ['react', 'nodejs', 'database']
    },
    {
      title: 'E-commerce API Challenge',
      description: 'Design and implement a RESTful API for an e-commerce platform',
      requirements: 'User authentication, Product management, Order processing, Payment integration',
      difficultyLevel: 'INTERMEDIATE',
      category: 'Backend Development',
      maxParticipants: 50,
      registrationStart: new Date('2024-01-01'),
      registrationEnd: new Date('2024-12-31'),
      submissionStart: new Date('2024-01-01'),
      submissionEnd: new Date('2024-12-31'),
      judgingEnd: new Date('2024-12-31'),
      status: 'ACTIVE',
      totalPrizePool: 100000,
      createdBy: creator.id,
      tags: ['api', 'ecommerce', 'backend']
    },
    {
      title: 'Mobile App UI/UX Design',
      description: 'Create a modern mobile app design with excellent user experience',
      requirements: 'Figma/Sketch designs, User flow diagrams, Responsive design, Accessibility considerations',
      difficultyLevel: 'INTERMEDIATE',
      category: 'Design',
      maxParticipants: 75,
      registrationStart: new Date('2024-01-01'),
      registrationEnd: new Date('2024-12-31'),
      submissionStart: new Date('2024-01-01'),
      submissionEnd: new Date('2024-12-31'),
      judgingEnd: new Date('2024-12-31'),
      status: 'ACTIVE',
      totalPrizePool: 75000,
      createdBy: creator.id,
      tags: ['design', 'mobile', 'ux']
    }
  ]

  for (const challenge of challenges) {
    const existing = await prisma.challenge.findFirst({
      where: { title: challenge.title }
    })
    
    if (!existing) {
      await prisma.challenge.create({ data: challenge })
    }
  }

  console.log('Challenges seeded successfully')
}

seedChallenges()
  .catch(console.error)
  .finally(() => prisma.$disconnect())