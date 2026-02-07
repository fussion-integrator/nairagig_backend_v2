# NairaGig Backend - AWS App Runner Deployment Guide

## Prerequisites
- AWS Account
- GitHub repository with backend code
- RDS PostgreSQL database
- Redis instance (Upstash or ElastiCache)

## Cost Estimate
- **App Runner**: ~$25-40/month (1 vCPU, 2GB RAM)
- **RDS PostgreSQL (db.t4g.micro)**: ~$15/month (Free tier: 1 year)
- **Upstash Redis**: ~$0-10/month (pay-per-request)
- **Total**: ~$40-65/month

---

## Step 1: Setup RDS PostgreSQL Database

### 1.1 Create RDS Instance
```bash
# Via AWS Console:
1. Go to RDS → Create database
2. Choose PostgreSQL (version 15+)
3. Template: Free tier (or Production for better performance)
4. DB instance: db.t4g.micro
5. Storage: 20 GB (auto-scaling enabled)
6. DB name: nairagig
7. Master username: nairagig_admin
8. Master password: [Generate strong password]
9. VPC: Default VPC
10. Public access: Yes (for initial setup)
11. Security group: Create new (allow port 5432 from your IP)
```

### 1.2 Get Database URL
```
postgresql://nairagig_admin:[PASSWORD]@[RDS_ENDPOINT]:5432/nairagig
```

---

## Step 2: Setup Redis (Upstash - Recommended)

### 2.1 Create Upstash Redis
```bash
1. Go to https://upstash.com
2. Sign up/Login
3. Create Database
   - Name: nairagig-redis
   - Region: Choose closest to your AWS region
   - Type: Regional (cheaper)
4. Copy Redis URL (starts with rediss://)
```

**Alternative: AWS ElastiCache**
```bash
# If you prefer AWS ElastiCache:
1. Go to ElastiCache → Create Redis cluster
2. Cluster mode: Disabled
3. Node type: cache.t4g.micro
4. Number of replicas: 0
5. Subnet group: Default
6. Security group: Allow port 6379
```

---

## Step 3: Prepare Environment Variables

Create a file `env-secrets.txt` with all required variables:

```bash
# Database
DATABASE_URL=postgresql://nairagig_admin:[PASSWORD]@[RDS_ENDPOINT]:5432/nairagig

# Redis
REDIS_URL=rediss://default:[PASSWORD]@[UPSTASH_ENDPOINT]:6379

# JWT
JWT_SECRET=[Generate: openssl rand -base64 32]
JWT_REFRESH_SECRET=[Generate: openssl rand -base64 32]

# Session
SESSION_SECRET=[Generate: openssl rand -base64 32]

# Email (Gmail)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=[Gmail App Password]
EMAIL_FROM=noreply@nairagig.com

# OAuth (Optional - can add later)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=https://[YOUR_APP_RUNNER_URL]/api/v1/auth/google/callback

# AWS S3 (for file uploads)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=[Your AWS Access Key]
AWS_SECRET_ACCESS_KEY=[Your AWS Secret Key]
AWS_S3_BUCKET=nairagig-uploads

# Paystack
PAYSTACK_SECRET_KEY=[Your Paystack Secret Key]
PAYSTACK_PUBLIC_KEY=[Your Paystack Public Key]

# AI Services (Optional)
OPENAI_API_KEY=[Your OpenAI Key]
GEMINI_API_KEY=[Your Google Gemini Key]

# App Config
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://nairagig.com
CORS_ORIGIN=https://nairagig.com,https://www.nairagig.com
```

---

## Step 4: Update apprunner.yaml

Replace the existing file with:

```yaml
version: 1.0
runtime: nodejs18
build:
  commands:
    pre-build:
      - npm ci
      - npx prisma generate
    build:
      - npm run build
    post-build:
      - npx prisma migrate deploy
run:
  command: npm start
  network:
    port: 3000
  env:
    - name: NODE_ENV
      value: production
    - name: PORT
      value: 3000
```

---

## Step 5: Deploy to AWS App Runner

### 5.1 Via AWS Console (Easiest)

```bash
1. Go to AWS App Runner → Create service

2. Source:
   - Repository type: Source code repository
   - Connect to GitHub
   - Select repository: nairagig_backend_v2
   - Branch: main
   - Deployment trigger: Automatic

3. Build settings:
   - Configuration file: Use apprunner.yaml
   - Runtime: Nodejs 18

4. Service settings:
   - Service name: nairagig-backend
   - Virtual CPU: 1 vCPU
   - Memory: 2 GB
   - Port: 3000
   - Environment variables: Add all from env-secrets.txt

5. Auto scaling:
   - Min instances: 1
   - Max instances: 3
   - Concurrency: 100

6. Health check:
   - Protocol: HTTP
   - Path: /health
   - Interval: 30 seconds
   - Timeout: 5 seconds
   - Healthy threshold: 1
   - Unhealthy threshold: 3

7. Security:
   - Instance role: Create new (or use existing with S3, SES permissions)

8. Review and Create
```

### 5.2 Via AWS CLI

```bash
# Install AWS CLI
brew install awscli  # macOS
# or
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure AWS CLI
aws configure
# Enter: Access Key ID, Secret Access Key, Region (us-east-1), Output format (json)

# Create App Runner service
aws apprunner create-service \
  --service-name nairagig-backend \
  --source-configuration '{
    "CodeRepository": {
      "RepositoryUrl": "https://github.com/YOUR_USERNAME/nairagig_backend_v2",
      "SourceCodeVersion": {
        "Type": "BRANCH",
        "Value": "main"
      },
      "CodeConfiguration": {
        "ConfigurationSource": "API",
        "CodeConfigurationValues": {
          "Runtime": "NODEJS_18",
          "BuildCommand": "npm ci && npx prisma generate && npm run build",
          "StartCommand": "npm start",
          "Port": "3000",
          "RuntimeEnvironmentVariables": {
            "NODE_ENV": "production",
            "DATABASE_URL": "postgresql://...",
            "REDIS_URL": "rediss://...",
            "JWT_SECRET": "...",
            "FRONTEND_URL": "https://nairagig.com"
          }
        }
      }
    },
    "AutoDeploymentsEnabled": true
  }' \
  --instance-configuration '{
    "Cpu": "1 vCPU",
    "Memory": "2 GB"
  }' \
  --health-check-configuration '{
    "Protocol": "HTTP",
    "Path": "/health",
    "Interval": 30,
    "Timeout": 5,
    "HealthyThreshold": 1,
    "UnhealthyThreshold": 3
  }'
```

---

## Step 6: Run Database Migrations

```bash
# After deployment, run migrations via App Runner console:
1. Go to App Runner → Your service → Logs
2. Check if migrations ran automatically
3. If not, manually trigger:

# Or connect to RDS and run:
npx prisma migrate deploy
```

---

## Step 7: Configure Custom Domain (Optional)

```bash
1. Go to App Runner → Your service → Custom domains
2. Add domain: api.nairagig.com
3. Add CNAME record in your DNS:
   - Name: api
   - Value: [App Runner domain]
   - TTL: 300

4. Wait for SSL certificate validation (5-10 minutes)
```

---

## Step 8: Update Frontend Environment

Update `nairagig_website/.env.local`:
```bash
NEXT_PUBLIC_API_URL=https://[YOUR_APP_RUNNER_URL]
# or
NEXT_PUBLIC_API_URL=https://api.nairagig.com
```

Redeploy frontend on AWS Amplify.

---

## Step 9: Monitoring & Logs

### View Logs
```bash
# Via Console:
App Runner → Your service → Logs → View in CloudWatch

# Via CLI:
aws logs tail /aws/apprunner/nairagig-backend/service --follow
```

### Setup Alarms
```bash
1. Go to CloudWatch → Alarms → Create alarm
2. Metrics:
   - CPU Utilization > 80%
   - Memory Utilization > 80%
   - HTTP 5xx errors > 10
   - Request count < 1 (service down)
3. Actions: Send SNS notification to your email
```

---

## Step 10: Security Hardening

### 10.1 Update RDS Security Group
```bash
# Remove public access after initial setup
1. RDS → Your database → Modify
2. Public access: No
3. Security group: Only allow App Runner VPC
```

### 10.2 Enable AWS WAF (Optional)
```bash
1. Go to AWS WAF → Create web ACL
2. Add rules:
   - Rate limiting (1000 requests/5 min per IP)
   - SQL injection protection
   - XSS protection
3. Associate with App Runner service
```

### 10.3 Setup Secrets Manager
```bash
# Store sensitive env vars in AWS Secrets Manager
aws secretsmanager create-secret \
  --name nairagig/backend/env \
  --secret-string file://env-secrets.txt

# Update App Runner to use Secrets Manager
# (requires IAM role with secretsmanager:GetSecretValue permission)
```

---

## Troubleshooting

### Build Fails
```bash
# Check logs in App Runner console
# Common issues:
- Missing environment variables
- Prisma schema errors
- TypeScript compilation errors

# Fix: Update code, push to GitHub (auto-deploys)
```

### Database Connection Fails
```bash
# Check:
1. DATABASE_URL is correct
2. RDS security group allows App Runner
3. Database is running
4. Credentials are correct

# Test connection:
psql "postgresql://nairagig_admin:[PASSWORD]@[RDS_ENDPOINT]:5432/nairagig"
```

### High Costs
```bash
# Reduce costs:
1. Scale down to 0.25 vCPU, 0.5 GB RAM (for testing)
2. Use RDS free tier (db.t4g.micro)
3. Use Upstash Redis (serverless)
4. Set max instances to 1 (no auto-scaling)
5. Use AWS Lightsail instead (~$10/month)
```

---

## Rollback Deployment

```bash
# Via Console:
App Runner → Your service → Deployments → Select previous → Rollback

# Via CLI:
aws apprunner start-deployment \
  --service-arn [YOUR_SERVICE_ARN] \
  --source-version [PREVIOUS_COMMIT_SHA]
```

---

## Next Steps

1. ✅ Deploy backend to App Runner
2. ✅ Setup monitoring & alerts
3. ✅ Configure custom domain
4. ✅ Update frontend API URL
5. ✅ Test all endpoints
6. ✅ Setup CI/CD pipeline
7. ✅ Enable auto-scaling
8. ✅ Setup backup strategy

---

## Support

- AWS App Runner Docs: https://docs.aws.amazon.com/apprunner/
- Prisma Docs: https://www.prisma.io/docs
- Contact: support@nairagig.com
