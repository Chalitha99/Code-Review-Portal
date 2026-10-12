import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.ts';
import { configureApp } from './app.setup.ts';
import { setupSwagger } from './swagger.js';

async function bootstrap(): Promise<void> {
  // Nest's default parser is replaced by `registerBodyParsers` (per-route limits).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configureApp(app);
  const config = app.get(ConfigService);
  setupSwagger(app, config.getOrThrow<boolean>('swaggerEnabled'));
  await app.listen(config.getOrThrow<number>('port'));
}

void bootstrap();
