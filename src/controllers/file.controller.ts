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

      // Security validations
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
      const ALLOWED_MIME_TYPES = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf', 'text/plain', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'audio/mpeg', 'audio/wav', 'audio/webm',
        'video/mp4', 'video/webm'
      ];
      const DANGEROUS_EXTENSIONS = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.com', '.js', '.vbs', '.jar'];

      for (const file of files) {
        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          throw ApiError.badRequest(`File ${file.originalname} exceeds maximum size of 10MB`);
        }

        // Validate MIME type
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          throw ApiError.badRequest(`File type ${file.mimetype} is not allowed`);
        }

        // Validate file extension
        const fileExtension = path.extname(file.originalname).toLowerCase();
        if (DANGEROUS_EXTENSIONS.includes(fileExtension)) {
          throw ApiError.badRequest(`File extension ${fileExtension} is not allowed`);
        }

        // Sanitize filename
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        if (sanitizedName !== file.originalname) {
          logger.warn(`Filename sanitized: ${file.originalname} -> ${sanitizedName}`);
        }
      }

      const uploadedFiles = [];

      for (const file of files) {
        // Create file record in database
        const fileRecord = await prisma.file.create({
          data: {
            uploadedBy: userId,
            originalName: file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'),
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