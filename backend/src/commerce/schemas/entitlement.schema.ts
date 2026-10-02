import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';

export const COPY_STATUSES = [
  'queued',
  'preparing',
  'ready',
  'failed',
] as const;
export type CopyStatus = (typeof COPY_STATUSES)[number];

/**
 * The buyer's personal PDF, stamped "Licensed to <name> · <email> · Order …" on every page
 * (ARCHITECTURE §10.3), kept in private R2 storage. Built in the background by `CopyWorker`, and
 * rebuilt when the book's file changes (an updated edition reaches owners automatically). Books
 * without stamping serve the master file and never have a copy.
 */
@Schema({ _id: false })
export class EbookCopy {
  @Prop({ type: String, enum: COPY_STATUSES, required: true })
  status: CopyStatus;
  /** The R2 key of the last copy that finished (still served while a newer one builds). */
  @Prop({ type: String, default: null }) key: string | null;
  @Prop({ type: Number, default: null }) bytes: number | null;
  /** Manuscript checksum the ready copy (`key`) was made from. */
  @Prop({ type: String, default: null }) sourceChecksum: string | null;
  /** Manuscript checksum the queued or running build is for. */
  @Prop({ type: String, default: null }) targetChecksum: string | null;
  /** Changes on every queue, so a stale build can't overwrite a newer request. */
  @Prop({ type: Number, default: 0 }) buildToken: number;
  @Prop({ type: Number, default: 0 }) attempts: number;
  @Prop({ type: Date, default: null }) queuedAt: Date | null;
  @Prop({ type: Date, default: null }) startedAt: Date | null;
  @Prop({ type: Date, default: null }) readyAt: Date | null;
  @Prop({ type: String, default: null }) error: string | null;
}
const EbookCopySchema = SchemaFactory.createForClass(EbookCopy);

/**
 * An ebook in a customer's library (ARCHITECTURE §4.4). Granted on settlement (BS-8); read and
 * downloaded from BS-9. Defined here because checkout must refuse ebooks the buyer already owns.
 */
@Schema({ collection: 'entitlements', timestamps: true })
export class Entitlement {
  @Prop({ type: Types.ObjectId, required: true }) userId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) bookId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) orderId: Types.ObjectId;
  @Prop({ type: Date, required: true }) grantedAt: Date;
  @Prop({ type: Date, default: null }) revokedAt: Date | null;
  @Prop({ type: Number, default: 0 }) downloadCount: number;
  @Prop({ type: Date, default: null }) lastDownloadedAt: Date | null;
  @Prop({ type: Date, default: null }) firstOpenedAt: Date | null;
  @Prop({ type: EbookCopySchema, default: null }) copy: EbookCopy | null;
}
export type EntitlementDocument = HydratedDocument<Entitlement>;
export const EntitlementSchema = SchemaFactory.createForClass(Entitlement);
// Buying the same ebook twice is blocked at checkout; this index is the backstop.
EntitlementSchema.index({ userId: 1, bookId: 1 }, { unique: true });
EntitlementSchema.index({ orderId: 1 });
EntitlementSchema.index(
  { 'copy.status': 1, 'copy.queuedAt': 1 },
  {
    partialFilterExpression: {
      'copy.status': { $in: ['queued', 'preparing'] },
    },
  },
);
EntitlementSchema.index(
  { bookId: 1 },
  { partialFilterExpression: { revokedAt: null } },
);
