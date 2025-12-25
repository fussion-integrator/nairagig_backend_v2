import { PrismaClient, BudgetType, ExperienceLevel, JobStatus, JobVisibility } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get first user and category
  const user = await prisma.user.findFirst();
  const category = await prisma.category.findFirst();

  if (!user || !category) {
    console.log('No user or category found. Please create users and categories first.');
    return;
  }

  const jobs = [
    {
      title: 'Full Stack Developer for E-commerce Platform',
      description: 'We need an experienced full stack developer to build a modern e-commerce platform with payment integration.',
      budgetType: BudgetType.FIXED,
      budgetMin: 500000,
      budgetMax: 800000,
      estimatedDuration: 90, // 3 months in days
      experienceLevel: ExperienceLevel.EXPERT,
      requiredSkills: ['React', 'Node.js', 'PostgreSQL', 'Payment Integration'],
      status: JobStatus.OPEN,
      visibility: JobVisibility.PUBLIC,
      clientId: user.id,
      categoryId: category.id,
    },
    {
      title: 'Mobile App Developer (React Native)',
      description: 'Looking for a skilled React Native developer to create a cross-platform mobile application.',
      budgetType: BudgetType.HOURLY,
      budgetMin: 5000,
      budgetMax: 10000,
      estimatedDuration: 60, // 2 months in days
      experienceLevel: ExperienceLevel.INTERMEDIATE,
      requiredSkills: ['React Native', 'JavaScript', 'Mobile Development'],
      status: JobStatus.OPEN,
      visibility: JobVisibility.PUBLIC,
      clientId: user.id,
      categoryId: category.id,
    },
    {
      title: 'UI/UX Designer for SaaS Product',
      description: 'We are seeking a talented UI/UX designer to redesign our SaaS product interface.',
      budgetType: BudgetType.FIXED,
      budgetMin: 200000,
      budgetMax: 350000,
      estimatedDuration: 30, // 1 month in days
      experienceLevel: ExperienceLevel.INTERMEDIATE,
      requiredSkills: ['Figma', 'UI Design', 'UX Research', 'Prototyping'],
      status: JobStatus.OPEN,
      visibility: JobVisibility.PUBLIC,
      clientId: user.id,
      categoryId: category.id,
    },
    {
      title: 'Content Writer for Tech Blog',
      description: 'Need a skilled content writer to create engaging articles for our technology blog.',
      budgetType: BudgetType.HOURLY,
      budgetMin: 2000,
      budgetMax: 4000,
      estimatedDuration: 180, // 6 months in days
      experienceLevel: ExperienceLevel.ENTRY,
      requiredSkills: ['Content Writing', 'SEO', 'Technical Writing'],
      status: JobStatus.OPEN,
      visibility: JobVisibility.PUBLIC,
      clientId: user.id,
      categoryId: category.id,
    },
    {
      title: 'Digital Marketing Specialist',
      description: 'Looking for a digital marketing expert to manage our social media and ad campaigns.',
      budgetType: BudgetType.FIXED,
      budgetMin: 150000,
      budgetMax: 250000,
      estimatedDuration: 90, // 3 months in days
      experienceLevel: ExperienceLevel.INTERMEDIATE,
      requiredSkills: ['Social Media Marketing', 'Google Ads', 'Facebook Ads', 'Analytics'],
      status: JobStatus.OPEN,
      visibility: JobVisibility.PUBLIC,
      clientId: user.id,
      categoryId: category.id,
    },
  ];

  for (const job of jobs) {
    await prisma.job.create({ data: job });
  }

  console.log('✅ Sample jobs created successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
