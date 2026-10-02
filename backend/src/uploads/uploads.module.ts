import { Module } from '@nestjs/common';
import { BookFilesService } from './book-files.service.js';
import { CloudinaryService } from './cloudinary.service.js';

/** Cloudinary for public images; Cloudflare R2 for the private book files. */
@Module({
  providers: [CloudinaryService, BookFilesService],
  exports: [CloudinaryService, BookFilesService],
})
export class UploadsModule {}
