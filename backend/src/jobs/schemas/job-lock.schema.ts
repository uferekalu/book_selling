import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

/** One document per job name; whoever holds an unexpired lease runs the job. */
@Schema({ collection: 'job_locks', timestamps: true })
export class JobLock {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ type: String, required: true })
  owner: string;

  @Prop({ type: Date, required: true })
  lockedUntil: Date;
}

export type JobLockDocument = HydratedDocument<JobLock>;
export const JobLockSchema = SchemaFactory.createForClass(JobLock);
