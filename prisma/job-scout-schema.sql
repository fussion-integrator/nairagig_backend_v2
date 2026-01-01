-- Add to existing schema.prisma

model JobScoutSearch {
  id                String   @id @default(uuid())
  userId            String
  searchQuery       String
  jobTitle          String?
  jobDescription    String?
  companies         String[] @default([])
  salaryMin         Decimal?
  salaryMax         Decimal?
  location          String?
  workType          WorkType @default(REMOTE)
  experienceLevel   ExperienceLevel @default(INTERMEDIATE)
  skills            String[] @default([])
  industries        String[] @default([])
  benefits          String[] @default([])
  companySize       CompanySize?
  isActive          Boolean  @default(true)
  alertFrequency    AlertFrequency @default(DAILY)
  lastSearched      DateTime?
  resultsCount      Int      @default(0)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  results           JobScoutResult[]

  @@map("job_scout_searches")
}

model JobScoutResult {
  id                String   @id @default(uuid())
  searchId          String
  externalId        String   // Original job ID from source
  source            JobSource
  title             String
  company           String
  companyLogo       String?
  description       String
  location          String?
  workType          WorkType @default(REMOTE)
  salaryMin         Decimal?
  salaryMax         Decimal?
  currency          String   @default("USD")
  experienceLevel   ExperienceLevel?
  skills            String[] @default([])
  benefits          String[] @default([])
  applicationUrl    String
  postedDate        DateTime
  expiryDate        DateTime?
  isBookmarked      Boolean  @default(false)
  isApplied         Boolean  @default(false)
  matchScore        Decimal  @default(0)
  aiInsights        Json?    // AI-generated insights
  companyInfo       Json?    // Company details from AI
  salaryInsights    Json?    // Salary analysis
  createdAt         DateTime @default(now())
  search            JobScoutSearch @relation(fields: [searchId], references: [id], onDelete: Cascade)

  @@unique([externalId, source])
  @@map("job_scout_results")
}

model JobScoutAlert {
  id          String   @id @default(uuid())
  userId      String
  searchId    String
  jobId       String
  alertType   AlertType
  isRead      Boolean  @default(false)
  sentAt      DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  search      JobScoutSearch @relation(fields: [searchId], references: [id], onDelete: Cascade)

  @@map("job_scout_alerts")
}

enum WorkType {
  REMOTE
  HYBRID
  ONSITE
  FLEXIBLE
}

enum CompanySize {
  STARTUP
  SMALL
  MEDIUM
  LARGE
  ENTERPRISE
}

enum JobSource {
  LINKEDIN
  INDEED
  GLASSDOOR
  ANGELLIST
  REMOTEOK
  STACKOVERFLOW
  GITHUB
  COMPANY_WEBSITE
  NAIRAGIG
}

enum AlertFrequency {
  INSTANT
  HOURLY
  DAILY
  WEEKLY
}

enum AlertType {
  NEW_MATCH
  SALARY_INCREASE
  COMPANY_MATCH
  SKILL_MATCH
  DEADLINE_REMINDER
}