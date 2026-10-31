import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: '*',
  });
  app.use(express.json({ limit: '10mb' }));

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`🚀 TraceOps Backend & OTLP Ingestion Gateway running on http://localhost:${port}`);
}
bootstrap();
