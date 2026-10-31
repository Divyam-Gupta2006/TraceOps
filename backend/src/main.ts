import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';
import cors from 'cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const allowedDashboardOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://trace-ops-three.vercel.app',
  ];

  if (process.env.TRACEOPS_ALLOWED_ORIGINS) {
    const extra = process.env.TRACEOPS_ALLOWED_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    allowedDashboardOrigins.push(...extra);
  }

  // 1. Dedicated CORS for telemetry ingestion (/v1/traces, /v1/logs)
  // Allows external browser client websites to stream telemetry without credentials
  const telemetryCors = cors({
    origin: '*',
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-traceops-key',
      'x-api-key',
    ],
  });

  // 2. Strict CORS for management & dashboard API routes
  const dashboardCors = cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, mobile, server-side fetch)
      if (!origin || allowedDashboardOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('CORS blocked: Origin not authorized for TraceOps dashboard/management API.'));
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-traceops-key',
      'x-api-key',
    ],
  });

  // Dispatch appropriate CORS policy based on request route
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const isTelemetry =
      req.path.startsWith('/v1/traces') ||
      req.path.startsWith('/v1/logs') ||
      req.path.startsWith('/api/traces') ||
      req.path.startsWith('/api/logs') ||
      req.path.startsWith('/api/v1/traces') ||
      req.path.startsWith('/api/v1/logs');

    if (isTelemetry) {
      return telemetryCors(req, res, next);
    }
    return dashboardCors(req, res, next);
  });

  app.use(express.json({ limit: '10mb' }));

  const port = process.env.PORT || 4000;
  await app.listen(port);

  console.log(`TraceOps Backend running on port ${port}`);
}

bootstrap();