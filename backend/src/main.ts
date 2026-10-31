import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://trace-ops-three.vercel.app',
    ],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-traceops-key',
      'x-api-key',
    ],
  });

  app.use(express.json({ limit: '10mb' }));

  const port = process.env.PORT || 4000;
  await app.listen(port);

  console.log(`TraceOps Backend running on port ${port}`);
}

bootstrap();