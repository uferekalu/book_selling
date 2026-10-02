import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CatalogModule } from '../catalog/catalog.module.js';
import { CommerceModule } from '../commerce/commerce.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { MailModule } from '../mail/mail.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { UsersModule } from '../users/users.module.js';
import { CopiesService } from './copies.service.js';
import { CopyWorker } from './copy.worker.js';
import { LibraryController } from './library.controller.js';
import { LibraryService } from './library.service.js';
import {
  DownloadEvent,
  DownloadEventSchema,
} from './schemas/download-event.schema.js';
import {
  ReadingProgress,
  ReadingProgressSchema,
} from './schemas/reading-progress.schema.js';

/** My Library: owned ebooks, personal copies, online reading and downloads (BS-9). */
@Module({
  imports: [
    CatalogModule, // Book and Author models
    CommerceModule, // Entitlement and Order models
    UsersModule,
    UploadsModule,
    MailModule,
    JobsModule,
    MongooseModule.forFeature([
      { name: ReadingProgress.name, schema: ReadingProgressSchema },
      { name: DownloadEvent.name, schema: DownloadEventSchema },
    ]),
  ],
  controllers: [LibraryController],
  providers: [LibraryService, CopiesService, CopyWorker],
  exports: [LibraryService, CopiesService, MongooseModule],
})
export class LibraryModule {}
