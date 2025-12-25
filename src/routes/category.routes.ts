import { Router } from 'express';
import { CategoryController } from '@/controllers/category.controller';

const router = Router();
const categoryController = new CategoryController();

router.get('/', categoryController.getCategories);
router.get('/:id', categoryController.getCategory);

export default router;