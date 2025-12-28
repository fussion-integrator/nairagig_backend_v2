import { Router } from 'express';
import { ContractController } from '@/controllers/contract.controller';
import { authenticate } from '@/middleware/auth';

const router = Router();
const contractController = new ContractController();

router.use(authenticate);

router.get('/', contractController.getContracts.bind(contractController));
router.get('/:id', contractController.getContract.bind(contractController));
router.post('/', contractController.createContract.bind(contractController));
router.put('/:id/sign', contractController.signContract.bind(contractController));

export { router as contractRoutes };