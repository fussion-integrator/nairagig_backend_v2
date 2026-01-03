import axios from 'axios';

interface LinkedInJob {
  id: string;
  title: string;
  company: string;
  location: string;
  jobType: string;
  experienceLevel: string;
  description: string;
  applicationUrl: string;
  postedDate: string;
  skills: string[];
}

export class LinkedInAPIService {
  private accessToken: string;
  private baseUrl = 'https://api.linkedin.com/v2';

  constructor() {
    this.accessToken = process.env.LINKEDIN_ACCESS_TOKEN || '';
  }

  async searchJobs(filters: {
    keywords?: string;
    location?: string;
    jobType?: string;
    experienceLevel?: string;
  }): Promise<LinkedInJob[]> {
    try {
      if (!this.accessToken) {
        console.warn('LinkedIn API token not configured');
        return [];
      }

      // LinkedIn Jobs API endpoint
      const params = new URLSearchParams({
        q: 'jobPostings',
        keywords: filters.keywords || '',
        locationName: filters.location || 'Nigeria',
        count: '25'
      });

      const response = await axios.get(`${this.baseUrl}/jobSearch?${params}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        },
        timeout: 10000
      });

      return this.transformLinkedInJobs(response.data.elements || []);
    } catch (error) {
      console.error('LinkedIn API error:', error.response?.status, error.message);
      return [];
    }
  }

  private transformLinkedInJobs(jobs: any[]): LinkedInJob[] {
    return jobs.map((job, index) => ({
      id: `linkedin-api-${job.id || Date.now()}-${index}`,
      title: job.title || 'Job Position',
      company: job.companyDetails?.companyName || 'Company',
      location: job.formattedLocation || 'Nigeria',
      jobType: this.mapJobType(job.employmentStatus),
      experienceLevel: this.mapExperienceLevel(job.seniorityLevel),
      description: job.description?.text || `${job.title} position`,
      applicationUrl: job.applyMethod?.companyApplyUrl || `https://linkedin.com/jobs/view/${job.id}`,
      postedDate: job.listedAt ? new Date(job.listedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      skills: job.skills?.map((skill: any) => skill.name) || []
    }));
  }

  private mapJobType(employmentStatus: string): string {
    const typeMap: Record<string, string> = {
      'FULL_TIME': 'full-time',
      'PART_TIME': 'part-time',
      'CONTRACT': 'contract',
      'TEMPORARY': 'contract',
      'INTERNSHIP': 'internship'
    };
    return typeMap[employmentStatus] || 'full-time';
  }

  private mapExperienceLevel(seniorityLevel: string): string {
    const levelMap: Record<string, string> = {
      'INTERNSHIP': 'entry',
      'ENTRY_LEVEL': 'entry',
      'ASSOCIATE': 'intermediate',
      'MID_SENIOR': 'senior',
      'DIRECTOR': 'senior',
      'EXECUTIVE': 'senior'
    };
    return levelMap[seniorityLevel] || 'intermediate';
  }

  // Alternative: Use LinkedIn's public job search (no API key required)
  async searchPublicJobs(filters: {
    keywords?: string;
    location?: string;
  }): Promise<LinkedInJob[]> {
    try {
      // Use LinkedIn's public job search RSS feed
      const searchUrl = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(filters.keywords || '')}&location=${encodeURIComponent(filters.location || 'Nigeria')}&start=0&count=25`;
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://www.linkedin.com/jobs/search'
        },
        timeout: 10000
      });

      // Parse the HTML response to extract job data
      const cheerio = require('cheerio');
      const $ = cheerio.load(response.data);
      const jobs: LinkedInJob[] = [];

      $('.base-card').each((index, element) => {
        const $job = $(element);
        const title = $job.find('.base-search-card__title').text().trim();
        const company = $job.find('.base-search-card__subtitle').text().trim();
        const location = $job.find('.job-search-card__location').text().trim();
        const link = $job.find('.base-card__full-link').attr('href');
        const jobId = link?.match(/\/view\/(\d+)/)?.[1];

        if (title && company) {
          jobs.push({
            id: `linkedin-public-${jobId || Date.now()}-${index}`,
            title,
            company,
            location: location || 'Nigeria',
            jobType: 'full-time',
            experienceLevel: 'intermediate',
            description: `${title} position at ${company}`,
            applicationUrl: link || `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(title)}`,
            postedDate: new Date().toISOString().split('T')[0],
            skills: this.extractSkillsFromTitle(title)
          });
        }
      });

      return jobs.slice(0, 25);
    } catch (error) {
      console.error('LinkedIn public search error:', error.message);
      return [];
    }
  }

  private extractSkillsFromTitle(title: string): string[] {
    const skills: string[] = [];
    const titleLower = title.toLowerCase();

    const skillMap = {
      'react': ['React', 'JavaScript', 'Frontend'],
      'python': ['Python', 'Backend', 'Data Science'],
      'java': ['Java', 'Spring Boot', 'Backend'],
      'node': ['Node.js', 'JavaScript', 'Backend'],
      'angular': ['Angular', 'TypeScript', 'Frontend'],
      'marketing': ['Digital Marketing', 'SEO', 'Social Media'],
      'sales': ['Sales', 'CRM', 'Business Development']
    };

    Object.entries(skillMap).forEach(([keyword, relatedSkills]) => {
      if (titleLower.includes(keyword)) {
        skills.push(...relatedSkills);
      }
    });

    return [...new Set(skills)];
  }
}