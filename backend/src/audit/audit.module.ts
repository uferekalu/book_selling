import { Global, Injectable, Logger, Module } from '@nestjs/common';
import {
  InjectModel,
  MongooseModule,
  Prop,
  Schema,
  SchemaFactory,
} from '@nestjs/mongoose';
import {
  Schema as MongooseSchema,
  type ClientSession,
  type Model,
} from 'mongoose';

/**
 * Append-only record of security and admin actions (docs/ARCHITECTURE.md §4.6). Rows are never
 * updated or deleted by the application.
 */
@Schema({
  collection: 'audit_logs',
  timestamps: { createdAt: 'at', updatedAt: false },
})
export class AuditLog {
  /** `null` for system actions (jobs, webhooks). */
  @Prop({ type: String, default: null })
  actorId: string | null;

  @Prop({ type: String, default: null })
  actorRole: string | null;

  /** Dotted verb, e.g. `user.role_changed`, `auth.two_factor_enabled`, `refund.requested`. */
  @Prop({ type: String, required: true })
  action: string;

  @Prop({ type: String, required: true })
  entityType: string;

  @Prop({ type: String, required: true })
  entityId: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  changes: Record<string, unknown> | null;

  @Prop({ type: String, default: null })
  ip: string | null;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ entityType: 1, entityId: 1, at: -1 });
AuditLogSchema.index({ actorId: 1, at: -1 });
AuditLogSchema.index({ at: -1 });

export interface AuditEntry {
  actor: { id: string; role: string } | null;
  action: string;
  entityType: string;
  entityId: string;
  changes?: Record<string, unknown>;
  ip?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditLog.name) private readonly logs: Model<AuditLog>,
  ) {}

  async record(entry: AuditEntry, session?: ClientSession): Promise<void> {
    await this.logs.create(
      [
        {
          actorId: entry.actor?.id ?? null,
          actorRole: entry.actor?.role ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          changes: entry.changes ?? null,
          ip: entry.ip ?? null,
        },
      ],
      { session },
    );
    this.logger.log(
      `${entry.action} ${entry.entityType}:${entry.entityId} by ${entry.actor?.id ?? 'system'}`,
    );
  }
}

/** Global: every domain module records audit entries without importing this module. */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
