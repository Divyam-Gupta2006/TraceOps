import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class CorsExceptionFilter implements ExceptionFilter {
  constructor(private readonly allowedOrigins: string[]) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const origin = request.headers.origin;
    const rawPath = request.path || request.url || '';
    const path = rawPath.split('?')[0];

    const isTelemetry =
      path.startsWith('/v1/traces') ||
      path.startsWith('/v1/logs') ||
      path.startsWith('/api/traces') ||
      path.startsWith('/api/logs') ||
      path.startsWith('/api/v1/traces') ||
      path.startsWith('/api/v1/logs');

    if (isTelemetry) {
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      response.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, x-traceops-key, x-api-key, Cache-Control, Pragma',
      );
    } else if (origin) {
      const cleanOrigin = origin.trim().replace(/\/+$/, '');
      if (this.allowedOrigins.includes(cleanOrigin)) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader(
          'Access-Control-Allow-Methods',
          'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS',
        );
        response.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, Cache-Control, Pragma, x-traceops-key, x-api-key, X-Requested-With',
        );
        response.setHeader('Access-Control-Allow-Credentials', 'true');
        response.setHeader(
          'Access-Control-Expose-Headers',
          'Content-Length, Content-Type, Cache-Control, Authorization',
        );
      }
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : {
            statusCode: status,
            message: (exception as any)?.message || 'Internal server error',
            error: 'Internal Server Error',
          };

    response
      .status(status)
      .json(
        typeof exceptionResponse === 'object'
          ? exceptionResponse
          : { statusCode: status, message: exceptionResponse },
      );
  }
}

