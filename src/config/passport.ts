import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as OAuth2Strategy } from 'passport-oauth2';
import { Strategy as AppleStrategy } from 'passport-apple';
import { config } from '@/config/config';
import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { getDefaultSubscriptionTier } from '@/utils/subscription';

// Google OAuth Strategy for regular users
passport.use('google', new GoogleStrategy({
  clientID: config.googleClientId!,
  clientSecret: config.googleClientSecret!,
  callbackURL: '/api/v1/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await prisma.user.findUnique({
      where: { googleId: profile.id }
    });

    if (!user) {
      const existingUser = await prisma.user.findUnique({
        where: { email: profile.emails?.[0]?.value || '' }
      });

      if (existingUser) {
        user = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            googleId: profile.id,
            authProvider: 'GOOGLE',
            emailVerifiedAt: new Date()
          }
        });
      } else {
        const defaultTier = await getDefaultSubscriptionTier();
        user = await prisma.user.create({
          data: {
            googleId: profile.id,
            email: profile.emails?.[0]?.value || '',
            firstName: profile.name?.givenName || '',
            lastName: profile.name?.familyName || '',
            profileImageUrl: profile.photos?.[0]?.value || null,
            authProvider: 'GOOGLE',
            emailVerifiedAt: new Date(),
            subscriptionTier: defaultTier
          }
        });
      }
    }

    return done(null, user);
  } catch (error) {
    logger.error('Google OAuth error:', error);
    return done(error, false);
  }
}));

// Google OAuth Strategy for admin users
passport.use('google-admin', new GoogleStrategy({
  clientID: config.googleClientId!,
  clientSecret: config.googleClientSecret!,
  callbackURL: '/api/v1/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // For admin OAuth, we just return the profile data
    // The actual admin lookup is handled in the controller
    const adminProfile = {
      googleId: profile.id,
      email: profile.emails?.[0]?.value || '',
      firstName: profile.name?.givenName || '',
      lastName: profile.name?.familyName || '',
      profileImageUrl: profile.photos?.[0]?.value || null
    };

    return done(null, adminProfile);
  } catch (error) {
    logger.error('Admin Google OAuth error:', error);
    return done(error, false);
  }
}));

// LinkedIn OAuth Strategy
passport.use('linkedin', new OAuth2Strategy({
  authorizationURL: 'https://www.linkedin.com/oauth/v2/authorization',
  tokenURL: 'https://www.linkedin.com/oauth/v2/accessToken',
  clientID: config.linkedinClientId!,
  clientSecret: config.linkedinClientSecret!,
  callbackURL: 'http://localhost:3000/api/v1/auth/linkedin/callback',
  scope: 'openid profile email'
}, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
  try {
    const response = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    const linkedinProfile: any = await response.json();
    
    let user = await prisma.user.findUnique({
      where: { linkedinId: linkedinProfile.sub }
    });

    if (!user) {
      const existingUser = await prisma.user.findUnique({
        where: { email: linkedinProfile.email || '' }
      });

      if (existingUser) {
        user = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            linkedinId: linkedinProfile.sub,
            authProvider: 'LINKEDIN',
            emailVerifiedAt: new Date()
          }
        });
      } else {
        user = await prisma.user.create({
          data: {
            linkedinId: linkedinProfile.sub,
            email: linkedinProfile.email || '',
            firstName: linkedinProfile.given_name || '',
            lastName: linkedinProfile.family_name || '',
            profileImageUrl: linkedinProfile.picture || null,
            authProvider: 'LINKEDIN',
            emailVerifiedAt: new Date(),
            subscriptionTier: 'free'
          }
        });
      }
    }

    return done(null, user);
  } catch (error) {
    logger.error('LinkedIn OAuth error:', error);
    return done(error, false);
  }
}));

// Apple OAuth Strategy
passport.use(new AppleStrategy({
  clientID: config.appleClientId!,
  teamID: config.appleTeamId!,
  keyID: config.appleKeyId!,
  privateKeyLocation: config.applePrivateKeyPath!,
  callbackURL: 'http://localhost:3000/api/v1/auth/apple/callback',
  passReqToCallback: false
} as any, async (accessToken: string, refreshToken: string, idToken: any, profile: any, done: any) => {
  try {
    const appleId = profile.id || idToken.sub;
    const email = profile.email || idToken.email;
    const firstName = profile.name?.firstName || '';
    const lastName = profile.name?.lastName || '';
    
    let user = await prisma.user.findUnique({
      where: { appleId: appleId }
    });

    if (!user) {
      const existingUser = await prisma.user.findUnique({
        where: { email: email || '' }
      });

      if (existingUser) {
        user = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            appleId: appleId,
            authProvider: 'APPLE',
            emailVerifiedAt: new Date()
          }
        });
      } else {
        user = await prisma.user.create({
          data: {
            appleId: appleId,
            email: email || '',
            firstName: firstName,
            lastName: lastName,
            authProvider: 'APPLE',
            emailVerifiedAt: new Date(),
            subscriptionTier: 'free'
          }
        });
      }
    }

    return done(null, user);
  } catch (error) {
    logger.error('Apple OAuth error:', error);
    return done(error, false);
  }
}));

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        profileImageUrl: true
      }
    });
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;