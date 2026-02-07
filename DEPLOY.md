# Deploy NairaGig Backend to AWS App Runner

## Quick Deploy Steps

### 1. Go to AWS App Runner Console
https://console.aws.amazon.com/apprunner/

### 2. Create Service
- Click "Create service"

### 3. Source Configuration
- **Repository type**: Source code repository
- Click "Add new" to connect GitHub
- Authorize AWS Connector for GitHub
- **Repository**: Select your backend repository
- **Branch**: main
- **Deployment trigger**: Automatic

### 4. Build Configuration
- **Configuration file**: Use a configuration file
- **Configuration file**: apprunner.yaml
- Runtime will be detected automatically (nodejs18)

### 5. Service Settings
- **Service name**: nairagig-backend
- **Virtual CPU**: 1 vCPU
- **Memory**: 2 GB
- **Port**: 3000

### 6. Environment Variables
Copy ALL variables from `.env.production` file:

```
NODE_ENV=production
PORT=3000
API_VERSION=v1
DATABASE_URL=postgresql://nairagig_admin:LezPWCOXrOaqiuN6qtoa@nairagig.cdsce6oms614.us-east-1.rds.amazonaws.com:5432/postgres?schema=public&sslmode=require
REDIS_URL=redis://default:2P4KpO2hGXHyPTgDm8TVvwDSLIuKCuqk@redis-17689.c273.us-east-1-2.ec2.cloud.redislabs.com:17689
JWT_SECRET=K2jDK3p74WgS5LW8a7QwPZBPBFhQ18Pbe+DotyKqhK8=
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=pwSPAGiMO4OCJEpIg5rvqud194WvvxUDLKbcLUlVAk8=
JWT_REFRESH_EXPIRES_IN=30d
SESSION_SECRET=C/UTVksEmsorX79i6IHLV+wYdLQetPHLrlkpu2wu/KM=
ENCRYPTION_KEY=L3Pl1tnBip9xpsr8M1ZHB9EAr4zkhYa76iWk8mCW0Kw=
BCRYPT_ROUNDS=12
CORS_ORIGIN=https://main.d2yfwi0yjqwqxo.amplifyapp.com,https://nairagig.com,https://www.nairagig.com
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION=900000
CONCURRENT_SESSIONS=3
TOKEN_BLACKLIST_TTL=86400
FRONTEND_URL=https://main.d2yfwi0yjqwqxo.amplifyapp.com
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=jpg,jpeg,png,pdf,doc,docx
AWS_REGION=us-east-1
PAYSTACK_SECRET_KEY=sk_test_cb8c3d814d27b3c0863779c1a5ec28b0b0fab33d
PAYSTACK_PUBLIC_KEY=pk_test_42374fd7a9094b271918bc92e059de06db81a656
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
FIREBASE_PROJECT_ID=naira-gig-7eac0
FIREBASE_API_KEY=AIzaSyBkiSlBocc4ytAa-w2W6GJYAjzqk95ySIs
FIREBASE_AUTH_DOMAIN=naira-gig-7eac0.firebaseapp.com
FIREBASE_STORAGE_BUCKET=naira-gig-7eac0.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=42986176518
FIREBASE_APP_ID=1:42986176518:web:f90330deffb2725e8e4387
OPENAI_API_KEY=your-openai-api-key
LOG_LEVEL=info
LOG_FILE=logs/app.log
```

**Note**: Skip AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET, SMTP_* for now (add later when needed)

### 7. Auto Scaling
- **Min instances**: 1
- **Max instances**: 3
- **Concurrency**: 100

### 8. Health Check
- **Protocol**: HTTP
- **Path**: /health
- **Interval**: 30 seconds
- **Timeout**: 5 seconds
- **Healthy threshold**: 1
- **Unhealthy threshold**: 3

### 9. Security
- **Instance role**: Create new service role (default)

### 10. Review and Create
- Review all settings
- Click "Create & deploy"

---

## After Deployment (5-10 minutes)

### 1. Get Your Backend URL
- App Runner will provide a URL like: `https://abc123.us-east-1.awsapprunner.com`

### 2. Test Health Endpoint
```bash
curl https://YOUR_APP_RUNNER_URL/health
```

### 3. Check Logs
- Go to App Runner → Your service → Logs
- Verify Prisma migrations ran successfully
- Check for any errors

### 4. Update Frontend
- Go to AWS Amplify → Your app → Environment variables
- Add/Update: `NEXT_PUBLIC_API_URL=https://YOUR_APP_RUNNER_URL`
- Redeploy frontend

---

## Optional: Custom Domain

### Setup api.nairagig.com
1. App Runner → Your service → Custom domains
2. Add domain: `api.nairagig.com`
3. Copy the validation records
4. Add CNAME records in your DNS:
   - Name: `api`
   - Value: `[App Runner domain]`
   - TTL: 300
5. Wait 5-10 minutes for SSL certificate

---

## Troubleshooting

### Build Fails
- Check logs in App Runner console
- Verify apprunner.yaml is correct
- Check package.json has "build" script

### Database Connection Fails
- Verify DATABASE_URL is correct
- Check RDS security group allows all IPs (0.0.0.0/0) temporarily
- Test connection from local machine

### Redis Connection Fails
- Verify REDIS_URL is correct
- Check Redis Cloud dashboard for connection issues

---

## Cost Estimate

- App Runner: ~$25-40/month
- RDS PostgreSQL: ~$15/month (free tier 1 year)
- Redis Cloud: $0 (free tier)
- **Total**: ~$25-55/month

---

## Next Steps After Deployment

1. ✅ Test all API endpoints
2. ✅ Setup S3 bucket for file uploads
3. ✅ Configure email service (Gmail or AWS SES)
4. ✅ Setup monitoring alerts
5. ✅ Configure custom domain
6. ✅ Update mobile app API URL
7. ✅ Test payment integration
8. ✅ Enable production OAuth callbacks
