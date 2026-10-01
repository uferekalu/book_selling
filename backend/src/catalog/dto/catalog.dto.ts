import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CURRENCIES,
  MAX_PRICE_MINOR,
  type Currency,
} from '../../common/money/currency.js';
import { FORMAT_TYPES, type FormatType } from '../schemas/book.schema.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const toInt = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Number(value);

// ---------------------------------------------------------------- shared pieces

export class CropDto {
  @ApiProperty() @IsInt() @Min(0) x: number;
  @ApiProperty() @IsInt() @Min(0) y: number;
  @ApiProperty() @IsInt() @Min(1) width: number;
  @ApiProperty() @IsInt() @Min(1) height: number;
}

export class AttachImageDto {
  @ApiProperty({
    description: 'public_id returned by Cloudinary after the signed upload',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  publicId: string;

  @ApiPropertyOptional({ type: CropDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CropDto)
  crop?: CropDto;

  @ApiPropertyOptional({
    description: 'Alternative text; defaults to the book title',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  alt?: string;
}

export class AttachManuscriptDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(300) publicId: string;
}

// ---------------------------------------------------------------- authors & categories

class AuthorLinksDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: true })
  website?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: true })
  linkedin?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: true })
  googleScholar?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: true })
  researchGate?: string;
}

export class AuthorDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  title?: string;
  @ApiPropertyOptional({ description: 'Markdown' })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  bioMarkdown?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  affiliations?: string[];

  @ApiPropertyOptional({ type: AuthorLinksDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AuthorLinksDto)
  links?: AuthorLinksDto;
}

export class CategoryDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(400)
  description?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;
}

// ---------------------------------------------------------------- books

class TocChildDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) page?: number;
}

export class TocEntryDto extends TocChildDto {
  @ApiPropertyOptional({ type: [TocChildDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => TocChildDto)
  children?: TocChildDto[];
}

class SeoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(70)
  title?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(170)
  description?: string;
}

export class CreateBookDto {
  @ApiProperty({ example: 'Principles of Foundry Technology' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;
}

export class UpdateBookDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(240)
  subtitle?: string;

  @ApiPropertyOptional({
    description: 'URL part; lowercase letters, numbers and hyphens',
  })
  @IsOptional()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Use lowercase letters, numbers and single hyphens',
  })
  @MaxLength(80)
  slug?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsMongoId({ each: true })
  authorIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsMongoId({ each: true })
  categoryIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  descriptionMarkdown?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  abstractMarkdown?: string;

  @ApiPropertyOptional({ type: [TocEntryDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => TocEntryDto)
  tableOfContents?: TocEntryDto[];

  @ApiPropertyOptional({ example: '978-0-306-40615-7', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  isbn13?: string | null;

  @ApiPropertyOptional({ example: '3rd edition' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  edition?: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  publicationDate?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  pageCount?: number | null;
  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @Matches(/^[a-z]{2}$/)
  language?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: SeoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SeoDto)
  seo?: SeoDto;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() featured?: boolean;
}

class PriceDto {
  @ApiProperty({ enum: CURRENCIES }) @IsIn(CURRENCIES) currency: Currency;

  @ApiProperty({
    description: 'Integer minor units, e.g. 2500000 = ₦25,000.00',
  })
  @IsInt()
  @Min(1)
  @Max(MAX_PRICE_MINOR)
  amount: number;
}

class PrintOptionsDto {
  @ApiProperty() @IsInt() @Min(0) @Max(1_000_000) stockOnHand: number;
  @ApiProperty() @IsInt() @Min(0) @Max(20_000) weightGrams: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxPerOrder?: number;
}

class EbookOptionsDto {
  @ApiProperty() @IsBoolean() stampWithBuyer: boolean;
}

export class FormatDto {
  @ApiProperty({ enum: FORMAT_TYPES }) @IsIn(FORMAT_TYPES) type: FormatType;
  @ApiProperty() @IsBoolean() active: boolean;

  @ApiProperty({ type: [PriceDto] })
  @IsArray()
  @ArrayMaxSize(CURRENCIES.length)
  @ValidateNested({ each: true })
  @Type(() => PriceDto)
  prices: PriceDto[];

  @ApiPropertyOptional({ type: [PriceDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CURRENCIES.length)
  @ValidateNested({ each: true })
  @Type(() => PriceDto)
  compareAtPrices?: PriceDto[];

  @ApiPropertyOptional({ type: EbookOptionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EbookOptionsDto)
  ebook?: EbookOptionsDto;
  @ApiPropertyOptional({ type: PrintOptionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PrintOptionsDto)
  print?: PrintOptionsDto;
}

export class UpdateFormatsDto {
  @ApiProperty({ type: [FormatDto] })
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => FormatDto)
  formats: FormatDto[];
}

export class MarkdownPreviewDto {
  @ApiProperty({
    description: 'Markdown to render exactly as the storefront will',
  })
  @IsString()
  @MaxLength(50_000)
  markdown: string;
}

// ---------------------------------------------------------------- queries

export const BOOK_SORTS = [
  'relevance',
  'newest',
  'price_asc',
  'price_desc',
  'rating',
  'title',
] as const;
export type BookSort = (typeof BOOK_SORTS)[number];

export class BookListQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
  @ApiPropertyOptional({ description: 'Category slug' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;
  @ApiPropertyOptional({ description: 'Author slug' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  author?: string;
  @ApiPropertyOptional({ enum: FORMAT_TYPES })
  @IsOptional()
  @IsIn(FORMAT_TYPES)
  format?: FormatType;
  @ApiPropertyOptional({ enum: CURRENCIES, default: 'USD' })
  @IsOptional()
  @IsIn(CURRENCIES)
  currency?: Currency;
  @ApiPropertyOptional({ description: 'Minor units' })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(0)
  minPrice?: number;
  @ApiPropertyOptional({ description: 'Minor units' })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(0)
  maxPrice?: number;
  @ApiPropertyOptional({ enum: BOOK_SORTS })
  @IsOptional()
  @IsIn(BOOK_SORTS)
  sort?: BookSort;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  featured?: boolean;
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(500)
  page?: number;
  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(60)
  pageSize?: number;
}

export class CurrencyQuery {
  @ApiPropertyOptional({ enum: CURRENCIES, default: 'USD' })
  @IsOptional()
  @IsIn(CURRENCIES)
  currency?: Currency;
}

export class AdminBookListQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
  @ApiPropertyOptional({ enum: ['draft', 'published', 'archived'] })
  @IsOptional()
  @IsIn(['draft', 'published', 'archived'])
  status?: string;
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  page?: number;
}
