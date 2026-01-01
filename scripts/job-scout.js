const axios = require('axios');
const cheerio = require('cheerio');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Zero-cost job sources
const JOB_SOURCES = [
  {
    name: 'RemoteOK',
    url: 'https://remoteok.io/api',
    type: 'api'
  },
  {
    name: 'GitHub Jobs',
    url: 'https://jobs.github.com/positions.json',
    type: 'api'
  },
  {
    name: 'AngelList',
    url: 'https://angel.co/jobs',
    type: 'scrape'
  },
  {
    name: 'HackerNews Jobs',
    url: 'https://hacker-news.firebaseio.com/v0/jobstories.json',
    type: 'api'
  }
];

// AI matching using free OpenAI credits
async function matchJobsWithAI(jobs, userPreferences) {
  if (!process.env.OPENAI_API_KEY) {
    console.log('No OpenAI key, using basic matching');
    return basicMatching(jobs, userPreferences);
  }

  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [{
        role: 'user',
        content: `Match these jobs with user preferences and return match scores (0-100):
        
Jobs: ${JSON.stringify(jobs.slice(0, 10))}
User: ${JSON.stringify(userPreferences)}

Return JSON array with job IDs and match scores.`
      }],
      max_tokens: 1000,
      temperature: 0.3
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return JSON.parse(response.data.choices[0].message.content);
  } catch (error) {
    console.log('AI matching failed, using basic matching:', error.message);
    return basicMatching(jobs, userPreferences);
  }
}

// Fallback basic matching
function basicMatching(jobs, userPreferences) {
  return jobs.map(job => {
    let score = 50; // Base score
    
    // Title matching
    if (userPreferences.jobTitle && job.title.toLowerCase().includes(userPreferences.jobTitle.toLowerCase())) {
      score += 20;
    }
    
    // Skills matching
    if (userPreferences.skills && job.skills) {
      const matchedSkills = userPreferences.skills.filter(skill => 
        job.skills.some(jobSkill => jobSkill.toLowerCase().includes(skill.toLowerCase()))
      );
      score += (matchedSkills.length / userPreferences.skills.length) * 30;
    }
    
    // Location matching
    if (userPreferences.location && job.location) {
      if (job.location.toLowerCase().includes(userPreferences.location.toLowerCase())) {
        score += 15;
      }
    }
    
    return { jobId: job.id, matchScore: Math.min(100, Math.max(0, score)) };
  });
}

// Scrape RemoteOK (free API)
async function scrapeRemoteOK() {
  try {
    const response = await axios.get('https://remoteok.io/api');
    const jobs = response.data.slice(1); // Remove first element (metadata)
    
    return jobs.map(job => ({
      id: `remoteok_${job.id}`,
      title: job.position,
      company: job.company,
      location: 'Remote',
      workType: 'REMOTE',
      description: job.description,
      skills: job.tags || [],
      salaryMin: null,
      salaryMax: null,
      currency: 'USD',
      url: `https://remoteok.io/remote-jobs/${job.id}`,
      source: 'RemoteOK',
      postedDate: new Date(job.date * 1000)
    }));
  } catch (error) {
    console.error('RemoteOK scraping failed:', error.message);
    return [];
  }
}

// Scrape HackerNews Jobs (free API)
async function scrapeHackerNewsJobs() {
  try {
    const response = await axios.get('https://hacker-news.firebaseio.com/v0/jobstories.json');
    const jobIds = response.data.slice(0, 20); // Get latest 20 jobs
    
    const jobs = [];
    for (const id of jobIds) {
      try {
        const jobResponse = await axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        const job = jobResponse.data;
        
        if (job && job.text) {
          jobs.push({
            id: `hn_${job.id}`,
            title: job.title || 'Job Opportunity',
            company: extractCompanyFromText(job.text),
            location: extractLocationFromText(job.text),
            workType: job.text.toLowerCase().includes('remote') ? 'REMOTE' : 'ONSITE',
            description: job.text,
            skills: extractSkillsFromText(job.text),
            salaryMin: null,
            salaryMax: null,
            currency: 'USD',
            url: `https://news.ycombinator.com/item?id=${job.id}`,
            source: 'HackerNews',
            postedDate: new Date(job.time * 1000)
          });
        }
      } catch (err) {
        console.log(`Failed to fetch job ${id}:`, err.message);
      }
    }
    
    return jobs;
  } catch (error) {
    console.error('HackerNews scraping failed:', error.message);
    return [];
  }
}

// Helper functions for text extraction
function extractCompanyFromText(text) {
  const companyMatch = text.match(/(?:at|@|company:?\s*)([A-Z][a-zA-Z\s&]+?)(?:\s*[-|,|\n])/i);
  return companyMatch ? companyMatch[1].trim() : 'Unknown Company';
}

function extractLocationFromText(text) {
  const locationMatch = text.match(/(?:location:?\s*|based in\s*)([A-Z][a-zA-Z\s,]+?)(?:\s*[-|,|\n])/i);
  if (locationMatch) return locationMatch[1].trim();
  if (text.toLowerCase().includes('remote')) return 'Remote';
  return 'Not specified';
}

function extractSkillsFromText(text) {
  const commonSkills = ['JavaScript', 'Python', 'React', 'Node.js', 'TypeScript', 'AWS', 'Docker', 'Kubernetes', 'MongoDB', 'PostgreSQL'];
  return commonSkills.filter(skill => 
    text.toLowerCase().includes(skill.toLowerCase())
  );
}

// Main job scouting function
async function scoutJobs() {
  console.log('🔍 Starting AI Job Scout...');
  
  try {
    // Get all jobs from free sources
    const [remoteOKJobs, hackerNewsJobs] = await Promise.all([
      scrapeRemoteOK(),
      scrapeHackerNewsJobs()
    ]);
    
    const allJobs = [...remoteOKJobs, ...hackerNewsJobs];
    console.log(`📊 Found ${allJobs.length} jobs from all sources`);
    
    // Get user preferences from database
    const users = await prisma.user.findMany({
      where: {
        jobAlerts: true // Assuming you have a job alerts preference
      },
      select: {
        id: true,
        email: true,
        jobPreferences: true // Assuming you store preferences
      }
    });
    
    console.log(`👥 Processing ${users.length} users`);
    
    // Process each user
    for (const user of users) {
      try {
        const preferences = user.jobPreferences || {};
        const matchedJobs = await matchJobsWithAI(allJobs, preferences);
        
        // Filter high-scoring matches
        const goodMatches = matchedJobs
          .filter(match => match.matchScore >= 70)
          .slice(0, 5); // Top 5 matches
        
        if (goodMatches.length > 0) {
          // Save to database
          await saveJobMatches(user.id, goodMatches, allJobs);
          
          // Send notification (implement your notification system)
          await sendJobNotification(user, goodMatches, allJobs);
        }
      } catch (error) {
        console.error(`Error processing user ${user.id}:`, error.message);
      }
    }
    
    console.log('✅ Job scouting completed successfully');
  } catch (error) {
    console.error('❌ Job scouting failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Save job matches to database
async function saveJobMatches(userId, matches, allJobs) {
  const jobsToSave = matches.map(match => {
    const job = allJobs.find(j => j.id === match.jobId);
    return {
      userId,
      jobId: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      workType: job.workType,
      description: job.description,
      skills: job.skills,
      url: job.url,
      source: job.source,
      matchScore: match.matchScore,
      postedDate: job.postedDate
    };
  });
  
  // Use upsert to avoid duplicates
  for (const job of jobsToSave) {
    await prisma.jobMatch.upsert({
      where: {
        userId_jobId: {
          userId: job.userId,
          jobId: job.jobId
        }
      },
      update: {
        matchScore: job.matchScore
      },
      create: job
    });
  }
}

// Send notification (webhook or email)
async function sendJobNotification(user, matches, allJobs) {
  if (process.env.JOB_SCOUT_WEBHOOK) {
    try {
      await axios.post(process.env.JOB_SCOUT_WEBHOOK, {
        userId: user.id,
        email: user.email,
        matches: matches.length,
        jobs: matches.map(match => {
          const job = allJobs.find(j => j.id === match.jobId);
          return {
            title: job.title,
            company: job.company,
            matchScore: match.matchScore,
            url: job.url
          };
        })
      });
    } catch (error) {
      console.error('Webhook notification failed:', error.message);
    }
  }
}

// Run the scout
if (require.main === module) {
  scoutJobs().catch(console.error);
}

module.exports = { scoutJobs };