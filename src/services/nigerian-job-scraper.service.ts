export class NigerianJobScraper {
  async scrapeHotNigerianJobs(keywords?: string): Promise<any[]> {
    try {
      // For now, return mock Nigerian jobs since web scraping requires more setup
      return this.getMockNigerianJobs(keywords);
    } catch (error) {
      console.error('Hot Nigerian Jobs scraping error:', error);
      return this.getMockNigerianJobs(keywords);
    }
  }

  async scrapeJobbermannJobs(keywords?: string): Promise<any[]> {
    try {
      return this.getMockJobbermannJobs(keywords);
    } catch (error) {
      console.error('Jobberman scraping error:', error);
      return this.getMockJobbermannJobs(keywords);
    }
  }

  private extractSkillsFromTitle(title: string): string[] {
    const skills: string[] = [];
    const titleLower = title.toLowerCase();

    const skillMap = {
      'flutter': ['Flutter', 'Dart'],
      'react': ['React', 'JavaScript'],
      'python': ['Python'],
      'java': ['Java'],
      'php': ['PHP'],
      'node': ['Node.js', 'JavaScript'],
      'angular': ['Angular', 'TypeScript'],
      'vue': ['Vue.js', 'JavaScript'],
      'mobile': ['Mobile Development'],
      'frontend': ['Frontend Development'],
      'backend': ['Backend Development'],
      'fullstack': ['Full Stack Development'],
      'devops': ['DevOps'],
      'data': ['Data Analysis'],
      'marketing': ['Digital Marketing'],
      'sales': ['Sales'],
      'design': ['UI/UX Design']
    };

    Object.entries(skillMap).forEach(([keyword, relatedSkills]) => {
      if (titleLower.includes(keyword)) {
        skills.push(...relatedSkills);
      }
    });

    return [...new Set(skills)];
  }

  private getMockNigerianJobs(keywords?: string): any[] {
    const jobs = [
      {
        id: 'ng-mock-1',
        title: 'Flutter Mobile Developer',
        company: 'Flutterwave',
        location: 'Lagos, Nigeria',
        jobType: 'full-time',
        experienceLevel: 'intermediate',
        salaryMin: 300000,
        salaryMax: 500000,
        currency: 'NGN',
        description: 'Join Flutterwave to build world-class mobile payment solutions using Flutter.',
        requirements: [
          '3+ years Flutter development experience',
          'Experience with payment integrations',
          'Strong Dart programming skills',
          'Knowledge of mobile app architecture'
        ],
        skills: ['Flutter', 'Dart', 'Firebase', 'REST API', 'Git'],
        benefits: ['Health insurance', 'Stock options', 'Remote work', 'Learning budget'],
        applicationUrl: 'https://careers.flutterwave.com/flutter-developer',
        source: 'Nigerian Jobs',
        postedDate: new Date().toISOString().split('T')[0],
        companyInfo: {
          description: 'Flutterwave is a leading African fintech company providing payment infrastructure.',
          website: 'https://flutterwave.com',
          size: '500+ employees'
        }
      },
      {
        id: 'ng-mock-2',
        title: 'Senior React Developer',
        company: 'Paystack',
        location: 'Lagos, Nigeria',
        jobType: 'full-time',
        experienceLevel: 'senior',
        salaryMin: 400000,
        salaryMax: 700000,
        currency: 'NGN',
        description: 'Build scalable web applications for payment processing at Paystack.',
        requirements: [
          '5+ years React development',
          'TypeScript proficiency',
          'Experience with payment systems',
          'Strong problem-solving skills'
        ],
        skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'AWS'],
        benefits: ['Competitive salary', 'Health insurance', 'Equity', 'Professional development'],
        applicationUrl: 'https://paystack.com/careers/react-developer',
        source: 'Nigerian Jobs',
        postedDate: new Date().toISOString().split('T')[0],
        companyInfo: {
          description: 'Paystack helps businesses in Africa get paid by anyone, anywhere in the world.',
          website: 'https://paystack.com',
          size: '200+ employees'
        }
      },
      {
        id: 'ng-mock-3',
        title: 'Product Manager',
        company: 'Konga',
        location: 'Lagos, Nigeria',
        jobType: 'full-time',
        experienceLevel: 'intermediate',
        salaryMin: 250000,
        salaryMax: 400000,
        currency: 'NGN',
        description: 'Drive product strategy and execution for Nigeria\'s leading e-commerce platform.',
        requirements: [
          '3+ years product management experience',
          'E-commerce background preferred',
          'Strong analytical skills',
          'Excellent communication abilities'
        ],
        skills: ['Product Management', 'Analytics', 'Agile', 'User Research'],
        benefits: ['Health insurance', 'Performance bonuses', 'Career growth', 'Flexible hours'],
        applicationUrl: 'https://konga.com/careers/product-manager',
        source: 'Nigerian Jobs',
        postedDate: new Date().toISOString().split('T')[0],
        companyInfo: {
          description: 'Konga is one of Nigeria\'s largest e-commerce platforms.',
          website: 'https://konga.com',
          size: '1000+ employees'
        }
      }
    ];

    if (keywords) {
      return jobs.filter(job => 
        job.title.toLowerCase().includes(keywords.toLowerCase()) ||
        job.skills.some(skill => skill.toLowerCase().includes(keywords.toLowerCase()))
      );
    }

    return jobs;
  }

  private getMockJobbermannJobs(keywords?: string): any[] {
    return [
      {
        id: 'jobberman-1',
        title: 'Software Engineer',
        company: 'Interswitch',
        location: 'Lagos, Nigeria',
        jobType: 'full-time',
        experienceLevel: 'intermediate',
        salaryMin: 350000,
        salaryMax: 550000,
        currency: 'NGN',
        description: 'Join Interswitch to build financial technology solutions for Africa.',
        skills: ['Java', 'Spring Boot', 'Microservices', 'PostgreSQL'],
        applicationUrl: 'https://jobberman.com/job/software-engineer-interswitch',
        source: 'Jobberman',
        postedDate: new Date().toISOString().split('T')[0]
      }
    ];
  }
}