import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { setupApp } from './setup-app.js';

async function bootstrap() {
  // rawBody: true — payment webhook signatures are computed over the exact bytes received, not a
  // re-serialized copy of the parsed JSON. Nest keeps it as `req.rawBody` alongside `req.body`.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  app.useLogger(app.get(Logger));
  setupApp(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Book Selling Platform API')
    .setDescription(
      'Online bookstore API — catalogue, checkout, payments, delivery, email and messaging.',
    )
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const port = app.get(ConfigService).get<number>('PORT') ?? 4000;
  await app.listen(port);
  // Visible in the host's deploy logs: the public domain must point at this port (BS-25).
  app.get(Logger).log(`API listening on port ${port}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
