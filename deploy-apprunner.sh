#!/bin/bash

# NairaGig Backend - AWS App Runner Quick Deploy Script
# This script helps you deploy the backend to AWS App Runner

set -e

echo "🚀 NairaGig Backend - AWS App Runner Deployment"
echo "================================================"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install it first:"
    echo "   macOS: brew install awscli"
    echo "   Linux: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    exit 1
fi

# Check if AWS is configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS CLI not configured. Please run: aws configure"
    exit 1
fi

echo "✅ AWS CLI configured"
echo ""

# Get user inputs
read -p "Enter your GitHub repository URL (e.g., https://github.com/username/nairagig_backend_v2): " REPO_URL
read -p "Enter branch name (default: main): " BRANCH
BRANCH=${BRANCH:-main}

read -p "Enter RDS PostgreSQL connection string: " DATABASE_URL
read -p "Enter Redis connection string: " REDIS_URL
read -p "Enter JWT secret (or press Enter to generate): " JWT_SECRET
if [ -z "$JWT_SECRET" ]; then
    JWT_SECRET=$(openssl rand -base64 32)
    echo "Generated JWT_SECRET: $JWT_SECRET"
fi

read -p "Enter frontend URL (e.g., https://nairagig.com): " FRONTEND_URL

echo ""
echo "📝 Configuration Summary:"
echo "  Repository: $REPO_URL"
echo "  Branch: $BRANCH"
echo "  Frontend URL: $FRONTEND_URL"
echo ""
read -p "Continue with deployment? (y/n): " CONFIRM

if [ "$CONFIRM" != "y" ]; then
    echo "Deployment cancelled"
    exit 0
fi

echo ""
echo "🔨 Creating App Runner service..."

# Create service configuration JSON
cat > /tmp/apprunner-config.json <<EOF
{
  "ServiceName": "nairagig-backend",
  "SourceConfiguration": {
    "AutoDeploymentsEnabled": true,
    "CodeRepository": {
      "RepositoryUrl": "$REPO_URL",
      "SourceCodeVersion": {
        "Type": "BRANCH",
        "Value": "$BRANCH"
      },
      "CodeConfiguration": {
        "ConfigurationSource": "REPOSITORY",
        "CodeConfigurationValues": {
          "Runtime": "NODEJS_18",
          "Port": "3000",
          "RuntimeEnvironmentVariables": {
            "NODE_ENV": "production",
            "PORT": "3000",
            "DATABASE_URL": "$DATABASE_URL",
            "REDIS_URL": "$REDIS_URL",
            "JWT_SECRET": "$JWT_SECRET",
            "FRONTEND_URL": "$FRONTEND_URL",
            "CORS_ORIGIN": "$FRONTEND_URL"
          }
        }
      }
    }
  },
  "InstanceConfiguration": {
    "Cpu": "1 vCPU",
    "Memory": "2 GB"
  },
  "HealthCheckConfiguration": {
    "Protocol": "HTTP",
    "Path": "/health",
    "Interval": 30,
    "Timeout": 5,
    "HealthyThreshold": 1,
    "UnhealthyThreshold": 3
  }
}
EOF

# Deploy to App Runner
aws apprunner create-service --cli-input-json file:///tmp/apprunner-config.json

echo ""
echo "✅ Deployment initiated!"
echo ""
echo "📊 Check deployment status:"
echo "   aws apprunner list-services"
echo ""
echo "📝 View logs:"
echo "   aws logs tail /aws/apprunner/nairagig-backend/service --follow"
echo ""
echo "🌐 Get service URL:"
echo "   aws apprunner describe-service --service-arn [SERVICE_ARN] --query 'Service.ServiceUrl'"
echo ""
echo "⏳ Deployment typically takes 5-10 minutes"

# Cleanup
rm /tmp/apprunner-config.json
