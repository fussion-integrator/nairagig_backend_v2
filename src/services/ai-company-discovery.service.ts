import axios from 'axios';
import * as cheerio from 'cheerio';

interface CompanyData {
  name: string;
  website: string;
  careerUrl?: string;
  industry: string;
  size: string;
  location: string;
  description: string;
}

interface AISearchResult {
  companies: CompanyData[];
  searchTerms: string[];
  relatedIndustries: string[];
}

export class AICompanyDiscoveryService {
  private discoveredCompanies: Map<string, CompanyData[]> = new Map();
  private industryKeywords: Map<string, string[]> = new Map();

  constructor() {
    this.initializeIndustryKeywords();
  }

  async discoverCompanies(
    industry: string,
    location: string = 'Nigeria',
    jobTitle?: string
  ): Promise<AISearchResult> {
    try {
      const cacheKey = `${industry}-${location}-${jobTitle || 'all'}`;
      
      if (this.discoveredCompanies.has(cacheKey)) {
        return {
          companies: this.discoveredCompanies.get(cacheKey)!,
          searchTerms: this.generateSearchTerms(industry, jobTitle),
          relatedIndustries: this.getRelatedIndustries(industry)
        };
      }

      const [
        searchEngineResults,
        businessDirectoryResults,
        linkedinResults,
        crunchbaseResults
      ] = await Promise.allSettled([
        this.searchEngineDiscovery(industry, location, jobTitle),
        this.businessDirectoryDiscovery(industry, location),
        this.linkedinCompanyDiscovery(industry, location),
        this.crunchbaseDiscovery(industry, location)
      ]);

      let allCompanies: CompanyData[] = [];
      
      if (searchEngineResults.status === 'fulfilled') allCompanies.push(...searchEngineResults.value);
      if (businessDirectoryResults.status === 'fulfilled') allCompanies.push(...businessDirectoryResults.value);
      if (linkedinResults.status === 'fulfilled') allCompanies.push(...linkedinResults.value);
      if (crunchbaseResults.status === 'fulfilled') allCompanies.push(...crunchbaseResults.value);

      // Deduplicate and enrich company data
      const uniqueCompanies = this.deduplicateCompanies(allCompanies);
      const enrichedCompanies = await this.enrichCompanyData(uniqueCompanies);

      // Cache results
      this.discoveredCompanies.set(cacheKey, enrichedCompanies);

      return {
        companies: enrichedCompanies,
        searchTerms: this.generateSearchTerms(industry, jobTitle),
        relatedIndustries: this.getRelatedIndustries(industry)
      };
    } catch (error) {
      console.error('AI company discovery error:', error);
      return this.getFallbackCompanies(industry, location);
    }
  }

  private async searchEngineDiscovery(
    industry: string,
    location: string,
    jobTitle?: string
  ): Promise<CompanyData[]> {
    const companies: CompanyData[] = [];
    const searchQueries = this.generateSearchQueries(industry, location, jobTitle);

    for (const query of searchQueries.slice(0, 3)) {
      try {
        // Use DuckDuckGo for search results (no API key required)
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        
        const response = await axios.get(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          timeout: 10000
        });

        const $ = cheerio.load(response.data);
        
        $('.result__body, .web-result').each((index, element) => {
          if (index >= 10) return false; // Limit results
          
          const $result = $(element);
          const title = $result.find('.result__title, .result__a').text().trim();
          const url = $result.find('.result__title a, .result__a').attr('href');
          const snippet = $result.find('.result__snippet').text().trim();

          if (title && url && this.isCompanyResult(title, snippet)) {
            const company = this.extractCompanyFromSearchResult(title, url, snippet, industry, location);
            if (company) companies.push(company);
          }
        });
      } catch (error) {
        console.error(`Search engine discovery error for query "${query}":`, error);
      }
    }

    return companies;
  }

  private async businessDirectoryDiscovery(industry: string, location: string): Promise<CompanyData[]> {
    const companies: CompanyData[] = [];
    
    // Nigerian business directories
    const directories = [
      'https://www.businesslist.com.ng',
      'https://www.vconnect.com',
      'https://www.naijacompanies.com'
    ];

    for (const directory of directories) {
      try {
        const searchUrl = `${directory}/search?q=${encodeURIComponent(industry)}&location=${encodeURIComponent(location)}`;
        
        const response = await axios.get(searchUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobCrawler/1.0)' },
          timeout: 8000
        });

        const $ = cheerio.load(response.data);
        
        $('.business-listing, .company-item, .directory-item').each((index, element) => {
          if (index >= 15) return false;
          
          const $item = $(element);
          const name = $item.find('.business-name, .company-name, h3').first().text().trim();
          const website = $item.find('a[href*="http"]').attr('href');
          const description = $item.find('.description, .summary').text().trim();

          if (name) {
            companies.push({
              name,
              website: website || `https://${name.toLowerCase().replace(/\s+/g, '')}.com`,
              industry,
              size: 'Medium',
              location,
              description: description || `${name} - ${industry} company in ${location}`
            });
          }
        });
      } catch (error) {
        console.error(`Business directory discovery error:`, error);
      }
    }

    return companies;
  }

  private async linkedinCompanyDiscovery(industry: string, location: string): Promise<CompanyData[]> {
    // LinkedIn company discovery using public search
    const companies: CompanyData[] = [];
    const searchTerms = this.industryKeywords.get(industry) || [industry];

    for (const term of searchTerms.slice(0, 2)) {
      try {
        // Use Google to find LinkedIn company pages
        const query = `site:linkedin.com/company ${term} ${location}`;
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        
        const response = await axios.get(searchUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CompanyDiscovery/1.0)' },
          timeout: 8000
        });

        const $ = cheerio.load(response.data);
        
        $('.result__body').each((index, element) => {
          if (index >= 8) return false;
          
          const $result = $(element);
          const title = $result.find('.result__title').text().trim();
          const url = $result.find('.result__title a').attr('href');

          if (title && url && url.includes('linkedin.com/company')) {
            const companyName = title.replace(/\s*\|\s*LinkedIn.*/, '').trim();
            if (companyName) {
              companies.push({
                name: companyName,
                website: `https://${companyName.toLowerCase().replace(/\s+/g, '')}.com`,
                industry,
                size: 'Large',
                location,
                description: `${companyName} - Professional services company`
              });
            }
          }
        });
      } catch (error) {
        console.error(`LinkedIn discovery error:`, error);
      }
    }

    return companies;
  }

  private async crunchbaseDiscovery(industry: string, location: string): Promise<CompanyData[]> {
    // Crunchbase-style startup discovery
    const companies: CompanyData[] = [];
    
    try {
      const query = `site:crunchbase.com ${industry} startup ${location}`;
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      
      const response = await axios.get(searchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StartupDiscovery/1.0)' },
        timeout: 8000
      });

      const $ = cheerio.load(response.data);
      
      $('.result__body').each((index, element) => {
        if (index >= 10) return false;
        
        const $result = $(element);
        const title = $result.find('.result__title').text().trim();
        const snippet = $result.find('.result__snippet').text().trim();

        if (title && title.includes('Crunchbase')) {
          const companyName = title.split(' - ')[0].trim();
          if (companyName && !companyName.includes('Crunchbase')) {
            companies.push({
              name: companyName,
              website: `https://${companyName.toLowerCase().replace(/\s+/g, '')}.com`,
              industry,
              size: 'Startup',
              location,
              description: snippet || `${companyName} - Innovative ${industry} startup`
            });
          }
        }
      });
    } catch (error) {
      console.error(`Crunchbase discovery error:`, error);
    }

    return companies;
  }

  private generateSearchQueries(industry: string, location: string, jobTitle?: string): string[] {
    const baseQueries = [
      `"${industry} companies" ${location} careers jobs`,
      `"${industry} firms" ${location} hiring recruitment`,
      `"${industry} employers" ${location} vacancies`,
      `"top ${industry} companies" ${location}`,
      `"${industry} startups" ${location} jobs`
    ];

    if (jobTitle) {
      baseQueries.push(
        `"${jobTitle}" jobs ${industry} ${location}`,
        `"${jobTitle}" careers ${location} companies`,
        `"${jobTitle}" hiring ${industry} ${location}`
      );
    }

    return baseQueries;
  }

  private generateSearchTerms(industry: string, jobTitle?: string): string[] {
    const terms = [industry];
    
    if (this.industryKeywords.has(industry)) {
      terms.push(...this.industryKeywords.get(industry)!);
    }
    
    if (jobTitle) {
      terms.push(jobTitle);
      // Add related job titles
      const relatedTitles = this.getRelatedJobTitles(jobTitle);
      terms.push(...relatedTitles);
    }

    return [...new Set(terms)];
  }

  private getRelatedIndustries(industry: string): string[] {
    const industryMap: Record<string, string[]> = {
      'technology': ['fintech', 'software', 'IT', 'telecommunications', 'e-commerce'],
      'finance': ['banking', 'insurance', 'fintech', 'investment', 'accounting'],
      'healthcare': ['pharmaceuticals', 'medical devices', 'biotechnology', 'telemedicine'],
      'education': ['e-learning', 'training', 'academic', 'research'],
      'retail': ['e-commerce', 'fashion', 'consumer goods', 'wholesale'],
      'manufacturing': ['automotive', 'industrial', 'construction', 'engineering']
    };

    return industryMap[industry.toLowerCase()] || [];
  }

  private getRelatedJobTitles(jobTitle: string): string[] {
    const titleMap: Record<string, string[]> = {
      'developer': ['engineer', 'programmer', 'software developer', 'full stack developer'],
      'manager': ['lead', 'supervisor', 'director', 'head'],
      'analyst': ['specialist', 'consultant', 'advisor', 'researcher'],
      'designer': ['UI designer', 'UX designer', 'graphic designer', 'creative'],
      'sales': ['business development', 'account manager', 'sales representative'],
      'marketing': ['digital marketing', 'content marketing', 'brand manager']
    };

    const lowerTitle = jobTitle.toLowerCase();
    for (const [key, values] of Object.entries(titleMap)) {
      if (lowerTitle.includes(key)) {
        return values;
      }
    }

    return [];
  }

  private isCompanyResult(title: string, snippet: string): boolean {
    const companyIndicators = [
      'company', 'corporation', 'ltd', 'limited', 'inc', 'careers', 'jobs',
      'hiring', 'recruitment', 'employer', 'firm', 'startup', 'business'
    ];

    const text = `${title} ${snippet}`.toLowerCase();
    return companyIndicators.some(indicator => text.includes(indicator));
  }

  private extractCompanyFromSearchResult(
    title: string,
    url: string,
    snippet: string,
    industry: string,
    location: string
  ): CompanyData | null {
    // Extract company name from title
    let companyName = title.split(' - ')[0].trim();
    companyName = companyName.replace(/\s*(careers|jobs|hiring).*$/i, '').trim();

    if (!companyName || companyName.length < 2) return null;

    // Extract domain for website
    let website = '';
    try {
      const urlObj = new URL(url);
      website = `${urlObj.protocol}//${urlObj.hostname}`;
    } catch {
      website = url;
    }

    return {
      name: companyName,
      website,
      industry,
      size: this.estimateCompanySize(snippet),
      location,
      description: snippet || `${companyName} - ${industry} company in ${location}`
    };
  }

  private estimateCompanySize(snippet: string): string {
    const text = snippet.toLowerCase();
    
    if (text.includes('startup') || text.includes('founded')) return 'Startup';
    if (text.includes('multinational') || text.includes('global') || text.includes('international')) return 'Large';
    if (text.includes('leading') || text.includes('major') || text.includes('top')) return 'Large';
    if (text.includes('small') || text.includes('local')) return 'Small';
    
    return 'Medium';
  }

  private deduplicateCompanies(companies: CompanyData[]): CompanyData[] {
    const seen = new Set<string>();
    return companies.filter(company => {
      const key = company.name.toLowerCase().replace(/\s+/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async enrichCompanyData(companies: CompanyData[]): Promise<CompanyData[]> {
    return Promise.all(companies.map(async (company) => {
      try {
        // Try to find career page
        const careerUrl = await this.findCareerPage(company.website);
        return { ...company, careerUrl };
      } catch {
        return company;
      }
    }));
  }

  private async findCareerPage(website: string): Promise<string | undefined> {
    const careerPaths = ['/careers', '/jobs', '/career', '/join-us', '/work-with-us', '/opportunities'];
    
    for (const path of careerPaths) {
      try {
        const url = `${website}${path}`;
        const response = await axios.head(url, { timeout: 3000 });
        if (response.status === 200) return url;
      } catch {
        continue;
      }
    }
    
    return undefined;
  }

  private getFallbackCompanies(industry: string, location: string): AISearchResult {
    const fallbackCompanies: CompanyData[] = [
      {
        name: 'Flutterwave',
        website: 'https://flutterwave.com',
        careerUrl: 'https://careers.flutterwave.com',
        industry: 'Fintech',
        size: 'Large',
        location: 'Nigeria',
        description: 'Leading African fintech company'
      },
      {
        name: 'Paystack',
        website: 'https://paystack.com',
        careerUrl: 'https://paystack.com/careers',
        industry: 'Fintech',
        size: 'Large',
        location: 'Nigeria',
        description: 'Payment infrastructure for Africa'
      }
    ];

    return {
      companies: fallbackCompanies,
      searchTerms: [industry],
      relatedIndustries: this.getRelatedIndustries(industry)
    };
  }

  private initializeIndustryKeywords(): void {
    this.industryKeywords.set('technology', [
      'software', 'IT', 'tech', 'digital', 'fintech', 'edtech', 'healthtech',
      'artificial intelligence', 'machine learning', 'blockchain', 'cybersecurity'
    ]);
    
    this.industryKeywords.set('finance', [
      'banking', 'fintech', 'insurance', 'investment', 'accounting', 'financial services',
      'microfinance', 'payment', 'lending', 'wealth management'
    ]);
    
    this.industryKeywords.set('healthcare', [
      'medical', 'pharmaceutical', 'biotechnology', 'healthtech', 'telemedicine',
      'medical devices', 'diagnostics', 'clinical research'
    ]);
    
    this.industryKeywords.set('education', [
      'edtech', 'e-learning', 'training', 'academic', 'research', 'university',
      'online learning', 'educational technology'
    ]);
    
    this.industryKeywords.set('retail', [
      'e-commerce', 'fashion', 'consumer goods', 'wholesale', 'marketplace',
      'online retail', 'fashion tech', 'logistics'
    ]);
  }
}