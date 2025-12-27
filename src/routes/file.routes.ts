import { Router } from 'express';
import multer from 'multer';
import { FileController } from '@/controllers/file.controller';
import { authenticate } from '@/middleware/auth';

const router = Router();
const fileController = new FileController();

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// All routes require authentication
router.use(authenticate);

router.post('/upload', upload.array('files'), fileController.uploadFiles.bind(fileController));
router.delete('/:fileId', fileController.deleteFile.bind(fileController));

export { router as fileRoutes };