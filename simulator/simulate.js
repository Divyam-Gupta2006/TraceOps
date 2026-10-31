// Usage:
//   node simulator/simulate.js <YOUR_TRACEOPS_API_KEY> normal
//   node simulator/simulate.js <YOUR_TRACEOPS_API_KEY> incident

const crypto = require('crypto');

const apiKey = process.argv[2];
const mode = process.argv[3] || 'incident';
const endpoint = process.env.TRACEOPS_URL || 'http://localhost:4000';

if (!apiKey) {
  console.error('Usage: node simulator/simulate.js <x-traceops-key> [normal|incident]');
  process.exit(1);
}

async function sendTelemetry() {
  const isIncident = mode === 'incident';
  const traceId = crypto.randomBytes(16).toString('hex');
  const orderSpanId = crypto.randomBytes(8).toString('hex');
  const paymentSpanId = crypto.randomBytes(8).toString('hex');
  const nowNs = BigInt(Date.now()) * 1_000_000n;
  const paymentLatencyMs = isIncident ? 8200 : 160;

  const tracePayload = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'order-service' } },
            { key: 'telemetry.sdk.language', value: { stringValue: 'nodejs' } },
          ],
        },
        scopeSpans: [
          {
            spans: [
              {
                traceId,
                spanId: orderSpanId,
                name: 'POST /checkout/place-order',
                startTimeUnixNano: String(nowNs),
                endTimeUnixNano: String(nowNs + BigInt((paymentLatencyMs + 90) * 1_000_000)),
                status: { code: isIncident ? 2 : 1 },
              },
            ],
          },
        ],
      },
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'payment-service' } },
            { key: 'telemetry.sdk.language', value: { stringValue: 'python' } },
          ],
        },
        scopeSpans: [
          {
            spans: [
              {
                traceId,
                spanId: paymentSpanId,
                parentSpanId: orderSpanId,
                name: 'POST /payments/authorize',
                startTimeUnixNano: String(nowNs + 20_000_000n),
                endTimeUnixNano: String(nowNs + BigInt(paymentLatencyMs * 1_000_000)),
                status: { code: isIncident ? 2 : 1 },
              },
            ],
          },
        ],
      },
    ],
  };

  const traceRes = await fetch(`${endpoint}/v1/traces`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-traceops-key': apiKey,
    },
    body: JSON.stringify(tracePayload),
  });

  console.log(`Sent OTLP Trace (${mode}) -> HTTP ${traceRes.status}`);

  if (isIncident) {
    await fetch(`${endpoint}/v1/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-traceops-key': apiKey,
      },
      body: JSON.stringify({
        resourceLogs: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'payment-service' } }],
            },
            scopeLogs: [
              {
                logRecords: [
                  {
                    traceId,
                    spanId: paymentSpanId,
                    severityText: 'ERROR',
                    body: {
                      stringValue:
                        'FATAL: Database connection pool exhausted (active=100/100). Query timeout after 8200ms.',
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
    });
    console.log('Sent correlated OTLP Error Logs -> HTTP 202');
  }
}

(async () => {
  for (let i = 0; i < 4; i++) {
    await sendTelemetry();
  }
})();