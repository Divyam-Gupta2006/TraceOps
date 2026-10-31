/**
 * Transport layer for TraceOps Browser SDK
 */

import { delay } from './utils';

export interface InternalSpan {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  durationMs: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  statusCode: number;
  attributes: Record<string, any>;
}

export interface InternalLog {
  traceId: string | null;
  spanId: string | null;
  severity: string;
  body: string;
  timeUnixNano: string;
}

export interface TransportConfig {
  apiKey: string;
  endpoint: string;
  serviceName: string;
  maxRetries: number;
  initialRetryDelayMs: number;
  onError?: (error: Error) => void;
}

export class Transport {
  private readonly apiKey: string;
  private readonly tracesUrl: string;
  private readonly logsUrl: string;
  private readonly serviceName: string;
  private readonly maxRetries: number;
  private readonly initialRetryDelayMs: number;
  private readonly onError?: (error: Error) => void;

  constructor(config: TransportConfig) {
    this.apiKey = config.apiKey;
    const base = config.endpoint.replace(/\/+$/, '');
    this.tracesUrl = `${base}/v1/traces`;
    this.logsUrl = `${base}/v1/logs`;
    this.serviceName = config.serviceName || 'browser';
    this.maxRetries = config.maxRetries ?? 3;
    this.initialRetryDelayMs = config.initialRetryDelayMs ?? 500;
    this.onError = config.onError;
  }

  /**
   * Sends a batch of spans to /v1/traces formatted as OpenTelemetry OTLP/HTTP.
   */
  async sendSpans(spans: InternalSpan[]): Promise<boolean> {
    if (!spans || spans.length === 0) return true;

    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              {
                key: 'service.name',
                value: { stringValue: this.serviceName },
              },
              {
                key: 'telemetry.sdk.language',
                value: { stringValue: 'javascript' },
              },
            ],
          },
          scopeSpans: [
            {
              spans: spans.map((s) => ({
                traceId: s.traceId,
                spanId: s.spanId,
                parentSpanId: s.parentSpanId || null,
                name: s.name,
                durationMs: s.durationMs,
                startTimeUnixNano: s.startTimeUnixNano,
                endTimeUnixNano: s.endTimeUnixNano,
                status: {
                  code: s.statusCode,
                },
                attributes: s.attributes,
              })),
            },
          ],
        },
      ],
    };

    return this.postWithRetry(this.tracesUrl, payload);
  }

  /**
   * Sends a batch of logs to /v1/logs formatted as OpenTelemetry OTLP/HTTP.
   */
  async sendLogs(logs: InternalLog[]): Promise<boolean> {
    if (!logs || logs.length === 0) return true;

    const payload = {
      resourceLogs: [
        {
          resource: {
            attributes: [
              {
                key: 'service.name',
                value: { stringValue: this.serviceName },
              },
              {
                key: 'telemetry.sdk.language',
                value: { stringValue: 'javascript' },
              },
            ],
          },
          scopeLogs: [
            {
              logRecords: logs.map((l) => ({
                traceId: l.traceId || null,
                spanId: l.spanId || null,
                severityText: l.severity,
                body: { stringValue: l.body },
                timeUnixNano: l.timeUnixNano,
              })),
            },
          ],
        },
      ],
    };

    return this.postWithRetry(this.logsUrl, payload);
  }

  /**
   * Dispatches an HTTP POST request with bounded exponential backoff.
   * Immediately halts retrying on 401 or 403.
   */
  private async postWithRetry(url: string, payload: any): Promise<boolean> {
    const jsonBody = JSON.stringify(payload);
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        const fetchFn = typeof fetch === 'function' ? fetch : null;
        if (!fetchFn) {
          this.handleError(new Error('Global fetch is not available in current environment.'));
          return false;
        }

        const res = await fetchFn(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-traceops-key': this.apiKey,
          },
          body: jsonBody,
          // keepalive allows requests to outlive the page lifecycle
          keepalive: true,
        });

        // 200, 201, 202 accepted
        if (res.status >= 200 && res.status < 300) {
          return true;
        }

        // Fatal client errors: 401 Unauthorized or 403 Forbidden
        // Never retry an invalid API key
        if (res.status === 401 || res.status === 403) {
          this.handleError(
            new Error(
              `TraceOps authorization failed (HTTP ${res.status}): Invalid or restricted API key.`,
            ),
          );
          return false;
        }

        // Non-retryable client errors (400, 404, etc.)
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          this.handleError(
            new Error(`TraceOps ingestion rejected payload with HTTP ${res.status}.`),
          );
          return false;
        }

        // 5xx Server Error or 429 Rate Limit - retryable
        attempt++;
        if (attempt <= this.maxRetries) {
          const backoff = Math.min(
            this.initialRetryDelayMs * Math.pow(2, attempt - 1),
            10000,
          );
          await delay(backoff);
        } else {
          this.handleError(
            new Error(
              `TraceOps ingestion failed with HTTP ${res.status} after ${this.maxRetries} retries.`,
            ),
          );
          return false;
        }
      } catch (err: any) {
        // Network or fetch failure
        attempt++;
        if (attempt <= this.maxRetries) {
          const backoff = Math.min(
            this.initialRetryDelayMs * Math.pow(2, attempt - 1),
            10000,
          );
          await delay(backoff);
        } else {
          this.handleError(
            new Error(
              `TraceOps network request failed after ${this.maxRetries} retries: ${err?.message || 'Unknown network error'}`,
            ),
          );
          return false;
        }
      }
    }

    return false;
  }

  private handleError(err: Error): void {
    if (this.onError) {
      try {
        this.onError(err);
      } catch {
        // Suppress any callback error to protect host application
      }
    }
  }
}

