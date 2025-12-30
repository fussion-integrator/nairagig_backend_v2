const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Create default sponsorship tier
  await prisma.sponsorshipTier.create({
    data: {
      name: 'free',
      displayName: 'Free Tier',
      price: 0,
      benefits: ['Basic features'],
      isActive: true
    }
  });

  // Categories
  await prisma.category.createMany({
    data: [
      { name: 'Technology', description: 'Tech-related services' },
      { name: 'Design', description: 'Creative design services' },
      { name: 'Writing', description: 'Content and copywriting' },
      { name: 'Marketing', description: 'Digital marketing services' },
      { name: 'Business', description: 'Business consulting' }
    ],
    skipDuplicates: true
  });

  console.log('Essential data seeded successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });