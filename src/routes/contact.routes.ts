import { Router } from 'express';
import { submitContact } from '../controllers/contact.controller';

const router = Router();

router.post('/', submitContact);

export default router;