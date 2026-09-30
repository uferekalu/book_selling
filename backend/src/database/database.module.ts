import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
        // Indexes are part of correctness here (unique payment references, webhook-event
        // dedupe), not just performance — build them on boot in every environment.
        autoIndex: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
