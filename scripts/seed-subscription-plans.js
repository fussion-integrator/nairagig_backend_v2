const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const subscriptionPlans = [
  {
    name: 'free',
    displayName: 'Free',
    description: 'Get started with basic features',
    price: 0,
    currency: 'NGN',
    billingCycle: 'MONTHLY',
    features: [
      'Up to 2 job applications per month',
      'Basic profile visibility',
      'Community support',
      'Access to public resources'
    ],
    limits: {
      jobApplications: 2,
      profileBoost: false,
      prioritySupport: false
    },
    isActive: true,
    trialDays: 0,
    sortOrder: 0
  },
  {
    name: 'basic',
    displayName: 'Basic',
    description: 'Perfect for getting started',
    price: 2500,
    currency: 'NGN',
    billingCycle: 'MONTHLY',
    features: [
      'Up to 5 job applications per month',
      'Basic profile visibility',
      'Standard support',
      'Access to public challenges'
    ],
    limits: {
      jobApplications: 5,
      profileBoost: false,
      prioritySupport: false
    },
    isActive: true,
    trialDays: 0,
    sortOrder: 1
  },
  {
    name: 'pro',
    displayName: 'Professional',
    description: 'Best for active freelancers',
    price: 7500,
    currency: 'NGN',
    billingCycle: 'MONTHLY',
    features: [
      'Unlimited job applications',
      'Priority profile visibility',
      'Advanced analytics',
      'Priority support',
      'Access to premium challenges',
      'Featured in search results',
      'Custom portfolio themes'
    ],
    limits: {
      jobApplications: -1,
      profileBoost: true,
      prioritySupport: true,
      premiumChallenges: true
    },
    isActive: true,
    trialDays: 7,
    sortOrder: 2
  },
  {
    name: 'enterprise',
    displayName: 'Enterprise',
    description: 'For teams and agencies',
    price: 15000,
    currency: 'NGN',
    billingCycle: 'MONTHLY',
    features: [
      'Everything in Professional',
      'Team collaboration tools',
      'White-label solutions',
      'Dedicated account manager',
      'Custom integrations',
      'Advanced reporting',
      'SLA guarantee'
    ],
    limits: {
      jobApplications: -1,
      profileBoost: true,
      prioritySupport: true,
      premiumChallenges: true,
      teamTools: true,
      dedicatedSupport: true
    },
    isActive: true,
    trialDays: 14,
    sortOrder: 3
  }
]

async function seedSubscriptionPlans() {
  try {
    console.log('Seeding subscription plans...')
    
    for (const plan of subscriptionPlans) {
      await prisma.subscriptionPlan.upsert({
        where: { name: plan.name },
        update: plan,
        create: plan
      })
      console.log(`✓ Created/updated plan: ${plan.displayName}`)
    }
    
    console.log('✅ Subscription plans seeded successfully!')
  } catch (error) {
    console.error('❌ Error seeding subscription plans:', error)
  } finally {
    await prisma.$disconnect()
  }
}

seedSubscriptionPlans()