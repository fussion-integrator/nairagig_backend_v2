import axios from 'axios';
import * as cheerio from 'cheerio';

interface CrawledJob {
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
}

export class FocusedJobCrawler {
  async searchJobs(filters: any): Promise<CrawledJob[]> {
    const [jobbermannJobs, indeedJobs, linkedinJobs] = await Promise.allSettled([
      this.crawlJobberman(filters),
      this.crawlIndeed(filters),
      this.crawlLinkedIn(filters)
    ]);

    let allJobs: CrawledJob[] = [];
    
    if (jobbermannJobs.status === 'fulfilled') allJobs.push(...jobbermannJobs.value);
    if (indeedJobs.status === 'fulfilled') allJobs.push(...indeedJobs.value);
    if (linkedinJobs.status === 'fulfilled') allJobs.push(...linkedinJobs.value);

    allJobs = this.deduplicateJobs(allJobs);
    allJobs = this.filterByKeywords(allJobs, filters.keywords);

    console.log(`Found ${allJobs.length} jobs from Jobberman, Indeed, and LinkedIn`);
    return allJobs.slice(0, 100);
  }

  private async crawlJobberman(filters: any): Promise<CrawledJob[]> {
    try {
      const searchUrl = `https://www.jobberman.com/jobs?q=${encodeURIComponent(filters.keywords || '')}&location=nigeria`;
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const jobs: CrawledJob[] = [];
      
      $('.job-item, .job-card, .search-result, [data-automation="jobListing"]').each((index, element) => {
        const $job = $(element);
        const title = $job.find('.job-title, h3, h4, .title, [data-automation="jobTitle"]').first().text().trim();
        const company = $job.find('.company-name, .company, .employer, [data-automation="jobCompany"]').first().text().trim();
        const location = $job.find('.location, .job-location, .address').first().text().trim();
        const link = $job.find('a').first().attr('href');

        if (title && company && title.length > 2) {
          jobs.push({
            id: `jobberman-${Date.now()}-${index}`,
            title,
            company,
            location: location || 'Nigeria',
            jobType: this.extractJobType(title),
            experienceLevel: this.extractExperienceLevel(title),
            salaryMin: undefined,
            salaryMax: undefined,
            currency: 'NGN',
            description: `${title} position at ${company} in Nigeria`,
            requirements: this.generateRequirements(title),
            skills: this.extractSkills(title),
            benefits: ['Health Insurance', 'Professional Development'],
            applicationUrl: link ? `https://www.jobberman.com${link}` : `https://www.jobberman.com/jobs?q=${encodeURIComponent(title)}`,
            source: 'Jobberman',
            postedDate: new Date().toISOString().split('T')[0],
            companyInfo: {
              description: `${company} - Nigerian company`,
              website: `https://${company.toLowerCase().replace(/\s+/g, '')}.com`,
              size: 'Nigerian Company'
            }
          });
        }
      });

      return jobs.slice(0, 30);
    } catch (error) {
      console.error('Jobberman error:', error.message);
      return [];
    }
  }

  private async crawlIndeed(filters: any): Promise<CrawledJob[]> {
    try {
      const searchUrl = `https://ng.indeed.com/jobs?q=${encodeURIComponent(filters.keywords || '')}&l=Nigeria`;
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const jobs: CrawledJob[] = [];
      
      $('[data-jk], .job_seen_beacon, .slider_item, .result').each((index, element) => {
        const $job = $(element);
        const title = $job.find('h2 a span, .jobTitle a span, [data-testid="job-title"], .jobTitle').first().text().trim();
        const company = $job.find('.companyName, [data-testid="company-name"], .company').first().text().trim();
        const location = $job.find('.companyLocation, [data-testid="job-location"], .location').first().text().trim();
        const link = $job.find('h2 a, .jobTitle a').first().attr('href');

        if (title && company && title.length > 2) {
          jobs.push({
            id: `indeed-${Date.now()}-${index}`,
            title,
            company,
            location: location || 'Nigeria',
            jobType: this.extractJobType(title),
            experienceLevel: this.extractExperienceLevel(title),
            salaryMin: undefined,
            salaryMax: undefined,
            currency: 'NGN',
            description: `${title} position at ${company}`,
            requirements: this.generateRequirements(title),
            skills: this.extractSkills(title),
            benefits: ['Competitive Salary', 'Career Growth'],
            applicationUrl: link ? `https://ng.indeed.com${link}` : `https://ng.indeed.com/jobs?q=${encodeURIComponent(title)}`,
            source: 'Indeed Nigeria',
            postedDate: new Date().toISOString().split('T')[0],
            companyInfo: {
              description: `${company} - Employer in Nigeria`,
              website: `https://${company.toLowerCase().replace(/\s+/g, '')}.com`,
              size: 'Company'
            }
          });
        }
      });

      return jobs.slice(0, 30);
    } catch (error) {
      console.error('Indeed error:', error.message);
      return [];
    }
  }

  private async crawlLinkedIn(filters: any): Promise<CrawledJob[]> {
    try {
      const searchUrl = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(filters.keywords || '')}&location=Nigeria&f_TPR=r86400`;
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const jobs: CrawledJob[] = [];
      
      $('.job-search-card, .base-card, .base-search-card, .jobs-search__results-list li').each((index, element) => {
        const $job = $(element);
        const title = $job.find('.base-search-card__title, h3, .job-search-card__title').first().text().trim();
        const company = $job.find('.base-search-card__subtitle, h4, .job-search-card__subtitle').first().text().trim();
        const location = $job.find('.job-search-card__location, .base-search-card__metadata').first().text().trim();
        const link = $job.find('a').first().attr('href');

        if (title && company && title.length > 2) {
          jobs.push({
            id: `linkedin-${Date.now()}-${index}`,
            title,
            company,
            location: location || 'Nigeria',
            jobType: this.extractJobType(title),
            experienceLevel: this.extractExperienceLevel(title),
            salaryMin: undefined,
            salaryMax: undefined,
            currency: 'NGN',
            description: `${title} role at ${company}`,
            requirements: this.generateRequirements(title),
            skills: this.extractSkills(title),
            benefits: ['Professional Network', 'Career Development'],
            applicationUrl: link || `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(title)}`,
            source: 'LinkedIn',
            postedDate: new Date().toISOString().split('T')[0],
            companyInfo: {
              description: `${company} - Professional employer`,
              website: `https://${company.toLowerCase().replace(/\s+/g, '')}.com`,
              size: 'Professional Company'
            }
          });
        }
      });

      return jobs.slice(0, 20);
    } catch (error) {
      console.error('LinkedIn error:', error.message);
      return [];
    }
  }

  private extractJobType(title: string): string {
    const titleLower = title.toLowerCase();
    if (titleLower.includes('intern') || titleLower.includes('graduate')) return 'internship';
    if (titleLower.includes('contract') || titleLower.includes('freelance')) return 'contract';
    if (titleLower.includes('part-time')) return 'part-time';
    return 'full-time';
  }

  private extractExperienceLevel(title: string): string {
    const titleLower = title.toLowerCase();
    if (titleLower.includes('senior') || titleLower.includes('lead') || titleLower.includes('principal')) return 'senior';
    if (titleLower.includes('junior') || titleLower.includes('entry') || titleLower.includes('graduate')) return 'entry';
    return 'intermediate';
  }

  private extractSkills(title: string): string[] {
    const skills: string[] = [];
    const titleLower = title.toLowerCase();

    const skillMap = {
      'react': ['React', 'JavaScript', 'Frontend'],
      'python': ['Python', 'Backend', 'Data Science'],
      'java': ['Java', 'Spring Boot', 'Backend'],
      'node': ['Node.js', 'JavaScript', 'Backend'],
      'angular': ['Angular', 'TypeScript', 'Frontend'],
      'vue': ['Vue.js', 'JavaScript', 'Frontend'],
      'php': ['PHP', 'Laravel', 'Backend'],
      'marketing': ['Digital Marketing', 'SEO', 'Social Media'],
      'sales': ['Sales', 'CRM', 'Business Development'],
      'design': ['UI/UX Design', 'Figma', 'Adobe Creative Suite']
    };

    Object.entries(skillMap).forEach(([keyword, relatedSkills]) => {
      if (titleLower.includes(keyword)) {
        skills.push(...relatedSkills);
      }
    });

    return [...new Set(skills)];
  }

  private generateRequirements(title: string): string[] {
    const titleLower = title.toLowerCase();
    const requirements: string[] = [];

    if (titleLower.includes('senior')) {
      requirements.push('5+ years of relevant experience');
      requirements.push('Leadership and mentoring skills');
    } else if (titleLower.includes('junior') || titleLower.includes('entry')) {
      requirements.push('0-2 years of experience');
      requirements.push('Strong learning attitude');
    } else {
      requirements.push('2-4 years of relevant experience');
    }

    requirements.push('Bachelor\'s degree or equivalent');
    requirements.push('Strong communication skills');
    requirements.push('Team collaboration abilities');

    return requirements;
  }

  private deduplicateJobs(jobs: CrawledJob[]): CrawledJob[] {
    const seen = new Set<string>();
    return jobs.filter(job => {
      const key = `${job.title.toLowerCase()}-${job.company.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private filterByKeywords(jobs: CrawledJob[], keywords?: string): CrawledJob[] {
    if (!keywords) return jobs;
    
    const keywordLower = keywords.toLowerCase();
    return jobs.filter(job => 
      job.title.toLowerCase().includes(keywordLower) ||
      job.description.toLowerCase().includes(keywordLower) ||
      job.skills.some(skill => skill.toLowerCase().includes(keywordLower))
    );
  }
}