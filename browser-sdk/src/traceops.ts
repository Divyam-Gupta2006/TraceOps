/**
 * TraceOps Browser SDK - Core Class
 */

import {
  TraceOpsOptions,
  SpanPayload,
  LogPayload,
  TraceOpsSDK,
} from './types';
import {
  generateTraceId,
  generateSpanId,
  toNanoString,
  normalizeStatusCode,
} from './utils';
import { sanitizeAttributes, sanitizeString } from './sanitizer';
import { Transport } from './transport';
import { EventQueue } from './queue';
import { setupErrorCollector } from './collectors/errors';
import { setupWebVitalsCollector } from './collectors/vitals';
import { setupNavigationCollector } from './collectors/navigation';

export class TraceOps implements TraceOpsSDK {
  private static instance: TraceOps | null = null;

  private readonly options: Required<
    Omit<TraceOpsOptions, 'onError' | 'collectors'>
  > & {
    onError?: (error: Error) => void;
    collectors?: TraceOpsOptions['collectors'];
  };

  private readonly transport: Transport;
  private readonly queue: EventQueue;
  private isDestroyed = false;
  private unloadListener: (() => void) | null = null;
  private readonly collectorCleanups: (() => void)[] = [];

  private constructor(options: TraceOpsOptions) {
    if (!options || typeof options.apiKey !== 'string' || options.apiKey.trim() === '') {
      throw new Error('TraceOps.init: "apiKey" is required.');
    }

    this.options = {
      apiKey: options.apiKey.trim(),
      endpoint: (options.endpoint || 'http://localhost:4000').replace(/\/+$/, ''),
      batchSize: options.batchSize && options.batchSize > 0 ? options.batchSize : 10,
      flushInterval:
        options.flushInterval && options.flushInterval > 0
          ? options.flushInterval
          : 2000,
      serviceName: options.serviceName?.trim() || 'browser',
      maxQueueSize: options.maxQueueSize && options.maxQueueSize > 0 ? options.maxQueueSize : 500,
      maxRetries: options.maxRetries !== undefined ? options.maxRetries : 3,
      initialRetryDelayMs:
        options.initialRetryDelayMs !== undefined ? options.initialRetryDelayMs : 500,
      onError: options.onError,
      collectors: options.collectors,
    };

    this.transport = new Transport({
      apiKey: this.options.apiKey,
      endpoint: this.options.endpoint,
      serviceName: this.options.serviceName,
      maxRetries: this.options.maxRetries,
      initialRetryDelayMs: this.options.initialRetryDelayMs,
      onError: this.options.onError,
    });

    this.queue = new EventQueue({
      batchSize: this.options.batchSize,
      flushInterval: this.options.flushInterval,
      maxQueueSize: this.options.maxQueueSize,
      transport: this.transport,
      onError: this.options.onError,
    });

    this.setupPageUnloadHandlers();
    this.setupCollectors();
  }

  /**
   * Initializes the global TraceOps instance.
   * If a previous instance is active, it is cleanly shut down to prevent duplicate timers/listeners.
   */
  static init(options: TraceOpsOptions): TraceOps {
    try {
      if (TraceOps.instance) {
        // Prevent duplicate timers and duplicate listeners
        TraceOps.instance.shutdown().catch(() => {});
        TraceOps.instance = null;
      }

      const sdk = new TraceOps(options);
      TraceOps.instance = sdk;
      return sdk;
    } catch (err: any) {
      if (options?.onError) {
        try {
          options.onError(err);
        } catch {}
      } else {
        // In dev or tests, output clean warning without logging apiKey
        console.warn('[TraceOps] Failed to initialize:', err?.message || err);
      }
      // Return a non-throwing fallback dummy SDK if init fails
      return TraceOps.createDummySDK(options);
    }
  }

  /**
   * Returns the current active TraceOps instance, if any.
   */
  static getInstance(): TraceOps | null {
    return TraceOps.instance;
  }

  /**
   * Static helper to capture a span on the active instance.
   */
  static captureSpan(payload: SpanPayload): void {
    if (TraceOps.instance) {
      TraceOps.instance.captureSpan(payload);
    }
  }

  /**
   * Static helper to capture a log on the active instance.
   */
  static captureLog(payload: LogPayload): void {
    if (TraceOps.instance) {
      TraceOps.instance.captureLog(payload);
    }
  }

  /**
   * Static helper to flush the active instance.
   */
  static flush(): Promise<void> {
    if (TraceOps.instance) {
      return TraceOps.instance.flush();
    }
    return Promise.resolve();
  }

  /**
   * Static helper to shut down the active instance.
   */
  static shutdown(): Promise<void> {
    if (TraceOps.instance) {
      const inst = TraceOps.instance;
      TraceOps.instance = null;
      return inst.shutdown();
    }
    return Promise.resolve();
  }

  /**
   * Captures an operation span and buffers it for batch delivery.
   */
  captureSpan(payload: SpanPayload): void {
    if (this.isDestroyed || !payload) return;

    try {
      const dur = Math.max(0.1, Math.round(Number(payload.durationMs || 1) * 10) / 10);
      const startMs = payload.startTime
        ? payload.startTime instanceof Date
          ? payload.startTime.getTime()
          : Number(payload.startTime)
        : Date.now() - dur;

      const startNano = BigInt(Math.round(startMs)) * 1_000_000n;
      const endNano = startNano + BigInt(Math.round(dur)) * 1_000_000n;

      const traceId = payload.traceId || generateTraceId();
      const spanId = payload.spanId || generateSpanId();
      const parentSpanId = payload.parentSpanId || null;
      const name = sanitizeString(payload.name || 'HTTP Request', 256);
      const statusCode = normalizeStatusCode(payload.statusCode);
      const cleanAttrs = sanitizeAttributes(payload.attributes);

      this.queue.enqueueSpan({
        traceId,
        spanId,
        parentSpanId,
        name,
        durationMs: dur,
        startTimeUnixNano: String(startNano),
        endTimeUnixNano: String(endNano),
        statusCode,
        attributes: cleanAttrs,
      });
    } catch (err: any) {
      this.handleError(err);
    }
  }

  /**
   * Captures a log entry and buffers it for batch delivery.
   */
  captureLog(payload: LogPayload): void {
    if (this.isDestroyed || !payload) return;

    try {
      const bodyRaw = payload.message || payload.body || 'Log event';
      const body = sanitizeString(bodyRaw, 2048);
      const severity = (payload.severity || 'INFO').toUpperCase();
      const timeUnixNano = toNanoString(payload.timestamp);
      const traceId = payload.traceId || null;
      const spanId = payload.spanId || null;

      this.queue.enqueueLog({
        traceId,
        spanId,
        severity,
        body,
        timeUnixNano,
      });
    } catch (err: any) {
      this.handleError(err);
    }
  }

  /**
   * Flushes all queued telemetry immediately.
   */
  async flush(): Promise<void> {
    if (this.isDestroyed) return;
    try {
      await this.queue.flush();
    } catch (err: any) {
      this.handleError(err);
    }
  }

  /**
   * Shuts down SDK, clears timers and flush loops, and sends any remaining telemetry.
   */
  async shutdown(): Promise<void> {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    this.removePageUnloadHandlers();
    this.cleanupCollectors();

    if (TraceOps.instance === this) {
      TraceOps.instance = null;
    }

    try {
      await this.queue.shutdown();
    } catch (err: any) {
      this.handleError(err);
    }
  }

  private setupCollectors(): void {
    if (typeof window === 'undefined') return;

    const config = this.options.collectors || {};

    if (config.errors !== false) {
      try {
        this.collectorCleanups.push(setupErrorCollector(this));
      } catch {}
    }

    if (config.vitals !== false) {
      try {
        this.collectorCleanups.push(setupWebVitalsCollector(this));
      } catch {}
    }

    if (config.navigation !== false) {
      try {
        this.collectorCleanups.push(setupNavigationCollector(this));
      } catch {}
    }
  }

  private cleanupCollectors(): void {
    while (this.collectorCleanups.length > 0) {
      const cleanup = this.collectorCleanups.pop();
      if (cleanup) {
        try {
          cleanup();
        } catch {}
      }
    }
  }

  private setupPageUnloadHandlers(): void {
    if (typeof window === 'undefined') return;

    this.unloadListener = () => {
      // Flush synchronously or with keepalive
      this.flush().catch(() => {});
    };

    try {
      if ('addEventListener' in window) {
        window.addEventListener('pagehide', this.unloadListener);
        window.addEventListener('beforeunload', this.unloadListener);
      }
    } catch {}
  }

  private removePageUnloadHandlers(): void {
    if (typeof window === 'undefined' || !this.unloadListener) return;

    try {
      if ('removeEventListener' in window) {
        window.removeEventListener('pagehide', this.unloadListener);
        window.removeEventListener('beforeunload', this.unloadListener);
      }
    } catch {}
    this.unloadListener = null;
  }

  private handleError(err: Error): void {
    if (this.options.onError) {
      try {
        this.options.onError(err);
      } catch {}
    }
  }

  private static createDummySDK(options?: TraceOpsOptions): TraceOps {
    // Returns a safe no-op implementation
    const dummy: any = {
      captureSpan: () => {},
      captureLog: () => {},
      flush: () => Promise.resolve(),
      shutdown: () => Promise.resolve(),
    };
    return dummy as TraceOps;
  }
}

