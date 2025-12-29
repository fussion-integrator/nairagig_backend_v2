import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function seedChallengeParticipations() {
  // Get all users and challenges
  const users = await prisma.user.findMany({ where: { status: 'ACTIVE' } })
  const challenges = await prisma.challenge.findMany({ where: { status: 'ACTIVE' } })

  if (users.length === 0 || challenges.length === 0) {
    console.log('No users or challenges found. Please seed users and challenges first.')
    return
  }

  const participations = []
  const statuses = ['REGISTERED', 'ACTIVE', 'SUBMITTED', 'WINNER']
  
  // Create realistic participation data
  for (const user of users) {
    // Each user participates in 1-3 challenges
    const numParticipations = Math.floor(Math.random() * 3) + 1
    const userChallenges = challenges.sort(() => 0.5 - Math.random()).slice(0, numParticipations)
    
    for (const challenge of userChallenges) {
      const status = statuses[Math.floor(Math.random() * statuses.length)]
      
      // Create participation dates within the last 60 days
      const registeredAt = new Date(Date.now() - Math.floor(Math.random() * 60) * 24 * 60 * 60 * 1000)
      
      participations.push({
        userId: user.id,
        challengeId: challenge.id,
        status,
        registeredAt,
        entryFeePaid: true
      })
    }
  }

  // Insert participations
  for (const participation of participations) {
    const existing = await prisma.challengeParticipant.findFirst({
      where: {
        userId: participation.userId,
        challengeId: participation.challengeId
      }
    })
    
    if (!existing) {
      await prisma.challengeParticipant.create({ data: participation })
    }
  }

  // Create some submissions for participants with SUBMITTED or WINNER status
  const submittedParticipants = await prisma.challengeParticipant.findMany({
    where: {
      status: { in: ['SUBMITTED', 'WINNER'] }
    }
  })

  for (const participant of submittedParticipants) {
    const existing = await prisma.challengeSubmission.findFirst({
      where: {
        challengeId: participant.challengeId,
        participantId: participant.id
      }
    })
    
    if (!existing) {
      const score = Math.floor(Math.random() * 40) + 60 // 60-100
      await prisma.challengeSubmission.create({
        data: {
          challengeId: participant.challengeId,
          participantId: participant.id,
          submissionUrl: `https://github.com/user/${participant.userId}/challenge-${participant.challengeId}`,
          description: 'Challenge submission with complete implementation',
          status: 'SUBMITTED',
          totalScore: score,
          isWinner: participant.status === 'WINNER'
        }
      })
    }
  }

  // Update user experience points based on submissions
  for (const user of users) {
    const userSubmissions = await prisma.challengeSubmission.findMany({
      where: {
        participant: {
          userId: user.id
        }
      },
      include: {
        challenge: true
      }
    })

    const totalPoints = userSubmissions.reduce((sum, submission) => {
      // Award points based on score: 60-79 = 50 points, 80-89 = 100 points, 90+ = 150 points
      let points = 0
      if (submission.totalScore >= 90) points = 150
      else if (submission.totalScore >= 80) points = 100
      else if (submission.totalScore >= 60) points = 50
      return sum + points
    }, 0)

    if (totalPoints > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          experiencePoints: totalPoints,
          level: Math.floor(totalPoints / 100) + 1
        }
      })
    }
  }

  console.log(`Created ${participations.length} challenge participations`)
  console.log('Updated user experience points and levels')
}

seedChallengeParticipations()
  .catch(console.error)
  .finally(() => prisma.$disconnect())