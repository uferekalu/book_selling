import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsMongoId } from 'class-validator';
import { UPLOAD_KINDS, type UploadKind } from './cloudinary.service.js';

export class UploadSignatureDto {
  @ApiProperty({ enum: UPLOAD_KINDS })
  @IsIn(UPLOAD_KINDS)
  kind: UploadKind;

  @ApiProperty({
    description:
      'The book (cover, gallery, manuscript) or author (author-photo) id',
  })
  @IsMongoId()
  ownerId: string;
}
