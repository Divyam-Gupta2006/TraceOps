/**
 * Event Queue for batching and buffering TraceOps telemetry events.
 */

import { InternalSpan, InternalLog, Transport } from './transport';

export interface QueueConfig {
  batchSize: number;
  flushInterval: number;
  maxQueueSize: number;
  transport: Transport;
  onError?: (error: Error) => void;
}

export class EventQueue {
  private spans: InternalSpan[] = [];
  private logs: InternalLog[] = [];
  private readonly batchSize: number;
  private readonly flushInterval: number;
  private readonly maxQueueSize: number;
  private readonly transport: Transport;
  private readonly onError?: (error: Error) => void;

  private timer: any = null;
  private isFlushing = false;
  private isShutdown = false;

  constructor(config: QueueConfig) {
    this.batchSize = config.batchSize || 10;
    this.flushInterval = config.flushInterval || 2000;
    this.maxQueueSize = config.maxQueueSize || 500;
    this.transport = config.transport;
    this.onError = config.onError;

    this.startTimer();
  }

  /**
   * Enqueues an internal span. Flushes immediately if batchSize reached.
   */
  enqueueSpan(span: InternalSpan): void {
    if (this.isShutdown) return;

    if (this.spans.length + this.logs.length >= this.maxQueueSize) {
      // Drop oldest span to preserve host memory under sustained offline state
      if (this.spans.length > 0) {
        this.spans.shift();
      }
    }

    this.spans.push(span);

    if (this.spans.length + this.logs.length >= this.batchSize) {
      this.flush().catch(() => {});
    }
  }

  /**
   * Enqueues an internal log. Flushes immediately if batchSize reached.
   */
  enqueueLog(log: InternalLog): void {
    if (this.isShutdown) return;

    if (this.spans.length + this.logs.length >= this.maxQueueSize) {
      // Drop oldest log to preserve host memory
      if (this.logs.length > 0) {
        this.logs.shift();
      }
    }

    this.logs.push(log);

    if (this.spans.length + this.logs.length >= this.batchSize) {
      this.flush().catch(() => {});
    }
  }

  /**
   * Flushes all currently queued spans and logs.
   */
  async flush(): Promise<void> {
    if (this.isFlushing || (this.spans.length === 0 && this.logs.length === 0)) {
      return;
    }

    this.isFlushing = true;

    // Drain current queues
    const spansToSend = this.spans.splice(0, this.spans.length);
    const logsToSend = this.logs.splice(0, this.logs.length);

    try {
      const promises: Promise<any>[] = [];
      if (spansToSend.length > 0) {
        promises.push(this.transport.sendSpans(spansToSend));
      }
      if (logsToSend.length > 0) {
        promises.push(this.transport.sendLogs(logsToSend));
      }
      await Promise.all(promises);
    } catch (err: any) {
      if (this.onError) {
        try {
          this.onError(err);
        } catch {
          // Prevent error callback from breaking host application
        }
      }
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Shuts down the queue, stops the timer, and flushes remaining events.
   */
  async shutdown(): Promise<void> {
    if (this.isShutdown) return;
    this.isShutdown = true;
    this.stopTimer();
    await this.flush();
  }

  private startTimer(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      this.flush().catch(() => {});
    }, this.flushInterval);

    // If running in Node, do not let timer block process exit
    if (typeof this.timer?.unref === 'function') {
      this.timer.unref();
    }
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Current count of queued items (spans + logs).
   */
  get queueLength(): number {
    return this.spans.length + this.logs.length;
  }
}

