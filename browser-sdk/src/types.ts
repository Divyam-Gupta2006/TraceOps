/**
 * TraceOps Browser SDK Types
 */

export interface TraceOpsOptions {
  /**
   * Project API key (e.g. 'tops_live_...')
   */
  apiKey: string;

  /**
   * TraceOps ingestion backend URL.
   * Defaults to 'http://localhost:4000'.
   */
  endpoint?: string;

  /**
   * Maximum number of events to buffer before triggering a flush.
   * Default: 10
   */
  batchSize?: number;

  /**
   * Interval in milliseconds at which buffered events are sent.
   * Default: 2000
   */
  flushInterval?: number;

  /**
   * Optional error callback for SDK internal failures (network, quota, etc.).
   * Never throws errors into the host website.
   */
  onError?: (error: Error) => void;

  /**
   * Name of the client service.
   * Default: 'browser'
   */
  serviceName?: string;

  /**
   * Maximum queued events allowed in memory to prevent memory leaks.
   * Default: 500
   */
  maxQueueSize?: number;

  /**
   * Maximum retry attempts for transient server/network failures.
   * Default: 3
   */
  maxRetries?: number;

  /**
   * Initial backoff delay for retries in milliseconds.
   * Default: 500
   */
  initialRetryDelayMs?: number;

  /**
   * Automatic browser collectors configuration.
   * Default: all enabled ({ errors: true, vitals: true, navigation: true })
   */
  collectors?: TraceOpsCollectorsConfig;
}

export interface TraceOpsCollectorsConfig {
  /**
   * Automatic collection of runtime JavaScript errors and unhandled promise rejections.
   * Default: true
   */
  errors?: boolean;

  /**
   * Automatic collection of Core Web Vitals (LCP, CLS, INP, FCP, TTFB).
   * Default: true
   */
  vitals?: boolean;

  /**
   * Automatic collection of page navigation, load timing, and SPA route transitions.
   * Default: true
   */
  navigation?: boolean;
}

export interface SpanPayload {
  /**
   * Operation / span name (e.g. 'click /checkout' or 'fetch /api/cart').
   */
  name: string;

  /**
   * Duration of the operation in milliseconds.
   */
  durationMs: number;

  /**
   * Start timestamp (Date instance or milliseconds since epoch).
   * Defaults to current time minus durationMs.
   */
  startTime?: Date | number;

  /**
   * Trace identifier (32 hex characters).
   * Generated automatically if omitted.
   */
  traceId?: string;

  /**
   * Span identifier (16 hex characters).
   * Generated automatically if omitted.
   */
  spanId?: string;

  /**
   * Parent span identifier if this is a child operation.
   */
  parentSpanId?: string | null;

  /**
   * Status code: 1 = OK, 2 = ERROR (or HTTP-like status, e.g. 200, 500).
   * Default: 1
   */
  statusCode?: number;

  /**
   * Custom attributes / tags.
   * Sensitive keys (passwords, tokens, cookies, auth headers) are automatically sanitized.
   */
  attributes?: Record<string, any>;
}

export interface LogPayload {
  /**
   * Log message body.
   */
  message?: string;

  /**
   * Alias for message.
   */
  body?: string;

  /**
   * Severity level.
   * Default: 'INFO'
   */
  severity?: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

  /**
   * Timestamp (Date instance or milliseconds since epoch).
   * Defaults to current time.
   */
  timestamp?: Date | number;

  /**
   * Associated traceId for correlation.
   */
  traceId?: string | null;

  /**
   * Associated spanId for correlation.
   */
  spanId?: string | null;

  /**
   * Custom attributes attached to the log entry.
   */
  attributes?: Record<string, any>;
}

export interface TraceOpsSDK {
  captureSpan(payload: SpanPayload): void;
  captureLog(payload: LogPayload): void;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

