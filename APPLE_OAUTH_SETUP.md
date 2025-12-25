# Apple OAuth Setup Instructions

## Key Information
- **Service ID**: com.fussionic.nairaGig.web
- **Key ID**: UWMR2TP5W2
- **Key Name**: NairaGig Sign In Key

## Required Actions

### 1. Download Apple Private Key
- Go to Apple Developer Console > Certificates, Identifiers & Profiles > Keys
- Find "NairaGig Sign In Key" (Key ID: UWMR2TP5W2)
- Click "Download" to get the `.p8` file
- **IMPORTANT**: This can only be downloaded once!

### 2. Save the Key File
- Rename the downloaded file to: `AuthKey_UWMR2TP5W2.p8`
- Place it in: `nairagig_backend_v2/keys/AuthKey_UWMR2TP5W2.p8`

### 3. Update Team ID
- Find your Team ID in Apple Developer Console (top right corner)
- Update `APPLE_TEAM_ID` in `.env` file

### 4. Security Notes
- Never commit the `.p8` file to version control
- The `keys/` directory is already in `.gitignore`
- Keep a secure backup of the key file

## Current Configuration Status
- ✅ Service ID configured: com.fussionic.nairaGig.web
- ✅ Key ID configured: UWMR2TP5W2
- ✅ Private key file: AuthKey_UWMR2TP5W2.p8 placed in keys/ directory
- ✅ Team ID configured: FJZ3U5FVZJ

## Testing
Apple OAuth can only be tested with HTTPS URLs. Development testing requires:
- Deploy to production environment with HTTPS
- Or use ngrok/similar tool for local HTTPS testing