/**
 * Automatic JavaScript Error & Promise Rejection Collector
 */

import { TraceOpsSDK } from '../types';
import { sanitizeUrl, sanitizeString } from '../sanitizer';

export function setupErrorCollector(sdk: TraceOpsSDK): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const errorHandler = (event: ErrorEvent) => {
    try {
      const err = event.error;
      const errorName = err?.name || 'Error';
      const errorMessage = event.message || err?.message || 'Uncaught error';
      const filename = sanitizeUrl(event.filename || window.location.href);
      const lineno = event.lineno || 0;
      const colno = event.colno || 0;
      const stack = sanitizeString(err?.stack || `${errorName}: ${errorMessage}\n    at ${filename}:${lineno}:${colno}`);

      const locationStr = `${filename}:${lineno}:${colno}`;

      // 1. Capture error log
      sdk.captureLog({
        message: `Uncaught ${errorName}: ${errorMessage} (${locationStr})`,
        severity: 'ERROR',
        attributes: {
          'error.type': errorName,
          'error.message': errorMessage,
          'error.filename': filename,
          'error.lineno': lineno,
          'error.colno': colno,
          'error.stack': stack,
        },
      });

      // 2. Capture error span with statusCode = 2 (ERROR)
      sdk.captureSpan({
        name: `error: ${errorName}`,
        durationMs: 1,
        statusCode: 2,
        attributes: {
          'error.type': errorName,
          'error.message': errorMessage,
          'error.location': locationStr,
          'error.stack': stack,
          'page.url': sanitizeUrl(window.location.href),
        },
      });
    } catch {
      // Never crash host application
    }
  };

  const rejectionHandler = (event: PromiseRejectionEvent) => {
    try {
      const reason = event.reason;
      let errorName = 'UnhandledRejection';
      let errorMessage = 'Unhandled Promise Rejection';
      let stack = '';

      if (reason instanceof Error) {
        errorName = reason.name || errorName;
        errorMessage = reason.message || errorMessage;
        stack = sanitizeString(reason.stack || '');
      } else if (typeof reason === 'string') {
        errorMessage = reason;
      } else if (reason && typeof reason === 'object') {
        try {
          errorMessage = JSON.stringify(reason);
        } catch {
          errorMessage = String(reason);
        }
      }

      const currentUrl = sanitizeUrl(window.location.href);

      // 1. Capture rejection log
      sdk.captureLog({
        message: `Unhandled Promise Rejection: ${errorName}: ${errorMessage}`,
        severity: 'ERROR',
        attributes: {
          'error.type': errorName,
          'error.message': errorMessage,
          'error.stack': stack,
          'page.url': currentUrl,
        },
      });

      // 2. Capture rejection span (statusCode = 2)
      sdk.captureSpan({
        name: `rejection: ${errorName}`,
        durationMs: 1,
        statusCode: 2,
        attributes: {
          'error.type': errorName,
          'error.message': errorMessage,
          'error.stack': stack,
          'page.url': currentUrl,
        },
      });
    } catch {
      // Never crash host application
    }
  };

  window.addEventListener('error', errorHandler);
  window.addEventListener('unhandledrejection', rejectionHandler);

  return () => {
    try {
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', rejectionHandler);
    } catch {}
  };
}

