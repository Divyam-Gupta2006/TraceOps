import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TraceOps } from '../src/traceops';

describe('TraceOps SDK Integration', () => {
  let originalFetch: any;
  let requests: { url: string; headers: any; body: any }[] = [];

  beforeEach(() => {
    requests = [];
    originalFetch = global.fetch;
    global.fetch = async (url: any, init: any) => {
      requests.push({
        url: String(url),
        headers: init.headers,
        body: JSON.parse(init.body),
      });
      return { status: 202, ok: true } as any;
    };
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    await TraceOps.shutdown();
  });

  it('initializes and captures spans with automatic ID generation', async () => {
    const sdk = TraceOps.init({
      apiKey: 'tops_live_samplekey',
      endpoint: 'http://localhost:4000',
      batchSize: 1, // Flush immediately on every span
    });

    sdk.captureSpan({
      name: 'click /signup-button',
      durationMs: 25,
      attributes: {
        theme: 'dark',
        user_password: 'should_be_redacted',
      },
    });

    // Wait a tick for queue flush
    await new Promise((r) => setTimeout(r, 20));

    assert.strictEqual(requests.length, 1);
    assert.strictEqual(requests[0].url, 'http://localhost:4000/v1/traces');
    assert.strictEqual(requests[0].headers['x-traceops-key'], 'tops_live_samplekey');

    const span = requests[0].body.resourceSpans[0].scopeSpans[0].spans[0];
    assert.strictEqual(span.name, 'click /signup-button');
    assert.strictEqual(span.durationMs, 25);
    // traceId should be 32 hex chars
    assert.strictEqual(span.traceId.length, 32);
    // spanId should be 16 hex chars
    assert.strictEqual(span.spanId.length, 16);
    // Status code defaults to 1 (OK)
    assert.strictEqual(span.status.code, 1);
    // Sanitized attributes
    assert.strictEqual(span.attributes.theme, 'dark');
    assert.strictEqual(span.attributes.user_password, '[REDACTED]');
  });

  it('captures logs and correlates with traceId/spanId', async () => {
    const sdk = TraceOps.init({
      apiKey: 'tops_live_samplekey',
      endpoint: 'http://localhost:4000',
      batchSize: 1,
    });

    sdk.captureLog({
      message: 'Checkout API returned error',
      severity: 'ERROR',
      traceId: '11112222333344445555666677778888',
      spanId: '1111222233334444',
    });

    await new Promise((r) => setTimeout(r, 20));

    assert.strictEqual(requests.length, 1);
    assert.strictEqual(requests[0].url, 'http://localhost:4000/v1/logs');

    const record = requests[0].body.resourceLogs[0].scopeLogs[0].logRecords[0];
    assert.strictEqual(record.severityText, 'ERROR');
    assert.strictEqual(record.body.stringValue, 'Checkout API returned error');
    assert.strictEqual(record.traceId, '11112222333344445555666677778888');
    assert.strictEqual(record.spanId, '1111222233334444');
  });

  it('prevents duplicate timers when init is called multiple times', async () => {
    const sdk1 = TraceOps.init({
      apiKey: 'tops_live_first',
      endpoint: 'http://localhost:4000',
      flushInterval: 100,
    });

    const sdk2 = TraceOps.init({
      apiKey: 'tops_live_second',
      endpoint: 'http://localhost:4000',
      flushInterval: 100,
    });

    assert.notStrictEqual(sdk1, sdk2);
    assert.strictEqual(TraceOps.getInstance(), sdk2);

    sdk2.captureSpan({ name: 'span after re-init', durationMs: 10 });
    await sdk2.flush();

    assert.strictEqual(requests.length, 1);
    assert.strictEqual(requests[0].headers['x-traceops-key'], 'tops_live_second');
  });

  it('fails safely without throwing when missing apiKey', () => {
    let capturedErr: Error | null = null;
    const sdk = TraceOps.init({
      apiKey: '',
      onError: (err) => {
        capturedErr = err;
      },
    });

    assert.ok(sdk);
    // Safe dummy SDK returned; does not throw when calling methods
    assert.doesNotThrow(() => {
      sdk.captureSpan({ name: 'test', durationMs: 5 });
      sdk.captureLog({ message: 'test' });
    });
    assert(capturedErr);
    const err = capturedErr as Error;
    assert.ok(err.message.includes('"apiKey" is required'));
  });

  it('supports static capture methods', async () => {
    TraceOps.init({
      apiKey: 'tops_live_static',
      endpoint: 'http://localhost:4000',
      batchSize: 1,
    });

    TraceOps.captureSpan({ name: 'static span', durationMs: 5 });
    await new Promise((r) => setTimeout(r, 20));

    assert.strictEqual(requests.length, 1);
    assert.strictEqual(requests[0].headers['x-traceops-key'], 'tops_live_static');
  });
});
