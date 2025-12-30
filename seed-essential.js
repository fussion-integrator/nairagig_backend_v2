const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedEssentialData() {
  try {
    // Clear existing data first
    await prisma.skill.deleteMany({});
    await prisma.category.deleteMany({});

    // Categories
    await prisma.category.createMany({
      data: [
        { name: 'Technology', description: 'Tech-related services' },
        { name: 'Design', description: 'Creative design services' },
        { name: 'Writing', description: 'Content and copywriting' },
        { name: 'Marketing', description: 'Digital marketing services' },
        { name: 'Business', description: 'Business consulting' }
      ]
    });

    // Skills
    await prisma.skill.createMany({
      data: [
        { name: 'JavaScript' }, { name: 'Python' }, { name: 'React' },
        { name: 'Node.js' }, { name: 'Graphic Design' }, { name: 'UI/UX' },
        { name: 'Content Writing' }, { name: 'SEO' }, { name: 'Social Media' }
      ]
    });

    console.log('Essential data seeded successfully');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedEssentialData();