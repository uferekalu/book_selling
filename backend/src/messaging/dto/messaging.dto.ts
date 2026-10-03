import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CONTACT_STATUSES } from '../schemas/contact-request.schema.js';
import { CONVERSATION_STATUSES } from '../schemas/conversation.schema.js';
import { MESSAGE_MAX_LENGTH } from '../schemas/message.schema.js';
import { INBOX_FILTERS } from '../messaging.service.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class StartConversationDto {
  @ApiPropertyOptional({
    description: 'Required unless the conversation is about an order or a book',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(140)
  subject?: string;

  @ApiProperty({ maxLength: MESSAGE_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MESSAGE_MAX_LENGTH)
  body: string;

  @ApiPropertyOptional({ description: '"Question about this order"' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Z0-9-]{4,40}$/, { message: 'orderNumber is not valid' })
  orderNumber?: string;

  @ApiPropertyOptional({ description: '"Ask the author" about this book' })
  @IsOptional()
  @IsMongoId()
  bookId?: string;
}

export class SendMessageDto {
  @ApiProperty({ maxLength: MESSAGE_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MESSAGE_MAX_LENGTH)
  body: string;
}

export class MessagesQuery {
  @ApiPropertyOptional({ description: 'Load messages older than this one' })
  @IsOptional()
  @IsMongoId()
  before?: string;
}

export class InboxQuery {
  @ApiPropertyOptional({ enum: INBOX_FILTERS, default: 'open' })
  @IsOptional()
  @IsIn(INBOX_FILTERS)
  filter?: (typeof INBOX_FILTERS)[number];

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;
}

export class ConversationStatusDto {
  @ApiProperty({ enum: CONVERSATION_STATUSES })
  @IsIn(CONVERSATION_STATUSES)
  status: (typeof CONVERSATION_STATUSES)[number];
}

export class MessagingSettingsDto {
  @ApiProperty({ example: 'Usually replies within a day' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  replyTime: string;
}

export class ContactDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty()
  @Transform(trim)
  @IsEmail()
  @MaxLength(200)
  email: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(140)
  subject: string;

  @ApiProperty({ maxLength: MESSAGE_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MESSAGE_MAX_LENGTH)
  body: string;

  @ApiPropertyOptional({ description: 'Leave empty (spam trap)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  @ApiPropertyOptional({ description: 'Milliseconds the form was open' })
  @IsOptional()
  @IsInt()
  @Min(0)
  elapsedMs?: number;
}

export class ContactListQuery {
  @ApiPropertyOptional({ enum: [...CONTACT_STATUSES, 'all'], default: 'new' })
  @IsOptional()
  @IsIn([...CONTACT_STATUSES, 'all'])
  status?: (typeof CONTACT_STATUSES)[number] | 'all';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;
}

export class ContactStatusDto {
  @ApiProperty({ enum: CONTACT_STATUSES })
  @IsIn(CONTACT_STATUSES)
  status: (typeof CONTACT_STATUSES)[number];
}
