# Admin System - Phase 1 Implementation

## Overview
Phase 1 implements the core admin authentication system with OAuth-only login, invitation-based access control, and comprehensive permission management.

## Features Implemented

### 1. Database Schema
- **Admin Model**: Core admin user management
- **AdminPermission**: Granular permission system (25+ permissions)
- **AdminInvitation**: Invitation-based onboarding
- **AdminSession**: Secure session management
- **AdminLoginHistory**: Login tracking and audit
- **AdminAuditLog**: Comprehensive activity logging

### 2. Authentication System
- **OAuth-only Login**: Google OAuth integration
- **Super Admin Restriction**: Only `fussion.integration@gmail.com` can be super admin
- **Session Management**: JWT-based secure sessions with 24-hour expiry
- **Permission-based Access**: Role-based permissions with granular control

### 3. API Endpoints

#### Public Endpoints
- `POST /api/v1/admin/auth/login` - OAuth login
- `POST /api/v1/admin/auth/accept-invitation` - Accept admin invitation
- `GET /api/v1/admin/auth/validate-invitation/:token` - Validate invitation token

#### Protected Endpoints
- `POST /api/v1/admin/auth/logout` - Logout
- `GET /api/v1/admin/auth/me` - Get current admin info
- `POST /api/v1/admin/auth/invite` - Invite new admin (Super Admin only)

### 4. Permission System
**User Management**: VIEW_USERS, EDIT_USERS, SUSPEND_USERS, DELETE_USERS, VERIFY_USERS
**Job Management**: VIEW_JOBS, EDIT_JOBS, DELETE_JOBS, FEATURE_JOBS, MODERATE_JOBS
**Project Management**: VIEW_PROJECTS, EDIT_PROJECTS, CANCEL_PROJECTS, RESOLVE_DISPUTES
**Financial Management**: VIEW_TRANSACTIONS, PROCESS_WITHDRAWALS, REFUND_PAYMENTS, VIEW_FINANCIAL_REPORTS
**Content Management**: MODERATE_MESSAGES, DELETE_CONTENT, MANAGE_PORTFOLIOS, MANAGE_REVIEWS
**System Management**: VIEW_ANALYTICS, MANAGE_CATEGORIES, MANAGE_CHALLENGES, SYSTEM_SETTINGS
**Admin Management**: MANAGE_ADMINS, VIEW_AUDIT_LOGS, SYSTEM_MAINTENANCE (Super Admin only)

## Setup Instructions

### 1. Environment Variables
Add to your `.env` file:
```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
JWT_SECRET=your_jwt_secret
```

### 2. Database Migration
```bash
# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Setup initial super admin
npm run setup:admin
```

### 3. Initial Super Admin
The setup script creates the initial super admin with:
- **Email**: fussion.integration@gmail.com
- **Role**: SUPER_ADMIN
- **Permissions**: All permissions granted

## Security Features

### 1. OAuth-Only Authentication
- No password-based login
- Google OAuth integration
- Email verification through OAuth provider

### 2. Super Admin Restriction
- Only `fussion.integration@gmail.com` can have SUPER_ADMIN role
- Enforced at login and invitation levels

### 3. Session Security
- JWT-based sessions with 24-hour expiry
- Secure HTTP-only cookies
- IP address and user agent tracking

### 4. Audit Logging
- All admin actions logged
- IP address and user agent tracking
- Old/new value tracking for changes

## Usage Examples

### 1. Admin Login (Frontend)
```javascript
// Google OAuth login
const response = await fetch('/api/v1/admin/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: googleIdToken }),
  credentials: 'include'
});
```

### 2. Invite Admin (Super Admin)
```javascript
const response = await fetch('/api/v1/admin/auth/invite', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@example.com',
    role: 'ADMIN'
  }),
  credentials: 'include'
});
```

### 3. Accept Invitation
```javascript
const response = await fetch('/api/v1/admin/auth/accept-invitation', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: 'invitation_token',
    firstName: 'John',
    lastName: 'Doe'
  })
});
```

## Next Steps (Phase 2)
- Admin dashboard UI components
- User management interface
- Job moderation tools
- Financial management dashboard
- System analytics and reporting

## Files Created/Modified
- `prisma/schema.prisma` - Added admin models
- `src/services/admin.service.ts` - Admin business logic
- `src/controllers/admin.controller.ts` - Admin API endpoints
- `src/middleware/adminAuth.ts` - Admin authentication middleware
- `src/routes/admin.routes.ts` - Admin route definitions
- `src/server.ts` - Added admin routes
- `scripts/setup-admin.ts` - Initial admin setup script
- `package.json` - Added setup script