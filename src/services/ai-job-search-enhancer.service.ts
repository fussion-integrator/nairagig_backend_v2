import { AICompanyDiscoveryService } from './ai-company-discovery.service';

interface JobSearchFilters {
  keywords?: string;
  location?: string;
  industry?: string;
  jobType?: string;
  experienceLevel?: string;
  salaryMin?: number;
  salaryMax?: number;
  skills?: string[];
}

interface EnhancedJob {
  id: string;
  title: string;
  company: string;
  location: string;
  jobType: string;
  experienceLevel: string;
  salaryMin?: number;
  salaryMax?: number;
  currency: string;
  description: string;
  requirements: string[];
  skills: string[];
  benefits: string[];
  applicationUrl: string;
  source: string;
  postedDate: string;
  companyInfo: {
    description: string;
    website: string;
    size: string;
  };
  aiScore: number;
  matchReasons: string[];
  extractedSkills: string[];
  industryTags: string[];
}

export class AIJobSearchEnhancer {
  private companyDiscovery: AICompanyDiscoveryService;
  private skillsDatabase: Map<string, string[]> = new Map();
  private industryPatterns: Map<string, RegExp[]> = new Map();

  constructor() {
    this.companyDiscovery = new AICompanyDiscoveryService();
    this.initializeSkillsDatabase();
    this.initializeIndustryPatterns();
  }

  async enhanceJobSearch(filters: JobSearchFilters): Promise<{
    expandedFilters: JobSearchFilters;
    suggestedCompanies: string[];
    relatedSkills: string[];
    searchStrategies: string[];
  }> {
    try {
      // Discover companies using AI
      const companyResults = await this.companyDiscovery.discoverCompanies(
        filters.industry || 'technology',
        filters.location || 'Nigeria',
        filters.keywords
      );

      // Expand search terms using AI
      const expandedKeywords = this.expandSearchKeywords(filters.keywords || '');
      const relatedSkills = this.extractRelatedSkills(filters.skills || [], filters.keywords || '');
      const industryExpansion = this.expandIndustrySearch(filters.industry || '');

      // Generate search strategies
      const searchStrategies = this.generateSearchStrategies(filters, companyResults.companies.length);

      return {
        expandedFilters: {
          ...filters,
          keywords: expandedKeywords.join(' OR '),
          skills: [...(filters.skills || []), ...relatedSkills],
          industry: industryExpansion.join(',')
        },
        suggestedCompanies: companyResults.companies.map(c => c.name),
        relatedSkills,
        searchStrategies
      };
    } catch (error) {
      console.error('AI job search enhancement error:', error);
      return this.getFallbackEnhancement(filters);
    }
  }

  enhanceJobResults(jobs: any[], userProfile?: any): EnhancedJob[] {
    return jobs.map(job => this.enhanceIndividualJob(job, userProfile));
  }

  private enhanceIndividualJob(job: any, userProfile?: any): EnhancedJob {
    // Extract skills using AI
    const extractedSkills = this.extractSkillsFromText(job.description + ' ' + job.title);
    
    // Determine industry tags
    const industryTags = this.determineIndustryTags(job.title, job.description, job.company);
    
    // Calculate AI matching score
    const aiScore = this.calculateMatchingScore(job, userProfile, extractedSkills);
    
    // Generate match reasons
    const matchReasons = this.generateMatchReasons(job, userProfile, extractedSkills);

    return {
      ...job,
      extractedSkills,
      industryTags,
      aiScore,
      matchReasons
    };
  }

  private expandSearchKeywords(keywords: string): string[] {
    if (!keywords) return [];

    const expanded = new Set([keywords]);
    const words = keywords.toLowerCase().split(/\s+/);

    // Add synonyms and related terms
    for (const word of words) {
      const synonyms = this.getSynonyms(word);
      synonyms.forEach(synonym => expanded.add(synonym));
    }

    // Add skill-based expansions
    for (const word of words) {
      if (this.skillsDatabase.has(word)) {
        const relatedSkills = this.skillsDatabase.get(word)!;
        relatedSkills.slice(0, 3).forEach(skill => expanded.add(skill));
      }
    }

    return Array.from(expanded);
  }

  private extractRelatedSkills(currentSkills: string[], keywords: string): string[] {
    const relatedSkills = new Set<string>();

    // Extract from keywords
    const keywordSkills = this.extractSkillsFromText(keywords);
    keywordSkills.forEach(skill => relatedSkills.add(skill));

    // Find related skills for current skills
    for (const skill of currentSkills) {
      const related = this.skillsDatabase.get(skill.toLowerCase()) || [];
      related.slice(0, 2).forEach(relatedSkill => relatedSkills.add(relatedSkill));
    }

    // Remove already present skills
    currentSkills.forEach(skill => relatedSkills.delete(skill));

    return Array.from(relatedSkills).slice(0, 10);
  }

  private expandIndustrySearch(industry: string): string[] {
    if (!industry) return [];

    const industryMap: Record<string, string[]> = {
      'technology': ['tech', 'software', 'IT', 'fintech', 'edtech', 'healthtech'],
      'finance': ['banking', 'fintech', 'insurance', 'investment', 'financial services'],
      'healthcare': ['medical', 'pharmaceutical', 'biotechnology', 'healthtech'],
      'education': ['edtech', 'e-learning', 'training', 'academic'],
      'retail': ['e-commerce', 'fashion', 'consumer goods', 'marketplace']
    };

    const expanded = [industry];
    const relatedIndustries = industryMap[industry.toLowerCase()] || [];
    expanded.push(...relatedIndustries);

    return expanded;
  }

  private generateSearchStrategies(filters: JobSearchFilters, companyCount: number): string[] {
    const strategies = [];

    if (companyCount > 50) {
      strategies.push('broad_company_search');
    } else if (companyCount > 20) {
      strategies.push('targeted_company_search');
    } else {
      strategies.push('focused_company_search');
    }

    if (filters.skills && filters.skills.length > 0) {
      strategies.push('skill_based_matching');
    }

    if (filters.keywords) {
      strategies.push('keyword_expansion');
    }

    if (filters.industry) {
      strategies.push('industry_clustering');
    }

    strategies.push('ai_enhanced_discovery');

    return strategies;
  }

  private extractSkillsFromText(text: string): string[] {
    const skills = new Set<string>();
    const lowerText = text.toLowerCase();

    // Technical skills patterns
    const technicalSkills = [
      'javascript', 'python', 'java', 'react', 'node.js', 'angular', 'vue.js',
      'typescript', 'php', 'ruby', 'go', 'rust', 'swift', 'kotlin',
      'html', 'css', 'sass', 'less', 'bootstrap', 'tailwind',
      'sql', 'mongodb', 'postgresql', 'mysql', 'redis', 'elasticsearch',
      'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'jenkins',
      'git', 'github', 'gitlab', 'bitbucket', 'jira', 'confluence',
      'agile', 'scrum', 'kanban', 'devops', 'ci/cd', 'testing'
    ];

    // Soft skills patterns
    const softSkills = [
      'leadership', 'communication', 'teamwork', 'problem solving',
      'project management', 'analytical thinking', 'creativity',
      'time management', 'adaptability', 'critical thinking'
    ];

    // Check for technical skills
    for (const skill of technicalSkills) {
      if (lowerText.includes(skill)) {
        skills.add(skill);
      }
    }

    // Check for soft skills
    for (const skill of softSkills) {
      if (lowerText.includes(skill)) {
        skills.add(skill);
      }
    }

    // Extract skills using patterns
    const skillPatterns = [
      /\b(\w+\.js)\b/g, // JavaScript frameworks
      /\b(\w+SQL)\b/gi, // SQL variants
      /\b(API|REST|GraphQL|gRPC)\b/gi, // API technologies
      /\b(\w+DB)\b/gi, // Database technologies
    ];

    for (const pattern of skillPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => skills.add(match.toLowerCase()));
      }
    }

    return Array.from(skills).slice(0, 15);
  }

  private determineIndustryTags(title: string, description: string, company: string): string[] {
    const tags = new Set<string>();
    const text = `${title} ${description} ${company}`.toLowerCase();

    for (const [industry, patterns] of this.industryPatterns.entries()) {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          tags.add(industry);
          break;
        }
      }
    }

    return Array.from(tags);
  }

  private calculateMatchingScore(job: any, userProfile?: any, extractedSkills: string[] = []): number {
    let score = 0.5; // Base score

    if (!userProfile) return score;

    // Skill matching (40% weight)
    if (userProfile.skills && extractedSkills.length > 0) {
      const userSkills = userProfile.skills.map((s: string) => s.toLowerCase());
      const jobSkills = extractedSkills.map(s => s.toLowerCase());
      const matchingSkills = userSkills.filter((skill: string) => jobSkills.includes(skill));
      const skillScore = matchingSkills.length / Math.max(userSkills.length, jobSkills.length);
      score += skillScore * 0.4;
    }

    // Experience level matching (20% weight)
    if (userProfile.experienceLevel && job.experienceLevel) {
      const experienceLevels = ['entry', 'junior', 'mid', 'senior', 'lead', 'principal'];
      const userLevel = experienceLevels.indexOf(userProfile.experienceLevel.toLowerCase());
      const jobLevel = experienceLevels.indexOf(job.experienceLevel.toLowerCase());
      
      if (userLevel >= 0 && jobLevel >= 0) {
        const levelDiff = Math.abs(userLevel - jobLevel);
        const levelScore = Math.max(0, 1 - levelDiff * 0.2);
        score += levelScore * 0.2;
      }
    }

    // Location matching (15% weight)
    if (userProfile.preferredLocation && job.location) {
      const locationMatch = job.location.toLowerCase().includes(userProfile.preferredLocation.toLowerCase());
      if (locationMatch) score += 0.15;
    }

    // Salary matching (15% weight)
    if (userProfile.expectedSalary && job.salaryMin) {
      const salaryRatio = job.salaryMin / userProfile.expectedSalary;
      if (salaryRatio >= 0.8 && salaryRatio <= 1.5) {
        score += 0.15;
      } else if (salaryRatio >= 0.6 && salaryRatio <= 2.0) {
        score += 0.1;
      }
    }

    // Industry matching (10% weight)
    if (userProfile.preferredIndustry && job.industryTags) {
      const industryMatch = job.industryTags.some((tag: string) => 
        tag.toLowerCase().includes(userProfile.preferredIndustry.toLowerCase())
      );
      if (industryMatch) score += 0.1;
    }

    return Math.min(1.0, Math.max(0.0, score));
  }

  private generateMatchReasons(job: any, userProfile?: any, extractedSkills: string[] = []): string[] {
    const reasons = [];

    if (!userProfile) {
      reasons.push('Job matches your search criteria');
      return reasons;
    }

    // Skill matches
    if (userProfile.skills && extractedSkills.length > 0) {
      const userSkills = userProfile.skills.map((s: string) => s.toLowerCase());
      const jobSkills = extractedSkills.map(s => s.toLowerCase());
      const matchingSkills = userSkills.filter((skill: string) => jobSkills.includes(skill));
      
      if (matchingSkills.length > 0) {
        reasons.push(`Matches ${matchingSkills.length} of your skills: ${matchingSkills.slice(0, 3).join(', ')}`);
      }
    }

    // Experience level
    if (userProfile.experienceLevel && job.experienceLevel) {
      if (userProfile.experienceLevel.toLowerCase() === job.experienceLevel.toLowerCase()) {
        reasons.push(`Perfect experience level match: ${job.experienceLevel}`);
      }
    }

    // Location
    if (userProfile.preferredLocation && job.location) {
      if (job.location.toLowerCase().includes(userProfile.preferredLocation.toLowerCase())) {
        reasons.push(`Located in your preferred area: ${job.location}`);
      }
    }

    // Company size preference
    if (userProfile.preferredCompanySize && job.companyInfo?.size) {
      if (userProfile.preferredCompanySize.toLowerCase() === job.companyInfo.size.toLowerCase()) {
        reasons.push(`Matches your company size preference: ${job.companyInfo.size}`);
      }
    }

    if (reasons.length === 0) {
      reasons.push('Good overall match for your profile');
    }

    return reasons;
  }

  private getSynonyms(word: string): string[] {
    const synonymMap: Record<string, string[]> = {
      'developer': ['engineer', 'programmer', 'coder', 'software developer'],
      'manager': ['lead', 'supervisor', 'director', 'head'],
      'analyst': ['specialist', 'consultant', 'advisor'],
      'designer': ['UI designer', 'UX designer', 'creative'],
      'sales': ['business development', 'account manager'],
      'marketing': ['digital marketing', 'brand manager'],
      'remote': ['work from home', 'telecommute', 'distributed'],
      'fulltime': ['full-time', 'permanent', 'staff'],
      'parttime': ['part-time', 'contract', 'freelance']
    };

    return synonymMap[word.toLowerCase()] || [];
  }

  private getFallbackEnhancement(filters: JobSearchFilters): any {
    return {
      expandedFilters: filters,
      suggestedCompanies: ['Flutterwave', 'Paystack', 'Konga', 'Jumia'],
      relatedSkills: ['JavaScript', 'Python', 'React', 'Node.js'],
      searchStrategies: ['basic_search', 'company_focused']
    };
  }

  private initializeSkillsDatabase(): void {
    this.skillsDatabase.set('javascript', ['react', 'vue.js', 'angular', 'node.js', 'typescript']);
    this.skillsDatabase.set('python', ['django', 'flask', 'fastapi', 'pandas', 'numpy']);
    this.skillsDatabase.set('java', ['spring', 'hibernate', 'maven', 'gradle', 'junit']);
    this.skillsDatabase.set('react', ['javascript', 'jsx', 'redux', 'next.js', 'typescript']);
    this.skillsDatabase.set('node.js', ['javascript', 'express', 'mongodb', 'npm', 'typescript']);
    this.skillsDatabase.set('aws', ['cloud', 'ec2', 's3', 'lambda', 'rds']);
    this.skillsDatabase.set('docker', ['kubernetes', 'containerization', 'devops', 'microservices']);
  }

  private initializeIndustryPatterns(): void {
    this.industryPatterns.set('technology', [
      /\b(software|tech|IT|programming|development|engineering)\b/i,
      /\b(fintech|edtech|healthtech|proptech)\b/i,
      /\b(artificial intelligence|machine learning|AI|ML)\b/i
    ]);

    this.industryPatterns.set('finance', [
      /\b(banking|finance|fintech|investment|insurance)\b/i,
      /\b(payment|lending|credit|wealth management)\b/i,
      /\b(accounting|audit|financial services)\b/i
    ]);

    this.industryPatterns.set('healthcare', [
      /\b(medical|healthcare|pharmaceutical|biotechnology)\b/i,
      /\b(hospital|clinic|telemedicine|healthtech)\b/i,
      /\b(medical device|diagnostics|clinical)\b/i
    ]);

    this.industryPatterns.set('education', [
      /\b(education|learning|training|academic)\b/i,
      /\b(university|school|edtech|e-learning)\b/i,
      /\b(curriculum|instruction|educational)\b/i
    ]);

    this.industryPatterns.set('retail', [
      /\b(retail|e-commerce|fashion|consumer goods)\b/i,
      /\b(marketplace|online store|shopping)\b/i,
      /\b(wholesale|distribution|supply chain)\b/i
    ]);
  }
}