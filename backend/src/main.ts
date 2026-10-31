import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';
import { CorsExceptionFilter } from './cors-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const allowedDashboardOrigins = [
    'https://trace-ops-three.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
  ];

  if (process.env.TRACEOPS_ALLOWED_ORIGINS) {
    const extra = process.env.TRACEOPS_ALLOWED_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    allowedDashboardOrigins.push(...extra);
  }

  // Normalize allowed origins by stripping any trailing slashes
  const normalizedAllowedOrigins = Array.from(
    new Set(allowedDashboardOrigins.map((o) => o.replace(/\/+$/, ''))),
  );

  const isTelemetryPath = (path: string): boolean => {
    const p = path.split('?')[0];
    return (
      p.startsWith('/v1/traces') ||
      p.startsWith('/v1/logs') ||
      p.startsWith('/api/traces') ||
      p.startsWith('/api/logs') ||
      p.startsWith('/api/v1/traces') ||
      p.startsWith('/api/v1/logs')
    );
  };

  // Dedicated, deterministic CORS middleware applied before all routes and body parsers
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const rawPath = req.path || req.url || '';
    const origin = req.headers.origin;

    // 1. Dedicated CORS for telemetry ingestion (/v1/traces, /v1/logs, etc.)
    // Allows external websites and browsers to send telemetry from any origin
    if (isTelemetryPath(rawPath)) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, x-traceops-key, x-api-key, Cache-Control, Pragma',
      );
      res.setHeader('Access-Control-Max-Age', '86400');

      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
      return next();
    }

    // 2. Strict CORS for management, authentication & dashboard API routes
    if (origin) {
      const cleanOrigin = origin.trim().replace(/\/+$/, '');
      const isAllowed = normalizedAllowedOrigins.includes(cleanOrigin);

      if (isAllowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader(
          'Access-Control-Allow-Methods',
          'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS',
        );
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, Cache-Control, Pragma, x-traceops-key, x-api-key, X-Requested-With',
        );
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader(
          'Access-Control-Expose-Headers',
          'Content-Length, Content-Type, Cache-Control, Authorization',
        );
        res.setHeader('Access-Control-Max-Age', '86400');
      } else {
        // Disallowed origin: do not set Access-Control-Allow-Origin
        if (req.method === 'OPTIONS') {
          res.status(403).json({
            statusCode: 403,
            error: 'Forbidden',
            message: 'CORS origin not authorized for TraceOps management API.',
          });
          return;
        }
      }
    }

    // Handle OPTIONS preflight for allowed or non-origin requests
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  });

  // Global exception filter ensures CORS headers are NEVER dropped on 401, 403, 404, or 500 errors
  app.useGlobalFilters(new CorsExceptionFilter(normalizedAllowedOrigins));

  app.use(express.json({ limit: '10mb' }));

  const port = process.env.PORT || 4000;
  await app.listen(port);

  console.log(`TraceOps Backend running on port ${port}`);
}

bootstrap();
