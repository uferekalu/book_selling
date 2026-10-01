import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class Crop {
  @Prop({ type: Number, required: true, min: 0 }) x: number;
  @Prop({ type: Number, required: true, min: 0 }) y: number;
  @Prop({ type: Number, required: true, min: 1 }) width: number;
  @Prop({ type: Number, required: true, min: 1 }) height: number;
}
export const CropSchema = SchemaFactory.createForClass(Crop);

/** A public Cloudinary image (cover, gallery spread, author photo). */
@Schema({ _id: false })
export class StoredImage {
  @Prop({ type: String, required: true }) publicId: string;
  @Prop({ type: Number, required: true }) version: number;
  @Prop({ type: Number, required: true }) width: number;
  @Prop({ type: Number, required: true }) height: number;
  @Prop({ type: String, required: true }) format: string;
  /** Region of the source image shown (covers are cropped to 2:3 in the editor). */
  @Prop({ type: CropSchema, default: null }) crop: Crop | null;
  @Prop({ type: String, default: null }) dominantColor: string | null;
  @Prop({ type: String, default: null }) blurDataUrl: string | null;
  @Prop({ type: String, default: '' }) alt: string;
}
export const StoredImageSchema = SchemaFactory.createForClass(StoredImage);

/** The private master PDF (authenticated Cloudinary asset). Its URL is never sent to a browser. */
@Schema({ _id: false })
export class Manuscript {
  @Prop({ type: String, required: true }) publicId: string;
  @Prop({ type: Number, required: true }) version: number;
  @Prop({ type: Number, required: true }) bytes: number;
  @Prop({ type: Number, required: true }) pages: number;
  /** Content hash: the preview regenerates only when the file really changes (BS-6). */
  @Prop({ type: String, required: true }) checksum: string;
  @Prop({ type: Date, required: true }) uploadedAt: Date;
}
export const ManuscriptSchema = SchemaFactory.createForClass(Manuscript);
