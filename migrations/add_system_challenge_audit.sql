-- Add SystemChallengeAudit table for tracking admin actions on system challenges
CREATE TABLE IF NOT EXISTS system_challenge_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_type VARCHAR(50) NOT NULL, -- 'LINKEDIN', 'FACEBOOK', 'TWITTER', 'CONTENT_CREATOR', 'REFERRAL'
    action VARCHAR(100) NOT NULL, -- 'APPROVE_MILESTONE', 'REJECT_MILESTONE', 'APPROVE_POST', 'REJECT_POST', 'UPDATE_PARAMS'
    admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    resource_id UUID, -- milestone ID, post ID, etc.
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_system_challenge_audits_challenge_type ON system_challenge_audits(challenge_type);
CREATE INDEX IF NOT EXISTS idx_system_challenge_audits_action ON system_challenge_audits(action);
CREATE INDEX IF NOT EXISTS idx_system_challenge_audits_admin_id ON system_challenge_audits(admin_id);
CREATE INDEX IF NOT EXISTS idx_system_challenge_audits_user_id ON system_challenge_audits(user_id);
CREATE INDEX IF NOT EXISTS idx_system_challenge_audits_created_at ON system_challenge_audits(created_at);

-- Add system challenge configuration table for managing challenge parameters
CREATE TABLE IF NOT EXISTS system_challenge_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_type VARCHAR(50) NOT NULL UNIQUE, -- 'LINKEDIN', 'FACEBOOK', 'TWITTER', 'CONTENT_CREATOR', 'REFERRAL'
    is_active BOOLEAN DEFAULT true,
    milestone_targets JSONB DEFAULT '{}', -- e.g., {"reactions": 50, "comments": 10}
    reward_amounts JSONB DEFAULT '{}', -- e.g., {"per_milestone": 5000}
    settings JSONB DEFAULT '{}', -- Additional challenge-specific settings
    resources JSONB DEFAULT '{}', -- Banners, videos, links, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default configurations for each challenge type
INSERT INTO system_challenge_configs (challenge_type, milestone_targets, reward_amounts, settings) VALUES
('LINKEDIN', '{"reactions": 50, "comments": 50}', '{"per_milestone": 5000}', '{"description": "Post about NairaGig on LinkedIn and earn ₦5,000 per 50 reactions/comments!"}'),
('FACEBOOK', '{"reactions": 50, "comments": 50}', '{"per_milestone": 5000}', '{"description": "Share NairaGig on Facebook and earn ₦5,000 per 50 reactions/comments!"}'),
('TWITTER', '{"retweets": 25, "likes": 50}', '{"per_milestone": 5000}', '{"description": "Tweet about NairaGig and earn ₦5,000 per 25 retweets or 50 likes!"}'),
('CONTENT_CREATOR', '{"views": 1000, "reactions": 100}', '{"per_milestone": 10000}', '{"description": "Create content about NairaGig and earn based on views and engagement!"}'),
('REFERRAL', '{"successful_referrals": 1}', '{"per_referral": 2000}', '{"description": "Refer friends to NairaGig and earn ₦2,000 per successful referral!"}')
ON CONFLICT (challenge_type) DO NOTHING;