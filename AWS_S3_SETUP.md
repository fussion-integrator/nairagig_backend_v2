# AWS S3 Setup for NairaGig

## Quick Setup (5 minutes)

### Step 1: Create S3 Bucket
1. Go to: https://s3.console.aws.amazon.com/s3/
2. Click "Create bucket"
3. Settings:
   - **Bucket name**: `nairagig-uploads`
   - **Region**: `us-east-1`
   - **Block Public Access**: UNCHECK "Block all public access"
   - Check the warning acknowledgment
4. Click "Create bucket"

### Step 2: Configure Bucket Policy (Allow Public Read)
1. Click on your bucket: `nairagig-uploads`
2. Go to "Permissions" tab
3. Scroll to "Bucket policy"
4. Click "Edit" and paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::nairagig-uploads/*"
    }
  ]
}
```

5. Click "Save changes"

### Step 3: Enable CORS
1. Still in "Permissions" tab
2. Scroll to "Cross-origin resource sharing (CORS)"
3. Click "Edit" and paste:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```

4. Click "Save changes"

### Step 4: Create IAM User
1. Go to: https://console.aws.amazon.com/iam/
2. Click "Users" → "Create user"
3. **User name**: `nairagig-s3-user`
4. Click "Next"
5. **Permissions**: Select "Attach policies directly"
6. Search and check: `AmazonS3FullAccess`
7. Click "Next" → "Create user"

### Step 5: Generate Access Keys
1. Click on the user: `nairagig-s3-user`
2. Go to "Security credentials" tab
3. Scroll to "Access keys"
4. Click "Create access key"
5. **Use case**: Select "Application running outside AWS"
6. Click "Next" → "Create access key"
7. **IMPORTANT**: Copy both values:
   - **Access key ID**: `AKIA...` (20 characters)
   - **Secret access key**: (40 characters, only shown once!)
8. Click "Done"

### Step 6: Add to Environment Variables

Add these to your App Runner environment variables:

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA... (your access key)
AWS_SECRET_ACCESS_KEY=... (your secret key)
AWS_S3_BUCKET=nairagig-uploads
```

---

## Test Upload (Optional)

```bash
# Install AWS CLI
brew install awscli

# Configure
aws configure
# Enter: Access Key ID, Secret Access Key, Region (us-east-1), Output (json)

# Test upload
echo "test" > test.txt
aws s3 cp test.txt s3://nairagig-uploads/test.txt

# Test public access
curl https://nairagig-uploads.s3.us-east-1.amazonaws.com/test.txt
```

---

## Security Best Practice (Optional)

Instead of `AmazonS3FullAccess`, create custom policy with minimal permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::nairagig-uploads",
        "arn:aws:s3:::nairagig-uploads/*"
      ]
    }
  ]
}
```

---

## Cost

- **Storage**: $0.023/GB/month (~$0.23 for 10GB)
- **Requests**: $0.005 per 1,000 PUT requests
- **Data Transfer**: First 100GB/month free
- **Estimated**: ~$1-5/month for typical usage

---

## What Gets Uploaded

- User profile pictures
- Gig attachments
- Project files
- Challenge submissions
- Company logos
- Portfolio items

---

## Alternative: Skip S3 for Now

You can deploy without S3 and add it later. File uploads will fail until configured.

To deploy without S3, just skip these environment variables in App Runner.
