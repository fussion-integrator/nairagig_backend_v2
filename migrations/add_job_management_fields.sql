-- Add missing job management fields to jobs table
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS managedByNairagig BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS isFlagged BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS flagReason TEXT,
ADD COLUMN IF NOT EXISTS flaggedAt TIMESTAMP,
ADD COLUMN IF NOT EXISTS flaggedBy TEXT,
ADD COLUMN IF NOT EXISTS publishedAt TIMESTAMP,
ADD COLUMN IF NOT EXISTS hiredFreelancerId TEXT;

-- Add foreign key constraint for hiredFreelancerId
ALTER TABLE jobs 
ADD CONSTRAINT fk_jobs_hired_freelancer 
FOREIGN KEY (hiredFreelancerId) REFERENCES users(id);