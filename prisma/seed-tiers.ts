import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function seedSponsorshipTiers() {
  const tiers = [
    {
      name: 'free',
      displayName: 'Free',
      price: 0,
      benefits: ['Basic profile', 'Apply to jobs', 'Basic messaging']
    },
    {
      name: 'bronze',
      displayName: 'Bronze',
      price: 5000,
      benefits: ['Priority support', 'Featured profile', 'Advanced analytics', '10 job applications/month']
    },
    {
      name: 'silver',
      displayName: 'Silver',
      price: 15000,
      benefits: ['All Bronze benefits', 'Premium badge', 'Unlimited applications', 'Portfolio showcase']
    },
    {
      name: 'gold',
      displayName: 'Gold',
      price: 30000,
      benefits: ['All Silver benefits', 'Top search ranking', 'Direct client contact', 'Custom branding']
    },
    {
      name: 'platinum',
      displayName: 'Platinum',
      price: 50000,
      benefits: ['All Gold benefits', 'Dedicated account manager', 'API access', 'White-label options']
    }
  ]

  for (const tier of tiers) {
    await prisma.sponsorshipTier.upsert({
      where: { name: tier.name },
      update: tier,
      create: tier
    })
  }

  console.log('Sponsorship tiers seeded successfully')
}

seedSponsorshipTiers()
  .catch(console.error)
  .finally(() => prisma.$disconnect())