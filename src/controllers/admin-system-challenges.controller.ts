import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { AdminSystemChallengesService } from '../services/admin-system-challenges.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { GetUser } from '../auth/get-user.decorator';

@Controller('admin/system-challenges')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminSystemChallengesController {
  constructor(private readonly adminSystemChallengesService: AdminSystemChallengesService) {}

  // LinkedIn Ambassador Management
  @Get('linkedin/participants')
  async getLinkedInParticipants(@Query() query: any) {
    return this.adminSystemChallengesService.getLinkedInParticipants(query);
  }

  @Get('linkedin/milestones/pending')
  async getPendingLinkedInMilestones(@Query() query: any) {
    return this.adminSystemChallengesService.getPendingLinkedInMilestones(query);
  }

  @Post('linkedin/milestones/:id/approve')
  async approveLinkedInMilestone(
    @Param('id') milestoneId: string,
    @Body() body: { notes?: string },
    @GetUser() admin: any
  ) {
    return this.adminSystemChallengesService.approveLinkedInMilestone(milestoneId, admin.id, body.notes);
  }

  @Post('linkedin/milestones/:id/reject')
  async rejectLinkedInMilestone(
    @Param('id') milestoneId: string,
    @Body() body: { reason: string },
    @GetUser() admin: any
  ) {
    return this.adminSystemChallengesService.rejectLinkedInMilestone(milestoneId, admin.id, body.reason);
  }

  @Get('linkedin/analytics')
  async getLinkedInAnalytics(@Query() query: any) {
    return this.adminSystemChallengesService.getLinkedInAnalytics(query);
  }

  // Facebook Ambassador Management
  @Get('facebook/participants')
  async getFacebookParticipants(@Query() query: any) {
    return this.adminSystemChallengesService.getFacebookParticipants(query);
  }

  @Get('facebook/milestones/pending')
  async getPendingFacebookMilestones(@Query() query: any) {
    return this.adminSystemChallengesService.getPendingFacebookMilestones(query);
  }

  @Post('facebook/milestones/:id/approve')
  async approveFacebookMilestone(
    @Param('id') milestoneId: string,
    @Body() body: { notes?: string },
    @GetUser() admin: any
  ) {
    return this.adminSystemChallengesService.approveFacebookMilestone(milestoneId, admin.id, body.notes);
  }

  @Post('facebook/milestones/:id/reject')
  async rejectFacebookMilestone(
    @Param('id') milestoneId: string,
    @Body() body: { reason: string },
    @GetUser() admin: any
  ) {
    return this.adminSystemChallengesService.rejectFacebookMilestone(milestoneId, admin.id, body.reason);
  }

  // Twitter Ambassador Management
  @Get('twitter/participants')
  async getTwitterParticipants(@Query() query: any) {
    return this.adminSystemChallengesService.getTwitterParticipants(query);
  }

  @Get('twitter/milestones/pending')
  async getPendingTwitterMilestones(@Query() query: any) {
    return this.adminSystemChallengesService.getPendingTwitterMilestones(query);
  }

  @Post('twitter/milestones/:id/approve')
  async approveTwitterMilestone(
    @Param('id') milestoneId: string,
    @Body() body: { notes?: string },
    @GetUser() admin: any
  ) {
    return this.adminSystemChallengesService.approveTwitterMilestone(milestoneId, admin.id, body.notes);
  }

  // Content Creator Management
  @Get('content-creator/posts')
  async getContentCreatorPosts(@Query() query: any) {
    return this.adminSystemChallengesService.getContentCreatorPosts(query);
  }

  @Post('content-creator/posts/:id/approve')
  async approveContentCreatorPost(
    @Param('id') postId: string,
    @Body() body: { notes?: string },
    @GetUser() admin: any
  ) {
    return this.adminSystemChallengesService.approveContentCreatorPost(postId, admin.id, body.notes);
  }

  @Post('content-creator/posts/:id/reject')
  async rejectContentCreatorPost(
    @Param('id') postId: string,
    @Body() body: { reason: string },
    @GetUser() admin: any
  ) {
    return this.adminSystemChallengesService.rejectContentCreatorPost(postId, admin.id, body.reason);
  }

  // Referral Challenge Management
  @Get('referrals/stats')
  async getReferralStats(@Query() query: any) {
    return this.adminSystemChallengesService.getReferralStats(query);
  }

  @Get('referrals/participants')
  async getReferralParticipants(@Query() query: any) {
    return this.adminSystemChallengesService.getReferralParticipants(query);
  }

  // Bulk Operations
  @Post('bulk-approve')
  async bulkApprove(
    @Body() body: { type: string; ids: string[] },
    @GetUser() admin: any
  ) {
    return this.adminSystemChallengesService.bulkApprove(body.type, body.ids, admin.id);
  }

  // Overall Analytics
  @Get('analytics/overview')
  async getSystemChallengesOverview(@Query() query: any) {
    return this.adminSystemChallengesService.getSystemChallengesOverview(query);
  }
}