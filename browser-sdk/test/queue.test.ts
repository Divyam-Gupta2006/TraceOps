import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EventQueue } from '../src/queue';
import { InternalSpan, InternalLog } from '../src/transport';

describe('EventQueue', () => {
  it('batches events and flushes when batchSize is reached', async () => {
    let sentSpanBatches: any[] = [];
    let sentLogBatches: any[] = [];

    const mockTransport: any = {
      sendSpans: async (spans: any[]) => {
        sentSpanBatches.push(spans);
        return true;
      },
      sendLogs: async (logs: any[]) => {
        sentLogBatches.push(logs);
        return true;
      },
    };

    const queue = new EventQueue({
      batchSize: 3,
      flushInterval: 5000,
      maxQueueSize: 100,
      transport: mockTransport,
    });

    const dummySpan = (name: string): InternalSpan => ({
      traceId: '123',
      spanId: '456',
      parentSpanId: null,
      name,
      durationMs: 10,
      startTimeUnixNano: '1000',
      endTimeUnixNano: '2000',
      statusCode: 1,
      attributes: {},
    });

    queue.enqueueSpan(dummySpan('span 1'));
    queue.enqueueSpan(dummySpan('span 2'));

    // Should not have flushed yet (batchSize is 3)
    assert.strictEqual(sentSpanBatches.length, 0);

    // 3rd item triggers batch flush
    queue.enqueueSpan(dummySpan('span 3'));

    // Wait a tick for async flush to resolve
    await new Promise((r) => setTimeout(r, 10));

    assert.strictEqual(sentSpanBatches.length, 1);
    assert.strictEqual(sentSpanBatches[0].length, 3);
    assert.strictEqual(sentSpanBatches[0][0].name, 'span 1');
    assert.strictEqual(sentSpanBatches[0][2].name, 'span 3');

    await queue.shutdown();
  });

  it('flushes on interval timer', async () => {
    let sentSpanBatches: any[] = [];

    const mockTransport: any = {
      sendSpans: async (spans: any[]) => {
        sentSpanBatches.push(spans);
        return true;
      },
      sendLogs: async () => true,
    };

    const queue = new EventQueue({
      batchSize: 10,
      flushInterval: 50, // 50ms for test
      maxQueueSize: 100,
      transport: mockTransport,
    });

    queue.enqueueSpan({
      traceId: '123',
      spanId: '456',
      parentSpanId: null,
      name: 'delayed span',
      durationMs: 10,
      startTimeUnixNano: '1000',
      endTimeUnixNano: '2000',
      statusCode: 1,
      attributes: {},
    });

    assert.strictEqual(sentSpanBatches.length, 0);

    // Wait for flushInterval timer to fire
    await new Promise((r) => setTimeout(r, 80));

    assert.strictEqual(sentSpanBatches.length, 1);
    assert.strictEqual(sentSpanBatches[0][0].name, 'delayed span');

    await queue.shutdown();
  });

  it('drops oldest events when maxQueueSize is reached to protect memory', async () => {
    const mockTransport: any = {
      sendSpans: async () => true,
      sendLogs: async () => true,
    };

    const queue = new EventQueue({
      batchSize: 100, // Large batch size so it doesn't flush immediately
      flushInterval: 10000,
      maxQueueSize: 3,
      transport: mockTransport,
    });

    for (let i = 1; i <= 5; i++) {
      queue.enqueueSpan({
        traceId: '123',
        spanId: '456',
        parentSpanId: null,
        name: `span_${i}`,
        durationMs: 10,
        startTimeUnixNano: '1000',
        endTimeUnixNano: '2000',
        statusCode: 1,
        attributes: {},
      });
    }

    assert.strictEqual(queue.queueLength, 3);

    let flushedSpans: any[] = [];
    mockTransport.sendSpans = async (spans: any[]) => {
      flushedSpans = spans;
      return true;
    };

    await queue.flush();
    assert.strictEqual(flushedSpans.length, 3);
    // Oldest spans (1 and 2) were dropped; spans 3, 4, 5 remain
    assert.strictEqual(flushedSpans[0].name, 'span_3');
    assert.strictEqual(flushedSpans[2].name, 'span_5');

    await queue.shutdown();
  });

  it('flushes pending events and stops timers on shutdown', async () => {
    let sentLogs: any[] = [];

    const mockTransport: any = {
      sendSpans: async () => true,
      sendLogs: async (logs: any[]) => {
        sentLogs.push(...logs);
        return true;
      },
    };

    const queue = new EventQueue({
      batchSize: 10,
      flushInterval: 5000,
      maxQueueSize: 100,
      transport: mockTransport,
    });

    queue.enqueueLog({
      traceId: null,
      spanId: null,
      severity: 'INFO',
      body: 'pending shutdown log',
      timeUnixNano: '1000',
    });

    assert.strictEqual(sentLogs.length, 0);

    await queue.shutdown();

    // Shutdown should have flushed the pending log
    assert.strictEqual(sentLogs.length, 1);
    assert.strictEqual(sentLogs[0].body, 'pending shutdown log');

    // Future enqueues after shutdown are ignored
    queue.enqueueLog({
      traceId: null,
      spanId: null,
      severity: 'WARN',
      body: 'ignored log',
      timeUnixNano: '2000',
    });
    assert.strictEqual(queue.queueLength, 0);
  });
});

