import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const categories = [
  // Technology & Programming
  { name: 'Web Development', description: 'Frontend, backend, and full-stack web development', icon: '💻' },
  { name: 'Mobile App Development', description: 'iOS, Android, and cross-platform mobile applications', icon: '📱' },
  { name: 'Software Development', description: 'Desktop applications, enterprise software, and system development', icon: '⚙️' },
  { name: 'Data Science & Analytics', description: 'Data analysis, machine learning, and business intelligence', icon: '📊' },
  { name: 'DevOps & Cloud', description: 'Cloud infrastructure, deployment, and system administration', icon: '☁️' },
  { name: 'Cybersecurity', description: 'Security audits, penetration testing, and security consulting', icon: '🔒' },
  { name: 'Database Administration', description: 'Database design, optimization, and management', icon: '🗄️' },
  { name: 'Game Development', description: 'Video game development, game design, and interactive media', icon: '🎮' },
  { name: 'Blockchain & Cryptocurrency', description: 'Smart contracts, DeFi, and blockchain development', icon: '⛓️' },
  { name: 'AI & Machine Learning', description: 'Artificial intelligence, neural networks, and automation', icon: '🤖' },

  // Design & Creative
  { name: 'Graphic Design', description: 'Logo design, branding, and visual identity', icon: '🎨' },
  { name: 'UI/UX Design', description: 'User interface and user experience design', icon: '📐' },
  { name: 'Web Design', description: 'Website design, landing pages, and responsive design', icon: '🌐' },
  { name: 'Video Production', description: 'Video editing, motion graphics, and animation', icon: '🎬' },
  { name: 'Photography', description: 'Product photography, portraits, and event photography', icon: '📸' },
  { name: 'Illustration', description: 'Digital illustration, character design, and artwork', icon: '✏️' },
  { name: '3D Modeling & Animation', description: '3D design, modeling, and animation services', icon: '🎭' },
  { name: 'Print Design', description: 'Brochures, business cards, and print materials', icon: '🖨️' },
  { name: 'Fashion Design', description: 'Clothing design, pattern making, and fashion consulting', icon: '👗' },
  { name: 'Interior Design', description: 'Space planning, interior decoration, and design consulting', icon: '🏠' },

  // Writing & Content
  { name: 'Content Writing', description: 'Blog posts, articles, and web content', icon: '✍️' },
  { name: 'Copywriting', description: 'Sales copy, marketing materials, and advertising content', icon: '📝' },
  { name: 'Technical Writing', description: 'Documentation, manuals, and technical content', icon: '📋' },
  { name: 'Creative Writing', description: 'Fiction, poetry, and creative content', icon: '📚' },
  { name: 'Translation', description: 'Language translation and localization services', icon: '🌍' },
  { name: 'Editing & Proofreading', description: 'Content editing, proofreading, and quality assurance', icon: '🔍' },
  { name: 'Scriptwriting', description: 'Video scripts, screenplays, and dialogue writing', icon: '🎞️' },
  { name: 'Grant Writing', description: 'Grant proposals and funding applications', icon: '💰' },

  // Marketing & Sales
  { name: 'Digital Marketing', description: 'Online marketing strategies and campaign management', icon: '📈' },
  { name: 'Social Media Marketing', description: 'Social media strategy, content, and management', icon: '📱' },
  { name: 'SEO & SEM', description: 'Search engine optimization and marketing', icon: '🔍' },
  { name: 'Email Marketing', description: 'Email campaigns, newsletters, and automation', icon: '📧' },
  { name: 'Content Marketing', description: 'Content strategy, creation, and distribution', icon: '📊' },
  { name: 'Brand Strategy', description: 'Brand development, positioning, and strategy', icon: '🎯' },
  { name: 'Market Research', description: 'Consumer research, surveys, and market analysis', icon: '📋' },
  { name: 'Sales Funnel Optimization', description: 'Conversion optimization and sales process improvement', icon: '⚡' },

  // Business & Finance
  { name: 'Business Consulting', description: 'Strategy consulting, process improvement, and advisory', icon: '💼' },
  { name: 'Financial Planning', description: 'Financial analysis, budgeting, and investment planning', icon: '💰' },
  { name: 'Accounting & Bookkeeping', description: 'Financial records, tax preparation, and accounting services', icon: '🧮' },
  { name: 'Project Management', description: 'Project planning, coordination, and delivery', icon: '📊' },
  { name: 'Business Plan Writing', description: 'Business plans, proposals, and strategic documents', icon: '📈' },
  { name: 'Legal Services', description: 'Legal consulting, contract review, and compliance', icon: '⚖️' },
  { name: 'HR & Recruitment', description: 'Human resources, talent acquisition, and HR consulting', icon: '👥' },
  { name: 'Virtual Assistant', description: 'Administrative support, scheduling, and task management', icon: '🗂️' },

  // Education & Training
  { name: 'Online Tutoring', description: 'Academic tutoring and educational support', icon: '🎓' },
  { name: 'Course Creation', description: 'Online course development and educational content', icon: '📚' },
  { name: 'Training & Development', description: 'Corporate training, workshops, and skill development', icon: '🏆' },
  { name: 'Language Teaching', description: 'Language instruction and conversation practice', icon: '🗣️' },
  { name: 'Educational Consulting', description: 'Curriculum development and educational strategy', icon: '📖' },
  { name: 'Test Preparation', description: 'Exam preparation and academic coaching', icon: '📝' },

  // Health & Wellness
  { name: 'Fitness Training', description: 'Personal training, workout plans, and fitness coaching', icon: '💪' },
  { name: 'Nutrition Consulting', description: 'Diet planning, nutrition advice, and meal planning', icon: '🥗' },
  { name: 'Mental Health Support', description: 'Counseling, therapy, and wellness coaching', icon: '🧠' },
  { name: 'Medical Writing', description: 'Healthcare content, medical documentation, and research', icon: '🏥' },
  { name: 'Wellness Coaching', description: 'Life coaching, wellness programs, and personal development', icon: '🌱' },

  // Engineering & Architecture
  { name: 'Civil Engineering', description: 'Structural design, construction planning, and engineering consulting', icon: '🏗️' },
  { name: 'Mechanical Engineering', description: 'Product design, mechanical systems, and engineering analysis', icon: '⚙️' },
  { name: 'Electrical Engineering', description: 'Electrical systems, circuit design, and power systems', icon: '⚡' },
  { name: 'Architecture', description: 'Building design, architectural planning, and space design', icon: '🏛️' },
  { name: 'CAD Design', description: 'Computer-aided design, technical drawings, and 3D modeling', icon: '📐' },

  // Music & Audio
  { name: 'Music Production', description: 'Audio production, mixing, and mastering', icon: '🎵' },
  { name: 'Voice Over', description: 'Voice acting, narration, and audio recording', icon: '🎤' },
  { name: 'Sound Design', description: 'Audio effects, soundtracks, and audio branding', icon: '🔊' },
  { name: 'Music Composition', description: 'Original music, jingles, and musical arrangements', icon: '🎼' },

  // Lifestyle & Personal
  { name: 'Event Planning', description: 'Event coordination, party planning, and event management', icon: '🎉' },
  { name: 'Travel Planning', description: 'Trip planning, travel consulting, and itinerary creation', icon: '✈️' },
  { name: 'Personal Shopping', description: 'Shopping assistance, styling, and product sourcing', icon: '🛍️' },
  { name: 'Pet Care', description: 'Pet sitting, training, and animal care services', icon: '🐕' },
  { name: 'Home Services', description: 'Cleaning, maintenance, and household assistance', icon: '🏠' },

  // Specialized Services
  { name: 'Research Services', description: 'Academic research, market research, and data collection', icon: '🔬' },
  { name: 'Quality Assurance', description: 'Testing, quality control, and process improvement', icon: '✅' },
  { name: 'Customer Service', description: 'Customer support, chat support, and service management', icon: '📞' },
  { name: 'Data Entry', description: 'Data processing, transcription, and administrative tasks', icon: '⌨️' },
  { name: 'Survey & Feedback', description: 'Survey creation, data collection, and feedback analysis', icon: '📊' },

  // Agriculture & Environment
  { name: 'Agricultural Consulting', description: 'Farming advice, crop management, and agricultural planning', icon: '🌾' },
  { name: 'Environmental Consulting', description: 'Sustainability consulting, environmental impact assessment', icon: '🌍' },
  { name: 'Renewable Energy', description: 'Solar, wind, and renewable energy consulting', icon: '🔋' },

  // Manufacturing & Production
  { name: 'Product Design', description: 'Industrial design, product development, and prototyping', icon: '🔧' },
  { name: 'Supply Chain Management', description: 'Logistics, procurement, and supply chain optimization', icon: '🚚' },
  { name: 'Quality Control', description: 'Manufacturing quality assurance and process control', icon: '🔍' },

  // Real Estate & Property
  { name: 'Real Estate Services', description: 'Property management, real estate consulting, and valuation', icon: '🏘️' },
  { name: 'Property Management', description: 'Rental management, maintenance coordination, and tenant services', icon: '🏢' },

  // Transportation & Logistics
  { name: 'Logistics Consulting', description: 'Transportation planning, logistics optimization, and delivery services', icon: '📦' },
  { name: 'Fleet Management', description: 'Vehicle management, route optimization, and transportation services', icon: '🚛' }
];

async function seedCategories() {
  console.log('🌱 Seeding categories...');
  
  try {
    // Clear existing categories
    await prisma.category.deleteMany();
    console.log('🗑️ Cleared existing categories');

    // Insert new categories
    const createdCategories = await prisma.category.createMany({
      data: categories,
      skipDuplicates: true
    });

    console.log(`✅ Created ${createdCategories.count} categories`);
    
    // Fetch and display created categories
    const allCategories = await prisma.category.findMany({
      orderBy: { name: 'asc' }
    });
    
    console.log('\n📋 Categories created:');
    allCategories.forEach((category, index) => {
      console.log(`${index + 1}. ${category.icon} ${category.name} - ${category.description}`);
    });
    
  } catch (error) {
    console.error('❌ Error seeding categories:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  seedCategories()
    .then(() => {
      console.log('🎉 Category seeding completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Category seeding failed:', error);
      process.exit(1);
    });
}

export { seedCategories };