import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export const DEFAULT_REPLY_TIME = 'Usually replies within a day';

/** Single document (`_id: 'messaging'`): what the owner sets for the inbox (PRODUCT_RULES §11). */
@Schema({ collection: 'messaging_settings', versionKey: false })
export class MessagingSettings {
  @Prop({ type: String, required: true }) _id: string;
  /** Shown to customers next to the message box, e.g. "Usually replies within a day". */
  @Prop({ type: String, default: DEFAULT_REPLY_TIME, maxlength: 120 })
  replyTime: string;
}
export type MessagingSettingsDocument = HydratedDocument<MessagingSettings>;
export const MessagingSettingsSchema =
  SchemaFactory.createForClass(MessagingSettings);
