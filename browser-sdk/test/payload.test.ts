import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Transport, InternalSpan, InternalLog } from '../src/transport';

describe('Payload Formatting', () => {
  it('formats span payload strictly matching OTLP /v1/traces ingestion', async () => {
    let capturedUrl = '';
    let capturedHeaders: any = null;
    let capturedBody: any = null;

    // Mock global fetch
    const originalFetch = global.fetch;
    global.fetch = async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedHeaders = init.headers;
      capturedBody = JSON.parse(init.body);
      return {
        status: 202,
        ok: true,
      } as any;
    };

    try {
      const transport = new Transport({
        apiKey: 'tops_live_testkey123',
        endpoint: 'http://localhost:4000',
        serviceName: 'my-web-app',
        maxRetries: 1,
        initialRetryDelayMs: 10,
      });

      const span: InternalSpan = {
        traceId: '0123456789abcdef0123456789abcdef',
        spanId: '0123456789abcdef',
        parentSpanId: null,
        name: 'GET /dashboard',
        durationMs: 45.5,
        startTimeUnixNano: '1730000000000000000',
        endTimeUnixNano: '1730000000045500000',
        statusCode: 1,
        attributes: { 'http.status': 200, environment: 'production' },
      };

      const success = await transport.sendSpans([span]);
      assert.strictEqual(success, true);
      assert.strictEqual(capturedUrl, 'http://localhost:4000/v1/traces');
      assert.strictEqual(capturedHeaders['x-traceops-key'], 'tops_live_testkey123');
      assert.strictEqual(capturedHeaders['Content-Type'], 'application/json');

      // Verify OTLP ResourceSpans
      assert.ok(capturedBody.resourceSpans, 'resourceSpans must exist');
      assert.strictEqual(capturedBody.resourceSpans.length, 1);

      const res = capturedBody.resourceSpans[0].resource;
      const serviceAttr = res.attributes.find((a: any) => a.key === 'service.name');
      assert.strictEqual(serviceAttr.value.stringValue, 'my-web-app');

      const langAttr = res.attributes.find((a: any) => a.key === 'telemetry.sdk.language');
      assert.strictEqual(langAttr.value.stringValue, 'javascript');

      // Verify Spans
      const scopeSpans = capturedBody.resourceSpans[0].scopeSpans;
      assert.strictEqual(scopeSpans.length, 1);
      const spans = scopeSpans[0].spans;
      assert.strictEqual(spans.length, 1);

      const firstSpan = spans[0];
      assert.strictEqual(firstSpan.traceId, '0123456789abcdef0123456789abcdef');
      assert.strictEqual(firstSpan.spanId, '0123456789abcdef');
      assert.strictEqual(firstSpan.name, 'GET /dashboard');
      assert.strictEqual(firstSpan.durationMs, 45.5);
      assert.strictEqual(firstSpan.startTimeUnixNano, '1730000000000000000');
      assert.strictEqual(firstSpan.endTimeUnixNano, '1730000000045500000');
      assert.strictEqual(firstSpan.status.code, 1);
      assert.strictEqual(firstSpan.attributes['http.status'], 200);
      assert.strictEqual(firstSpan.attributes['environment'], 'production');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('formats log payload strictly matching OTLP /v1/logs ingestion', async () => {
    let capturedUrl = '';
    let capturedHeaders: any = null;
    let capturedBody: any = null;

    const originalFetch = global.fetch;
    global.fetch = async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedHeaders = init.headers;
      capturedBody = JSON.parse(init.body);
      return {
        status: 202,
        ok: true,
      } as any;
    };

    try {
      const transport = new Transport({
        apiKey: 'tops_live_testkey123',
        endpoint: 'http://localhost:4000',
        serviceName: 'my-web-app',
        maxRetries: 1,
        initialRetryDelayMs: 10,
      });

      const log: InternalLog = {
        traceId: '0123456789abcdef0123456789abcdef',
        spanId: '0123456789abcdef',
        severity: 'ERROR',
        body: 'Uncaught TypeError: Cannot read properties of undefined',
        timeUnixNano: '1730000000000000000',
      };

      const success = await transport.sendLogs([log]);
      assert.strictEqual(success, true);
      assert.strictEqual(capturedUrl, 'http://localhost:4000/v1/logs');
      assert.strictEqual(capturedHeaders['x-traceops-key'], 'tops_live_testkey123');

      // Verify OTLP ResourceLogs
      assert.ok(capturedBody.resourceLogs, 'resourceLogs must exist');
      const res = capturedBody.resourceLogs[0].resource;
      const serviceAttr = res.attributes.find((a: any) => a.key === 'service.name');
      assert.strictEqual(serviceAttr.value.stringValue, 'my-web-app');

      const scopeLogs = capturedBody.resourceLogs[0].scopeLogs;
      const logRecords = scopeLogs[0].logRecords;
      assert.strictEqual(logRecords.length, 1);

      const record = logRecords[0];
      assert.strictEqual(record.traceId, '0123456789abcdef0123456789abcdef');
      assert.strictEqual(record.spanId, '0123456789abcdef');
      assert.strictEqual(record.severityText, 'ERROR');
      assert.strictEqual(
        record.body.stringValue,
        'Uncaught TypeError: Cannot read properties of undefined',
      );
      assert.strictEqual(record.timeUnixNano, '1730000000000000000');
    } finally {
      global.fetch = originalFetch;
    }
  });
});

