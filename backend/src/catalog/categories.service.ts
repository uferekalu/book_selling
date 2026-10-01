import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { AuditService } from '../audit/audit.module.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { toObjectId } from '../common/utils/object-id.js';
import type { CategoryDto } from './dto/catalog.dto.js';
import { Book } from './schemas/book.schema.js';
import { Category, type CategoryDocument } from './schemas/category.schema.js';
import {
  CATALOG_TAGS,
  StorefrontRevalidator,
} from './storefront-revalidator.js';
import { uniqueSlug } from './unique-slug.js';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private readonly categories: Model<Category>,
    @InjectModel(Book.name) private readonly books: Model<Book>,
    private readonly audit: AuditService,
    private readonly revalidator: StorefrontRevalidator,
  ) {}

  list(): Promise<CategoryDocument[]> {
    return this.categories.find().sort({ sortOrder: 1, name: 1 }).exec();
  }

  async get(id: string): Promise<CategoryDocument> {
    const category = await this.categories
      .findById(toObjectId(id, 'Category'))
      .exec();
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async create(
    dto: CategoryDto,
    actor: AccessTokenPayload,
  ): Promise<CategoryDocument> {
    const category = await this.categories.create({
      name: dto.name,
      description: dto.description ?? '',
      sortOrder: dto.sortOrder ?? 0,
      slug: await uniqueSlug(this.categories, dto.name),
    });
    await this.record(actor, 'category.created', category);
    return category;
  }

  async update(
    id: string,
    dto: CategoryDto,
    actor: AccessTokenPayload,
  ): Promise<CategoryDocument> {
    const category = await this.get(id);
    category.set({
      name: dto.name,
      description: dto.description ?? '',
      sortOrder: dto.sortOrder ?? category.sortOrder,
    });
    await category.save();
    await this.record(actor, 'category.updated', category);
    return category;
  }

  async remove(id: string, actor: AccessTokenPayload): Promise<void> {
    const category = await this.get(id);
    if (await this.books.exists({ categoryIds: category._id }).exec()) {
      throw new ConflictException(
        'Books are filed under this category. Move them to another category first.',
      );
    }
    await category.deleteOne();
    await this.record(actor, 'category.deleted', category);
  }

  private async record(
    actor: AccessTokenPayload,
    action: string,
    category: CategoryDocument,
  ) {
    await this.audit.record({
      actor: { id: actor.sub, role: actor.role },
      action,
      entityType: 'category',
      entityId: category._id.toString(),
      changes: { name: category.name },
    });
    this.revalidator.notify([CATALOG_TAGS.all]);
  }
}
