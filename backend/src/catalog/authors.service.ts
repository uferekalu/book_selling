import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { AuditService } from '../audit/audit.module.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { markdownToSafeHtml } from '../common/text/rich-text.js';
import { toObjectId } from '../common/utils/object-id.js';
import { CloudinaryService } from '../uploads/cloudinary.service.js';
import type { AttachImageDto, AuthorDto } from './dto/catalog.dto.js';
import { Author, type AuthorDocument } from './schemas/author.schema.js';
import { Book } from './schemas/book.schema.js';
import {
  CATALOG_TAGS,
  StorefrontRevalidator,
} from './storefront-revalidator.js';
import { uniqueSlug } from './unique-slug.js';

@Injectable()
export class AuthorsService {
  constructor(
    @InjectModel(Author.name) private readonly authors: Model<Author>,
    @InjectModel(Book.name) private readonly books: Model<Book>,
    private readonly media: CloudinaryService,
    private readonly audit: AuditService,
    private readonly revalidator: StorefrontRevalidator,
  ) {}

  list(): Promise<AuthorDocument[]> {
    return this.authors.find().sort({ name: 1 }).exec();
  }

  async get(id: string): Promise<AuthorDocument> {
    const author = await this.authors.findById(toObjectId(id, 'Author')).exec();
    if (!author) throw new NotFoundException('Author not found');
    return author;
  }

  async create(
    dto: AuthorDto,
    actor: AccessTokenPayload,
  ): Promise<AuthorDocument> {
    const author = await this.authors.create({
      ...this.fields(dto),
      slug: await uniqueSlug(this.authors, dto.name),
    });
    await this.record(actor, 'author.created', author, { name: author.name });
    return author;
  }

  async update(
    id: string,
    dto: AuthorDto,
    actor: AccessTokenPayload,
  ): Promise<AuthorDocument> {
    const author = await this.get(id);
    author.set(this.fields(dto));
    await author.save();
    await this.record(actor, 'author.updated', author, {
      fields: Object.keys(dto),
    });
    return author;
  }

  async attachPhoto(
    id: string,
    dto: AttachImageDto,
    actor: AccessTokenPayload,
  ): Promise<AuthorDocument> {
    const author = await this.get(id);
    const asset = await this.media.verify('author-photo', id, dto.publicId);
    const previous = author.photo?.publicId;
    author.photo = {
      publicId: asset.publicId,
      version: asset.version,
      width: asset.width,
      height: asset.height,
      format: asset.format,
      crop: dto.crop ?? null,
      dominantColor: asset.dominantColor,
      blurDataUrl: await this.media.blurDataUrl(
        asset.publicId,
        asset.version,
        dto.crop,
      ),
      alt: dto.alt ?? author.name,
    };
    await author.save();
    await this.media.markAttached('author-photo', asset.publicId);
    if (previous && previous !== asset.publicId)
      await this.media.destroy('author-photo', previous);
    await this.record(actor, 'author.photo_changed', author);
    return author;
  }

  async remove(id: string, actor: AccessTokenPayload): Promise<void> {
    const author = await this.get(id);
    if (await this.books.exists({ authorIds: author._id }).exec()) {
      throw new ConflictException(
        'This author is on at least one book. Remove them from those books first.',
      );
    }
    await author.deleteOne();
    if (author.photo)
      await this.media.destroy('author-photo', author.photo.publicId);
    await this.record(actor, 'author.deleted', author, { name: author.name });
  }

  private fields(dto: AuthorDto): Partial<Author> {
    return {
      name: dto.name,
      title: dto.title ?? '',
      bioMarkdown: dto.bioMarkdown ?? '',
      bioHtml: markdownToSafeHtml(dto.bioMarkdown ?? ''),
      affiliations: (dto.affiliations ?? [])
        .map((a) => a.trim())
        .filter(Boolean),
      links: {
        website: dto.links?.website ?? null,
        linkedin: dto.links?.linkedin ?? null,
        googleScholar: dto.links?.googleScholar ?? null,
        researchGate: dto.links?.researchGate ?? null,
      },
    };
  }

  private async record(
    actor: AccessTokenPayload,
    action: string,
    author: AuthorDocument,
    changes?: Record<string, unknown>,
  ) {
    await this.audit.record({
      actor: { id: actor.sub, role: actor.role },
      action,
      entityType: 'author',
      entityId: author._id.toString(),
      changes,
    });
    this.revalidator.notify([
      CATALOG_TAGS.all,
      CATALOG_TAGS.author(author.slug),
    ]);
  }
}
