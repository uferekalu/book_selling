import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Model } from 'mongoose';
import { Roles } from '../auth/decorators/auth.decorators.js';
import { Author } from '../catalog/schemas/author.schema.js';
import { Book } from '../catalog/schemas/book.schema.js';
import { toObjectId } from '../common/utils/object-id.js';
import { CloudinaryService } from './cloudinary.service.js';
import { UploadSignatureDto } from './uploads.dto.js';

/** Signed direct-to-Cloudinary uploads (ARCHITECTURE §10.0). Staff only. */
@ApiTags('admin: uploads')
@ApiBearerAuth()
@Roles('admin', 'owner')
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly media: CloudinaryService,
    @InjectModel(Book.name) private readonly books: Model<Book>,
    @InjectModel(Author.name) private readonly authors: Model<Author>,
  ) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('signature')
  @HttpCode(HttpStatus.OK)
  async signature(@Body() dto: UploadSignatureDto) {
    const isAuthor = dto.kind === 'author-photo';
    const exists = isAuthor
      ? await this.authors
          .exists({ _id: toObjectId(dto.ownerId, 'Author') })
          .exec()
      : await this.books
          .exists({ _id: toObjectId(dto.ownerId, 'Book') })
          .exec();
    if (!exists)
      throw new NotFoundException(
        isAuthor ? 'Author not found' : 'Book not found',
      );
    return this.media.signUpload(dto.kind, dto.ownerId);
  }
}
