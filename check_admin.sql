-- Check if admin user exists in the Admin table
SELECT "id", "email", "firstName", "lastName", "role", "status", "createdAt", "updatedAt"
FROM "Admin" 
WHERE "email" = 'fussion.integration@gmail.com';

-- If no results, check all admin users
SELECT "id", "email", "firstName", "lastName", "role", "status", "createdAt", "updatedAt"
FROM "Admin" 
ORDER BY "createdAt" DESC;