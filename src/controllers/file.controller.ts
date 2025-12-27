import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';
import fs from 'fs';
import path from 'path';

export class FileController {
  async uploadFiles(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) throw ApiError.unauthorized('User not authenticated');

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        throw ApiError.badRequest('No files uploaded');
      }

      const uploadedFiles = [];

      for (const file of files) {
        // Create file record in database
        const fileRecord = await prisma.file.create({
          data: {
            uploadedBy: userId,
            originalName: file.originalname,
            fileName: file.filename,
            filePath: file.path,
            fileSize: BigInt(file.size),
            mimeType: file.mimetype,
            fileExtension: path.extname(file.originalname),
            fileCategory: file.mimetype.startsWith('image/') ? 'MESSAGE_ATTACHMENT' : 'DOCUMENT',
            storageProvider: 'local',
            storagePath: file.path,
            cdnUrl: `/uploads/${file.filename}`,
            status: 'ACTIVE'
          }
        });

        uploadedFiles.push({
          id: fileRecord.id,
          originalName: fileRecord.originalName,
          fileName: fileRecord.fileName,
          fileSize: fileRecord.fileSize.toString(),
          mimeType: fileRecord.mimeType,
          cdnUrl: fileRecord.cdnUrl
        });
      }

      res.json({ success: true, data: uploadedFiles });
    } catch (error) {
      // Clean up uploaded files on error
      if (req.files) {
        const files = req.files as Express.Multer.File[];
        files.forEach(file => {
          fs.unlink(file.path, () => {});
        });
      }
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

      if (!file) {
        throw ApiError.notFound('File not found');
      }

      if (file.uploadedBy !== userId) {
        throw ApiError.forbidden('Access denied');
      }

      // Delete file from filesystem
      if (file.filePath && fs.existsSync(file.filePath)) {
        fs.unlinkSync(file.filePath);
      }

      // Delete file record
      await prisma.file.delete({
        where: { id: fileId }
      });

      res.json({ success: true, message: 'File deleted' });
    } catch (error) {
      next(error);
    }
  }
}