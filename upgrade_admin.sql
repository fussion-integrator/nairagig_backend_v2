-- Update admin user to SUPER_ADMIN role and grant all permissions
-- Run this in your database console or via Prisma Studio

UPDATE "Admin" 
SET 
  "role" = 'SUPER_ADMIN',
  "updatedAt" = NOW()
WHERE "email" = 'fussion.integration@gmail.com';

-- Verify the update
SELECT "id", "email", "firstName", "lastName", "role", "status", "createdAt", "updatedAt"
FROM "Admin" 
WHERE "email" = 'fussion.integration@gmail.com';