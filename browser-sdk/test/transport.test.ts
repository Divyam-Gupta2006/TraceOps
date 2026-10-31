import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Transport } from '../src/transport';

describe('Transport & Retry Behaviour', () => {
  it('retries on transient 500 server error and succeeds when server recovers', async () => {
    let callCount = 0;
    const originalFetch = global.fetch;

    global.fetch = async () => {
      callCount++;
      if (callCount < 3) {
        return { status: 503, ok: false } as any;
      }
      return { status: 202, ok: true } as any;
    };

    try {
      const transport = new Transport({
        apiKey: 'tops_live_validkey',
        endpoint: 'http://localhost:4000',
        serviceName: 'test',
        maxRetries: 3,
        initialRetryDelayMs: 10,
      });

      const success = await transport.sendSpans([
        {
          traceId: '123',
          spanId: '456',
          parentSpanId: null,
          name: 'test-span',
          durationMs: 10,
          startTimeUnixNano: '1000',
          endTimeUnixNano: '2000',
          statusCode: 1,
          attributes: {},
        },
      ]);

      assert.strictEqual(success, true);
      assert.strictEqual(callCount, 3);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('retries on network fetch rejection up to maxRetries', async () => {
    let callCount = 0;
    let reportedError: Error | null = null;
    const originalFetch = global.fetch;

    global.fetch = async () => {
      callCount++;
      throw new Error('Failed to fetch (offline)');
    };

    try {
      const transport = new Transport({
        apiKey: 'tops_live_validkey',
        endpoint: 'http://localhost:4000',
        serviceName: 'test',
        maxRetries: 2,
        initialRetryDelayMs: 10,
        onError: (err) => {
          reportedError = err;
        },
      });

      const success = await transport.sendLogs([
        {
          traceId: null,
          spanId: null,
          severity: 'INFO',
          body: 'log line',
          timeUnixNano: '1000',
        },
      ]);

      assert.strictEqual(success, false);
      // 1 initial attempt + 2 retries = 3 calls
      assert.strictEqual(callCount, 3);
      assert(reportedError);
      const err = reportedError as Error;
      assert.ok(err.message.includes('after 2 retries'));
      // Verify API key is NOT logged in the error message
      assert.strictEqual(err.message.includes('tops_live_validkey'), false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('does NOT retry 401 Unauthorized or 403 Forbidden responses indefinitely', async () => {
    let callCount = 0;
    let reportedError: Error | null = null;
    const originalFetch = global.fetch;

    global.fetch = async () => {
      callCount++;
      return { status: 401, ok: false } as any;
    };

    try {
      const transport = new Transport({
        apiKey: 'tops_live_invalidkey',
        endpoint: 'http://localhost:4000',
        serviceName: 'test',
        maxRetries: 5, // Even with 5 retries configured
        initialRetryDelayMs: 10,
        onError: (err) => {
          reportedError = err;
        },
      });

      const success = await transport.sendSpans([
        {
          traceId: '123',
          spanId: '456',
          parentSpanId: null,
          name: 'auth-test',
          durationMs: 10,
          startTimeUnixNano: '1000',
          endTimeUnixNano: '2000',
          statusCode: 1,
          attributes: {},
        },
      ]);

      assert.strictEqual(success, false);
      // Must halt immediately on 401! Only 1 attempt
      assert.strictEqual(callCount, 1);
      assert(reportedError);
      const err = reportedError as Error;
      assert.ok(err.message.includes('HTTP 401'));
      // Verify API key is NOT leaked in the error
      assert.strictEqual(err.message.includes('tops_live_invalidkey'), false);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
