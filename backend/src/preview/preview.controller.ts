import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator.js';
import { PreviewEventsDto, PreviewEventsService } from './preview-events.js';
import { PreviewService } from './preview.service.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const toInt = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Number(value);

class PreviewSectionDto {
  @ApiProperty({ example: 'Introduction' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label: string;
  @ApiProperty() @IsInt() @Min(1) @Max(5000) fromPage: number;
  @ApiProperty() @IsInt() @Min(1) @Max(5000) toPage: number;
}

export class SetPreviewDto {
  @ApiProperty({ type: [PreviewSectionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PreviewSectionDto)
  sections: PreviewSectionDto[];

  @ApiPropertyOptional({
    description:
      'PDF page of printed page 1, minus one (pages of front matter before it)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  pageOffset?: number;
}

export class ManuscriptPagesQuery {
  @ApiProperty() @Transform(toInt) @IsInt() @Min(1) @Max(5000) from: number;
  @ApiProperty() @Transform(toInt) @IsInt() @Min(1) @Max(5000) to: number;
}

const perMinute = (limit: number) => ({ default: { limit, ttl: 60_000 } });

/** The free preview, for everyone (no account needed). */
@ApiTags('catalog: preview')
@Public()
@Controller('catalog')
export class PublicPreviewController {
  constructor(
    private readonly previews: PreviewService,
    private readonly events: PreviewEventsService,
  ) {}

  @Get('books/:slug/preview')
  @Throttle(perMinute(120))
  preview(@Param('slug') slug: string) {
    return this.previews.publicPreview(slug);
  }

  /**
   * The preview PDF. Its id changes on every rebuild, so it is cached for a year. Only a published
   * book's current preview is ever served.
   */
  @Get('previews/:fileId')
  @Throttle(perMinute(60))
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async file(
    @Param('fileId') fileId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.previews.openFile(fileId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(file.size));
    res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
    return new StreamableFile(file.stream);
  }

  @Post('preview-events')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(perMinute(60))
  async previewEvents(@Body() dto: PreviewEventsDto): Promise<void> {
    await this.events.record(dto);
  }
}
