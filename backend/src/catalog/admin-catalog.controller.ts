import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  Header,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Roles } from '../auth/decorators/auth.decorators.js';
import type { AccessTokenPayload } from '../auth/interfaces/auth.types.js';
import { markdownToSafeHtml } from '../common/text/rich-text.js';
import { SetPreviewDto } from '../preview/preview.controller.js';
import { PreviewService, previewLimits } from '../preview/preview.service.js';
import { CloudinaryService } from '../uploads/cloudinary.service.js';
import { AuthorsService } from './authors.service.js';
import { BooksService } from './books.service.js';
import { CatalogPresenter } from './catalog.presenter.js';
import { ManuscriptsService } from './manuscripts.service.js';
import { publishProblems } from './catalog-rules.js';
import { CategoriesService } from './categories.service.js';
import {
  AdminBookListQuery,
  AttachImageDto,
  AttachManuscriptDto,
  AuthorDto,
  ManuscriptUploadRefDto,
  SignManuscriptPartsDto,
  StartManuscriptUploadDto,
  CategoryDto,
  CreateBookDto,
  MarkdownPreviewDto,
  UpdateBookDto,
  UpdateFormatsDto,
} from './dto/catalog.dto.js';
import type { AuthorDocument } from './schemas/author.schema.js';
import type { BookDocument } from './schemas/book.schema.js';
import type { CategoryDocument } from './schemas/category.schema.js';

/** Staff-only catalogue management. `@Roles` also requires a two-step-verified session. */
@ApiTags('admin: catalog')
@ApiBearerAuth()
@Roles('admin', 'owner')
@Controller('admin/catalog')
export class AdminCatalogController {
  private readonly present: CatalogPresenter;

  constructor(
    private readonly books: BooksService,
    private readonly authors: AuthorsService,
    private readonly categories: CategoriesService,
    private readonly previews: PreviewService,
    private readonly manuscripts: ManuscriptsService,
    media: CloudinaryService,
  ) {
    this.present = new CatalogPresenter(media);
  }

  // ---- books -----------------------------------------------------------------

  /** Live preview for the editor, through the same sanitizer the storefront uses. */
  @Post('markdown-preview')
  @HttpCode(HttpStatus.OK)
  markdownPreview(@Body() dto: MarkdownPreviewDto) {
    return { html: markdownToSafeHtml(dto.markdown) };
  }

  @Get('books')
  async listBooks(@Query() query: AdminBookListQuery) {
    const result = await this.books.list(query);
    return {
      ...result,
      items: result.items.map((book) => ({
        id: book._id.toString(),
        title: book.title,
        slug: book.slug,
        status: book.status,
        cover: this.present.image(book.cover, book.title),
        formats: book.formats.filter((f) => f.active).map((f) => f.type),
        problems: publishProblems(book).length,
        updatedAt: (
          book as unknown as { updatedAt: Date }
        ).updatedAt.toISOString(),
      })),
    };
  }

  @Post('books')
  async createBook(
    @Body() dto: CreateBookDto,
    @CurrentUser() me: AccessTokenPayload,
  ) {
    return this.adminBook(await this.books.create(dto.title, me));
  }

  @Get('books/:id')
  async getBook(@Param('id') id: string) {
    return this.adminBook(await this.books.get(id));
  }

  @Patch('books/:id')
  async updateBook(
    @Param('id') id: string,
    @Body() dto: UpdateBookDto,
    @CurrentUser() me: AccessTokenPayload,
  ) {
    return this.adminBook(await this.books.update(id, dto, me));
  }

  @Put('books/:id/formats')
  async setFormats(
    @Param('id') id: string,
    @Body() dto: UpdateFormatsDto,
    @CurrentUser() me: AccessTokenPayload,
  ) {
    return this.adminBook(await this.books.setFormats(id, dto.formats, me));
  }

  @Post('books/:id/cover')
  async attachCover(
    @Param('id') id: string,
    @Body() dto: AttachImageDto,
    @CurrentUser() me: AccessTokenPayload,
  ) {
    return this.adminBook(await this.books.attachCover(id, dto, me));
  }

  @Post('books/:id/gallery')
  async addGallery(
    @Param('id') id: string,
    @Body() dto: AttachImageDto,
    @CurrentUser() me: AccessTokenPayload,
  ) {
    return this.adminBook(await this.books.addGalleryImage(id, dto, me));
  }

  @Delete('books/:id/gallery/:publicId')
  async removeGallery(
    @Param('id') id: string,
    @Param('publicId') publicId: string,
    @CurrentUser() me: AccessTokenPayload,
  ) {
    return this.adminBook(
      await this.books.removeGalleryImage(id, decodeURIComponent(publicId), me),
    );
  }

  // ---- book file (ARCHITECTURE §10.0): browser → R2 in parts, then attach --------

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('books/:id/manuscript-uploads')
  startManuscriptUpload(
    @Param('id') id: string,
    @Body() dto: StartManuscriptUploadDto,
    @CurrentUser() me: AccessTokenPayload,
  ) {
    return this.manuscripts.start(id, dto.bytes, me);
  }

  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Post('books/:id/manuscript-uploads/parts')
  @HttpCode(HttpStatus.OK)
  signManuscriptParts(
    @Param('id') id: string,
    @Body() dto: SignManuscriptPartsDto,
  ) {
    return this.manuscripts.signParts(
      id,
      dto.key,
      dto.uploadId,
      dto.partNumbers,
    );
  }

  @Post('books/:id/manuscript-uploads/complete')
  @HttpCode(HttpStatus.OK)
  completeManuscriptUpload(
    @Param('id') id: string,
    @Body() dto: ManuscriptUploadRefDto,
  ) {
    return this.manuscripts.complete(id, dto.key, dto.uploadId);
  }

  @Post('books/:id/manuscript-uploads/abort')
  @HttpCode(HttpStatus.NO_CONTENT)
  async abortManuscriptUpload(
    @Param('id') id: string,
    @Body() dto: ManuscriptUploadRefDto,
  ) {
    await this.manuscripts.abort(id, dto.key, dto.uploadId);
  }

  /** Checks the finished upload on the server, then makes it the book's file. */
  @Post('books/:id/manuscript')
  async attachManuscript(
    @Param('id') id: string,
    @Body() dto: AttachManuscriptDto,
    @CurrentUser() me: AccessTokenPayload,
  ) {
    return this.adminBook(await this.books.attachManuscript(id, dto, me));
  }

  // ---- preview (ARCHITECTURE §10.1) ----------------------------------------

  /** A 30-minute link to the book file, for the page picker that finds the preview pages. */
  @Get('books/:id/manuscript-link')
  @Header('Cache-Control', 'no-store')
  manuscriptLink(@Param('id') id: string) {
    return this.manuscripts.readLink(id);
  }

  /** Saves the sections and queues the build; poll the book for `preview.status`. */
  @Put('books/:id/preview')
  async setPreview(
    @Param('id') id: string,
    @Body() dto: SetPreviewDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.adminBook(await this.previews.setSections(id, dto, actor));
  }

  /** The built preview PDF (also for drafts), so staff can check it before publishing. */
  @Get('books/:id/preview-file')
  @Header('Cache-Control', 'private, no-store')
  async previewFile(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.previews.openFileForStaff(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(file.size));
    res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
    return new StreamableFile(file.stream);
  }

  @Post('books/:id/preview/rebuild')
  @HttpCode(HttpStatus.OK)
  async rebuildPreview(
    @Param('id') id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.adminBook(await this.previews.rebuild(id, actor));
  }

  @Post('books/:id/publish')
  @HttpCode(HttpStatus.OK)
  async publish(
    @Param('id') id: string,
    @CurrentUser() me: AccessTokenPayload,
  ) {
    return this.adminBook(await this.books.publish(id, me));
  }

  @Post('books/:id/unpublish')
  @HttpCode(HttpStatus.OK)
  async unpublish(
    @Param('id') id: string,
    @CurrentUser() me: AccessTokenPayload,
  ) {
    return this.adminBook(await this.books.unpublish(id, me));
  }

  @Post('books/:id/archive')
  @HttpCode(HttpStatus.OK)
  async archive(
    @Param('id') id: string,
    @CurrentUser() me: AccessTokenPayload,
  ) {
    return this.adminBook(await this.books.archive(id, me));
  }

  @Delete('books/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteBook(
    @Param('id') id: string,
    @CurrentUser() me: AccessTokenPayload,
  ) {
    await this.books.remove(id, me);
  }

  // ---- authors ---------------------------------------------------------------

  @Get('authors')
  async listAuthors() {
    return (await this.authors.list()).map((a) => this.adminAuthor(a));
  }

  @Post('authors')
  async createAuthor(
    @Body() dto: AuthorDto,
    @CurrentUser() me: AccessTokenPayload,
  ) {
    return this.adminAuthor(await this.authors.create(dto, me));
  }

  @Put('authors/:id')
  async updateAuthor(
    @Param('id') id: string,
    @Body() dto: AuthorDto,
    @CurrentUser() me: AccessTokenPayload,
  ) {
    return this.adminAuthor(await this.authors.update(id, dto, me));
  }

  @Post('authors/:id/photo')
  async authorPhoto(
    @Param('id') id: string,
    @Body() dto: AttachImageDto,
    @CurrentUser() me: AccessTokenPayload,
  ) {
    return this.adminAuthor(await this.authors.attachPhoto(id, dto, me));
  }

  @Delete('authors/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAuthor(
    @Param('id') id: string,
    @CurrentUser() me: AccessTokenPayload,
  ) {
    await this.authors.remove(id, me);
  }

  // ---- categories ------------------------------------------------------------

  @Get('categories')
  async listCategories() {
    return (await this.categories.list()).map((c) => this.adminCategory(c));
  }

  @Post('categories')
  async createCategory(
    @Body() dto: CategoryDto,
    @CurrentUser() me: AccessTokenPayload,
  ) {
    return this.adminCategory(await this.categories.create(dto, me));
  }

  @Put('categories/:id')
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: CategoryDto,
    @CurrentUser() me: AccessTokenPayload,
  ) {
    return this.adminCategory(await this.categories.update(id, dto, me));
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCategory(
    @Param('id') id: string,
    @CurrentUser() me: AccessTokenPayload,
  ) {
    await this.categories.remove(id, me);
  }

  // ---- shapes ----------------------------------------------------------------

  /** The editor's view of a book: everything except internals, plus the publish checklist. */
  private adminBook(book: BookDocument) {
    return {
      id: book._id.toString(),
      title: book.title,
      subtitle: book.subtitle,
      slug: book.slug,
      status: book.status,
      listedAt: book.listedAt?.toISOString() ?? null,
      featured: book.featured,
      authorIds: book.authorIds.map((id) => id.toString()),
      categoryIds: book.categoryIds.map((id) => id.toString()),
      descriptionMarkdown: book.descriptionMarkdown,
      abstractMarkdown: book.abstractMarkdown,
      tableOfContents: book.tableOfContents,
      isbn13: book.isbn13,
      edition: book.edition,
      publicationDate: book.publicationDate?.toISOString() ?? null,
      pageCount: book.pageCount,
      language: book.language,
      tags: book.tags,
      seo: book.seo,
      cover: book.cover
        ? {
            ...this.present.image(book.cover, book.title),
            source: { width: book.cover.width, height: book.cover.height },
            crop: book.cover.crop,
          }
        : null,
      gallery: book.gallery.map((g) => ({
        publicId: g.publicId,
        ...this.present.image(g, book.title),
      })),
      // Never a URL: the manuscript is private (ARCHITECTURE §10.0).
      manuscript: book.manuscript
        ? {
            pages: book.manuscript.pages,
            bytes: book.manuscript.bytes,
            uploadedAt: book.manuscript.uploadedAt.toISOString(),
          }
        : null,
      preview: {
        enabled: book.preview?.enabled === true,
        status: book.preview?.status ?? 'none',
        sections: (book.preview?.sections ?? []).map((s) => ({
          label: s.label,
          fromPage: s.fromPage,
          toPage: s.toPage,
        })),
        pageOffset: book.preview?.pageOffset ?? 0,
        pageCount: book.preview?.pageMap?.length ?? 0,
        teasers: book.preview?.teasers?.length ?? 0,
        error: book.preview?.error ?? null,
        generatedAt: book.preview?.generatedAt?.toISOString() ?? null,
        builtFromCurrentFile: Boolean(
          book.manuscript &&
          book.preview?.sourceChecksum === book.manuscript.checksum,
        ),
        ...previewLimits(book.manuscript?.pages, this.previews.maxPercent()),
      },
      formats: book.formats,
      publishProblems: publishProblems(book),
      updatedAt: (
        book as unknown as { updatedAt: Date }
      ).updatedAt.toISOString(),
    };
  }

  private adminAuthor(author: AuthorDocument) {
    return { ...this.present.author(author), bioMarkdown: author.bioMarkdown };
  }

  private adminCategory(category: CategoryDocument) {
    return {
      ...this.present.category(category),
      sortOrder: category.sortOrder,
    };
  }
}
