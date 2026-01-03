import OpenAI from 'openai';
import axios from 'axios';
import { FocusedJobCrawler } from './focused-job-crawler.service';
import { LinkedInAPIService } from './linkedin-api.service';

interface JobSearchFilters {
  keywords?: string;
  location?: string;
  jobType?: string;
  experienceLevel?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  skills?: string[];
}

interface JobResult {
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
  requirements?: string[];
  skills?: string[];
  benefits?: string[];
  applicationUrl?: string;
  source: string;
  postedDate: string;
  applicationDeadline?: string;
  companyInfo?: {
    description: string;
    website?: string;
    size?: string;
  };
  matchScore?: number;
}

export class JobSearchService {
  private openai: OpenAI;
  private focusedCrawler: FocusedJobCrawler;
  private linkedinAPI: LinkedInAPIService;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.focusedCrawler = new FocusedJobCrawler();
    this.linkedinAPI = new LinkedInAPIService();
  }

  async searchJobs(filters: JobSearchFilters, userId?: string): Promise<JobResult[]> {
    try {
      let allJobs: JobResult[] = [];

      // Use focused crawler for Nigerian jobs
      if (filters.location?.toLowerCase().includes('nigeria') || !filters.location) {
        console.log('🎯 Using focused crawler for Nigerian jobs...');
        const nigerianJobs = await this.focusedCrawler.searchJobs(filters);
        allJobs.push(...nigerianJobs);

        // Try LinkedIn API for additional Nigerian jobs
        console.log('🔗 Fetching LinkedIn jobs via API...');
        const linkedinJobs = await this.linkedinAPI.searchPublicJobs({
          keywords: filters.keywords,
          location: 'Nigeria'
        });
        allJobs.push(...linkedinJobs);
      }

      // Always include remote jobs
      const remoteJobs = await this.searchRemoteOK(filters);
      allJobs.push(...remoteJobs);

      allJobs = this.removeDuplicates(allJobs);

      if (filters.skills && filters.skills.length > 0) {
        allJobs = await this.calculateMatchScores(allJobs, filters.skills);
      }

      allJobs.sort((a, b) => {
        if (a.matchScore && b.matchScore) {
          return b.matchScore - a.matchScore;
        }
        return new Date(b.postedDate).getTime() - new Date(a.postedDate).getTime();
      });

      console.log(`✅ Found ${allJobs.length} jobs total`);
      return allJobs.slice(0, 100);
    } catch (error) {
      console.error('Job search error:', error);
      return [];
    }
  }

  private async searchRemoteOK(filters: JobSearchFilters): Promise<JobResult[]> {
    try {
      const response = await axios.get('https://remoteok.io/api', {
        headers: { 'User-Agent': 'NairaGig-JobScout/1.0' },
        timeout: 10000
      });

      const jobs = response.data.slice(1);
      
      return jobs
        .filter((job: any) => this.matchesFilters(job, filters))
        .slice(0, 20)
        .map((job: any) => ({
          id: `remoteok-${job.id}`,
          title: job.position || 'Remote Position',
          company: job.company || 'Remote Company',
          location: 'Remote',
          jobType: 'remote',
          experienceLevel: this.extractExperienceLevel(job.description || ''),
          salaryMin: job.salary_min,
          salaryMax: job.salary_max,
          currency: 'USD',
          description: this.cleanHtmlDescription(job.description || 'Remote job opportunity'),
          requirements: this.extractRequirements(job.description || ''),
          skills: job.tags || [],
          benefits: ['Remote work', 'Flexible hours'],
          applicationUrl: job.url || `https://remoteok.io/remote-jobs/${job.id}`,
          source: 'RemoteOK',
          postedDate: job.date ? new Date(job.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          companyInfo: {
            description: `Remote company offering ${job.position}`,
            website: undefined,
            size: 'Remote Team'
          }
        }));
    } catch (error) {
      console.error('RemoteOK API error:', error);
      return [];
    }
  }



  private matchesFilters(job: any, filters: JobSearchFilters): boolean {
    if (filters.keywords) {
      const keywords = filters.keywords.toLowerCase();
      const title = (job.position || job.title || '').toLowerCase();
      const description = (job.description || '').toLowerCase();
      const tags = (job.tags || []).join(' ').toLowerCase();
      
      if (!title.includes(keywords) && !description.includes(keywords) && !tags.includes(keywords)) {
        return false;
      }
    }
    
    if (filters.location && filters.location !== 'remote') {
      const jobLocation = (job.location || '').toLowerCase();
      if (!jobLocation.includes(filters.location.toLowerCase())) {
        return false;
      }
    }
    
    return true;
  }

  private extractExperienceLevel(description: string): string {
    const desc = this.cleanHtmlDescription(description).toLowerCase();
    if (desc.includes('senior') || desc.includes('lead') || desc.includes('5+ years') || desc.includes('expert')) {
      return 'senior';
    }
    if (desc.includes('junior') || desc.includes('entry') || desc.includes('graduate') || desc.includes('1-2 years')) {
      return 'entry';
    }
    return 'intermediate';
  }

  private extractRequirements(description: string): string[] {
    // Clean HTML first
    const cleanDesc = this.cleanHtmlDescription(description);
    const requirements: string[] = [];
    const lines = cleanDesc.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.match(/^[•\-\*]/) || trimmed.toLowerCase().includes('require') || trimmed.toLowerCase().includes('must have')) {
        requirements.push(trimmed.replace(/^[•\-\*]\s*/, ''));
      }
    }
    
    return requirements.slice(0, 5);
  }

  private extractSkills(description: string): string[] {
    const commonSkills = [
      'JavaScript', 'Python', 'Java', 'React', 'Node.js', 'TypeScript', 'Angular', 'Vue.js',
      'PHP', 'Ruby', 'Go', 'Rust', 'Swift', 'Kotlin', 'Flutter', 'Dart', 'C#', 'C++',
      'AWS', 'Docker', 'Kubernetes', 'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Git',
      'HTML', 'CSS', 'SASS', 'GraphQL', 'REST API', 'Microservices', 'DevOps', 'CI/CD'
    ];
    
    const foundSkills = commonSkills.filter(skill => 
      description.toLowerCase().includes(skill.toLowerCase())
    );
    
    return foundSkills.slice(0, 8);
  }

  private cleanHtmlDescription(html: string): string {
    if (!html) return '';
    
    // Remove HTML tags and decode entities
    let cleaned = html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
      .replace(/&amp;/g, '&') // Decode ampersands
      .replace(/&lt;/g, '<') // Decode less than
      .replace(/&gt;/g, '>') // Decode greater than
      .replace(/&quot;/g, '"') // Decode quotes
      .replace(/&#39;/g, "'") // Decode apostrophes
      .replace(/â/g, "'") // Fix encoding issues
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    // Remove spam text patterns
    cleaned = cleaned
      .replace(/Please mention the word.*?when applying.*?#\w+\)\./gi, '')
      .replace(/This is a beta feature.*?human\./gi, '')
      .replace(/Companies can search.*?human\./gi, '')
      .trim();
    
    // Limit length for better display
    if (cleaned.length > 500) {
      cleaned = cleaned.substring(0, 500) + '...';
    }
    
    return cleaned;
  }



  private getMockJobs(source: string, filters: JobSearchFilters): JobResult[] {
    const mockJobs = [
      {
        id: `${source.toLowerCase()}-1`,
        title: 'Senior Flutter Developer',
        company: 'TechCorp Nigeria',
        location: 'Lagos, Nigeria (Remote)',
        jobType: 'full-time',
        experienceLevel: 'senior',
        salaryMin: 300000,
        salaryMax: 500000,
        currency: 'NGN',
        description: 'We are looking for a Senior Flutter Developer to join our growing mobile team.',
        requirements: ['5+ years Flutter experience', 'Dart proficiency', 'Firebase knowledge'],
        skills: ['Flutter', 'Dart', 'Firebase', 'REST API', 'Mobile Development'],
        benefits: ['Health insurance', 'Remote work', 'Professional development'],
        applicationUrl: 'https://techcorp.ng/careers/senior-flutter-developer',
        source,
        postedDate: '2024-01-15',
        companyInfo: {
          description: 'TechCorp Nigeria is a leading fintech company.',
          website: 'https://techcorp.ng',
          size: '50-200 employees'
        }
      }
    ];

    return mockJobs.filter(job => {
      if (filters.keywords) {
        const searchTerm = filters.keywords.toLowerCase();
        const matchesTitle = job.title.toLowerCase().includes(searchTerm);
        const matchesSkills = job.skills.some(skill => skill.toLowerCase().includes(searchTerm));
        if (!matchesTitle && !matchesSkills) {
          return false;
        }
      }
      return true;
    });
  }

  private removeDuplicates(jobs: JobResult[]): JobResult[] {
    const seen = new Set();
    return jobs.filter(job => {
      const key = `${job.title.toLowerCase()}-${job.company.toLowerCase()}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private async calculateMatchScores(jobs: JobResult[], userSkills: string[]): Promise<JobResult[]> {
    try {
      return jobs.map(job => ({
        ...job,
        matchScore: this.calculateSimpleMatch(job, userSkills)
      }));
    } catch (error) {
      console.error('Error calculating match scores:', error);
      return jobs;
    }
  }

  private calculateSimpleMatch(job: JobResult, userSkills: string[]): number {
    const jobSkills = job.skills || [];
    const skillOverlap = userSkills.filter(skill => 
      jobSkills.some(jobSkill => 
        jobSkill.toLowerCase().includes(skill.toLowerCase()) ||
        skill.toLowerCase().includes(jobSkill.toLowerCase())
      )
    ).length;
    
    const maxSkills = Math.max(userSkills.length, jobSkills.length);
    return maxSkills > 0 ? Math.round((skillOverlap / maxSkills) * 100) : 50;
  }

  async getJobById(jobId: string): Promise<JobResult | null> {
    const mockJob = {
      id: jobId,
      title: 'Senior Frontend Developer',
      company: 'TechCorp Nigeria',
      location: 'Lagos, Nigeria',
      jobType: 'full-time',
      experienceLevel: 'senior',
      salaryMin: 300000,
      salaryMax: 500000,
      currency: 'NGN',
      description: 'We are looking for a Senior Frontend Developer to join our growing team...',
      requirements: ['5+ years React experience', 'TypeScript proficiency'],
      skills: ['React', 'TypeScript', 'JavaScript'],
      benefits: ['Health insurance', 'Remote work', 'Equity'],
      applicationUrl: 'https://techcorp.ng/careers/senior-frontend-developer',
      source: 'LinkedIn',
      postedDate: '2024-01-15',
      companyInfo: {
        description: 'Leading fintech company in Nigeria',
        website: 'https://techcorp.ng',
        size: '50-200 employees'
      }
    };

    return mockJob;
  }
}