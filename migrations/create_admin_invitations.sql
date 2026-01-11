-- Create admin invitations table if it doesn't exist
CREATE TABLE IF NOT EXISTS admin_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  role_id UUID REFERENCES admin_roles(id),
  department VARCHAR(100),
  restrictions JSONB DEFAULT '{}',
  invited_by UUID REFERENCES admins(id),
  status VARCHAR(20) DEFAULT 'PENDING',
  token VARCHAR(255) UNIQUE,
  expires_at TIMESTAMP,
  accepted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_admin_invitations_email ON admin_invitations(email);
CREATE INDEX IF NOT EXISTS idx_admin_invitations_token ON admin_invitations(token);
CREATE INDEX IF NOT EXISTS idx_admin_invitations_status ON admin_invitations(status);

-- Update the existing admins table to support the new fields if they don't exist
DO $$ 
BEGIN
  -- Add role_id column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admins' AND column_name = 'role_id') THEN
    ALTER TABLE admins ADD COLUMN role_id UUID REFERENCES admin_roles(id);
  END IF;
  
  -- Add department column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admins' AND column_name = 'department') THEN
    ALTER TABLE admins ADD COLUMN department VARCHAR(100);
  END IF;
  
  -- Add restrictions column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admins' AND column_name = 'restrictions') THEN
    ALTER TABLE admins ADD COLUMN restrictions JSONB DEFAULT '{}';
  END IF;
  
  -- Add invited_by column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admins' AND column_name = 'invited_by') THEN
    ALTER TABLE admins ADD COLUMN invited_by UUID REFERENCES admins(id);
  END IF;
END $$;