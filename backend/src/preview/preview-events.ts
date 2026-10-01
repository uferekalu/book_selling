import { Injectable } from '@nestjs/common';
import { InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Types, type Model } from 'mongoose';
import { Book } from '../catalog/schemas/book.schema.js';

/**
 * Anonymous reading analytics for the preview (ARCHITECTURE §10.1), used by BS-12's preview →
 * purchase conversion report. No personal data: a random per-tab session id, the book and what
 * happened. Kept for about 13 months.
 */
export const PREVIEW_EVENT_TYPES = [
  'open',
  'page',
  'end_reached',
  'nudge_shown',
  'locked_chapter',
  'buy_click',
] as const;
export type PreviewEventType = (typeof PREVIEW_EVENT_TYPES)[number];

@Schema({ collection: 'preview_events', versionKey: false })
export class PreviewEvent {
  @Prop({ type: Types.ObjectId, required: true }) bookId: Types.ObjectId;
  @Prop({ type: String, required: true }) sessionId: string;
  @Prop({ type: String, enum: PREVIEW_EVENT_TYPES, required: true })
  type: PreviewEventType;
  @Prop({ type: Number, default: null }) page: number | null;
  @Prop({ type: Date, required: true }) at: Date;
}
export const PreviewEventSchema = SchemaFactory.createForClass(PreviewEvent);
PreviewEventSchema.index({ bookId: 1, type: 1, at: -1 });
PreviewEventSchema.index({ at: 1 }, { expireAfterSeconds: 400 * 24 * 3600 });

class PreviewEventDto {
  @ApiProperty({ enum: PREVIEW_EVENT_TYPES })
  @IsIn(PREVIEW_EVENT_TYPES)
  type: PreviewEventType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  page?: number;
}

export class PreviewEventsDto {
  @ApiProperty() @IsString() @Matches(/^[a-z0-9-]{1,80}$/) slug: string;

  @ApiProperty({
    description: 'Random id per reading session (not tied to a person)',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/)
  sessionId: string;

  @ApiProperty({ type: [PreviewEventDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PreviewEventDto)
  events: PreviewEventDto[];
}

@Injectable()
export class PreviewEventsService {
  constructor(
    @InjectModel(PreviewEvent.name)
    private readonly events: Model<PreviewEvent>,
    @InjectModel(Book.name) private readonly books: Model<Book>,
  ) {}

  /** Stores a batch for a published book; unknown books are ignored (no error to probe with). */
  async record(dto: PreviewEventsDto, now = new Date()): Promise<void> {
    const book = await this.books
      .findOne({ slug: dto.slug, status: 'published' }, { _id: 1 })
      .lean()
      .exec();
    if (!book) return;
    await this.events.insertMany(
      dto.events.map((event) => ({
        bookId: book._id,
        sessionId: dto.sessionId,
        type: event.type,
        page: event.page ?? null,
        at: now,
      })),
    );
  }
}
