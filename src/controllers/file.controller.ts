import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Allow common file types
  const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|zip|rar/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Invalid file type'));
  }
};

export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter
});

export class FileController {
  async uploadFiles(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) throw ApiError.unauthorized('User not authenticated');

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        throw ApiError.badRequest('No files uploaded');
      }

      const uploadedFiles = await Promise.all(
        files.map(async (file) => {
          const fileRecord = await prisma.file.create({
            data: {
              uploadedBy: userId,
              originalName: file.originalname,
              fileName: file.filename,
              filePath: file.path,
              fileSize: BigInt(file.size),
              mimeType: file.mimetype,
              fileExtension: path.extname(file.originalname),
              fileCategory: 'DOCUMENT',
              storageProvider: 'local'
            }
          });

          return {
            id: fileRecord.id,
            name: file.originalname,
            size: file.size,
            type: file.mimetype,
            url: `/uploads/${file.filename}`
          };
        })
      );

      res.json({ success: true, data: uploadedFiles });
    } catch (error) {
      next(error);
    }
  }

  async deleteFile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { fileId } = req.params;

      const file = await prisma.file.findUnique({
        where: { id: fileId }
      });

      if (!file) throw ApiError.notFound('File not found');
      if (file.uploadedBy !== userId) throw ApiError.forbidden('Access denied');

      await prisma.file.update({
        where: { id: fileId },
        data: { status: 'DELETED' }
      });

      res.json({ success: true, message: 'File deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
}