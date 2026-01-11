-- Add new columns to admins table
ALTER TABLE admins 
ADD COLUMN restrictions JSONB DEFAULT '{}',
ADD COLUMN department VARCHAR(100),
ADD COLUMN created_by UUID REFERENCES admins(id),
ADD COLUMN last_activity TIMESTAMP;

-- Create roles table
CREATE TABLE admin_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]',
  is_system_role BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default roles
INSERT INTO admin_roles (name, description, permissions, is_system_role) VALUES
('SUPER_ADMIN', 'Full system access', '["*:*"]', true),
('ADMIN', 'General administration', '["users:read", "users:update", "jobs:read", "jobs:update", "analytics:read"]', true),
('MODERATOR', 'Content moderation', '["users:read", "jobs:read", "jobs:approve", "content:moderate"]', true),
('ANALYST', 'Data analysis', '["analytics:read", "reports:generate", "users:read", "jobs:read"]', true);

-- Add role_id to admins table
ALTER TABLE admins ADD COLUMN role_id UUID REFERENCES admin_roles(id);

-- Update existing admins to use roles
UPDATE admins SET role_id = (SELECT id FROM admin_roles WHERE name = 'SUPER_ADMIN') WHERE role = 'SUPER_ADMIN';
UPDATE admins SET role_id = (SELECT id FROM admin_roles WHERE name = 'ADMIN') WHERE role = 'ADMIN';

-- Create audit log table
CREATE TABLE admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admins(id),
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(100) NOT NULL,
  resource_id VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN DEFAULT TRUE,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_admin_actions_admin_id ON admin_actions(admin_id);
CREATE INDEX idx_admin_actions_created_at ON admin_actions(created_at);