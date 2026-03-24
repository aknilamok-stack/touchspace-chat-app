import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const uploadsDir = join(process.cwd(), 'uploads');

  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }

  const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowVercelPreviews = (process.env.ALLOW_VERCEL_PREVIEWS ?? 'false') === 'true';
  const vercelPreviewPattern = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (
        allowedOrigins.includes(origin) ||
        (allowVercelPreviews && vercelPreviewPattern.test(origin))
      ) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
    },
  });

  app.use('/uploads', express.static(uploadsDir));

  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
}
void bootstrap();
