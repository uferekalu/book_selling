import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { CatalogQueryService } from './catalog-query.service.js';
import { BookListQuery, CurrencyQuery } from './dto/catalog.dto.js';

/** Storefront reads. Public, and cached by the storefront (revalidated on admin edits). */
@ApiTags('catalog')
@Public()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogQueryService) {}

  @Get('books')
  books(@Query() query: BookListQuery) {
    return this.catalog.list(query);
  }

  /** `{ book }`, or `{ redirectTo }` when the book was renamed (old links keep working). */
  @Get('books/:slug')
  book(@Param('slug') slug: string, @Query() query: CurrencyQuery) {
    return this.catalog.bySlug(slug, query.currency ?? 'USD');
  }

  @Get('books/:slug/related')
  related(@Param('slug') slug: string, @Query() query: CurrencyQuery) {
    return this.catalog.related(slug, query.currency ?? 'USD');
  }

  @Get('categories')
  categories() {
    return this.catalog.categoriesWithCounts();
  }

  @Get('authors')
  authors() {
    return this.catalog.featuredAuthors();
  }

  @Get('authors/:slug')
  author(@Param('slug') slug: string) {
    return this.catalog.authorBySlug(slug);
  }

  @Get('sitemap')
  sitemap() {
    return this.catalog.sitemapEntries();
  }
}
