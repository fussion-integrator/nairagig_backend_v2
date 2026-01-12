-- Add missing fields to existing tables

-- Update jobs table (using correct table name)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS paymentStatus VARCHAR(50) DEFAULT 'pending';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS hiredFreelancerId TEXT;

-- Create job_payments table
CREATE TABLE IF NOT EXISTS job_payments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  jobId TEXT NOT NULL,
  freelancerId TEXT,
  clientId TEXT,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  type VARCHAR(100) NOT NULL,
  description TEXT,
  transactionId VARCHAR(255),
  method VARCHAR(100),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (jobId) REFERENCES jobs(id) ON DELETE CASCADE
);

-- Create job_disputes table
CREATE TABLE IF NOT EXISTS job_disputes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  jobId TEXT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'open',
  priority VARCHAR(50) DEFAULT 'medium',
  raisedBy VARCHAR(50) NOT NULL,
  raisedById TEXT NOT NULL,
  resolution TEXT,
  resolvedAt TIMESTAMP NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (jobId) REFERENCES jobs(id) ON DELETE CASCADE
);

-- Update job_activity_logs table to add missing fields
ALTER TABLE job_activity_logs ADD COLUMN IF NOT EXISTS performerId TEXT;

-- Create conversations table if not exists (simplified version)
CREATE TABLE IF NOT EXISTS job_conversations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  jobId TEXT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (jobId) REFERENCES jobs(id) ON DELETE CASCADE
);

-- Create messages table if not exists (simplified version)
CREATE TABLE IF NOT EXISTS job_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversationId TEXT NOT NULL,
  senderId TEXT NOT NULL,
  senderType VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversationId) REFERENCES job_conversations(id) ON DELETE CASCADE
);

-- Update job_applications table to add missing field
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS rejectionReason TEXT;