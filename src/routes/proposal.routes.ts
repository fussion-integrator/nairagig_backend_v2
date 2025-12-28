import { Router } from 'express';
import { ProposalController } from '@/controllers/proposal.controller';
import { authenticate, authorize } from '@/middleware/auth';

const router = Router();
const proposalController = new ProposalController();

router.use(authenticate);

router.get('/', authorize('FREELANCER'), proposalController.getProposals.bind(proposalController));
router.get('/:id', authorize('FREELANCER'), proposalController.getProposal.bind(proposalController));
router.delete('/:id', authorize('FREELANCER'), proposalController.deleteProposal.bind(proposalController));

export { router as proposalRoutes };