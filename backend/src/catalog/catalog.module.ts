import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobsModule } from '../jobs/jobs.module.js';
import { UploadsController } from '../uploads/uploads.controller.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { AdminCatalogController } from './admin-catalog.controller.js';
import { AuthorsService } from './authors.service.js';
import { BooksService } from './books.service.js';
import { CatalogQueryService } from './catalog-query.service.js';
import { CatalogController } from './catalog.controller.js';
import { CategoriesService } from './categories.service.js';
import { Author, AuthorSchema } from './schemas/author.schema.js';
import { Book, BookSchema } from './schemas/book.schema.js';
import { Category, CategorySchema } from './schemas/category.schema.js';
import { StorefrontRevalidator } from './storefront-revalidator.js';
import { UploadCleanupJob } from './upload-cleanup.job.js';
import {
  PreviewEvent,
  PreviewEventSchema,
  PreviewEventsService,
} from '../preview/preview-events.js';
import { PreviewStorage } from '../preview/preview-storage.js';
import { PublicPreviewController } from '../preview/preview.controller.js';
import { PreviewService } from '../preview/preview.service.js';
import { PreviewWorker } from '../preview/preview.worker.js';

@Module({
  imports: [
    UploadsModule,
    JobsModule,
    MongooseModule.forFeature([
      { name: Book.name, schema: BookSchema },
      { name: Author.name, schema: AuthorSchema },
      { name: Category.name, schema: CategorySchema },
      { name: PreviewEvent.name, schema: PreviewEventSchema },
    ]),
  ],
  // UploadsController lives here: signing an upload checks that the book/author exists.
  controllers: [
    CatalogController,
    AdminCatalogController,
    UploadsController,
    PublicPreviewController,
  ],
  providers: [
    BooksService,
    AuthorsService,
    CategoriesService,
    CatalogQueryService,
    StorefrontRevalidator,
    UploadCleanupJob,
    PreviewStorage,
    PreviewService,
    PreviewWorker,
    PreviewEventsService,
  ],
  exports: [BooksService, CatalogQueryService, MongooseModule],
})
export class CatalogModule {}
