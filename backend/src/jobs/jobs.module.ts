import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobLockService } from './job-lock.service.js';
import { JobLock, JobLockSchema } from './schemas/job-lock.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: JobLock.name, schema: JobLockSchema }]),
  ],
  providers: [JobLockService],
  exports: [JobLockService],
})
export class JobsModule {}
