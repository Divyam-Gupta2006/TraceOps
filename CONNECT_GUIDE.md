# Step-by-Step Guide: Connecting Your Application to TraceOps

TraceOps is an OpenTelemetry-compatible observability and AI Root-Cause Analysis platform. Any service or website that sends standard OpenTelemetry (OTLP/HTTP) traces or JSON telemetry can be monitored.

---

## Table of Contents
1. [Core Concepts & Ingestion Credentials](#1-core-concepts--ingestion-credentials)
2. [Local vs. Cloud-Deployed Applications (Important!)](#2-local-vs-cloud-deployed-applications-important)
3. [Connecting a Next.js Application (App & Pages Router)](#3-connecting-a-nextjs-application-app--pages-router)
4. [Connecting a Node.js Backend (Express / NestJS / Fastify)](#4-connecting-a-nodejs-backend-express--nestjs--fastify)
5. [Connecting a Client-Side Website (React, Vue, Plain HTML/JS)](#5-connecting-a-client-side-website-react-vue-plain-htmljs)
6. [Connecting a Python Backend (FastAPI / Flask / Django)](#6-connecting-a-python-backend-fastapi--flask--django)
7. [Connecting Any Other Language (Go, Java, Generic HTTP)](#7-connecting-any-other-language-go-java-generic-http)
8. [Verifying Your Connection](#8-verifying-your-connection)

---

## 1. Core Concepts & Ingestion Credentials

Every project in TraceOps has an **Ingestion API Key** (formatted as `tops_live_...`).

- **Trace Ingestion Endpoint**: `POST /v1/traces` (aliases: `/api/v1/traces`, `/api/traces`)
- **Log Ingestion Endpoint**: `POST /v1/logs` (aliases: `/api/v1/logs`, `/api/logs`)
- **Authentication**: Pass the key in any of the following ways:
  - Header: `x-traceops-key: <YOUR_API_KEY>`
  - Header: `Authorization: Bearer <YOUR_API_KEY>`
  - Header: `x-api-key: <YOUR_API_KEY>`
  - Query parameter: `?apiKey=<YOUR_API_KEY>`

---

## 2. Local vs. Cloud-Deployed Applications (Important!)

Before configuring your app, determine where your application is running:

### A. Your App is Running Locally on the Same Machine
If your app is running on `localhost`:
- Set your endpoint to: `http://localhost:4000`

### B. Your App is Deployed to the Cloud (Vercel, AWS, Render, Railway, Fly.io, etc.)
> ⚠️ **Common Pitfall**: If you deploy your app to Vercel or AWS and set the endpoint to `http://localhost:4000`, the cloud server will try to reach port 4000 on *itself*, which will fail with `ECONNREFUSED`.

To connect a cloud-deployed app to a local TraceOps instance:
1. Expose your local backend using a tunnel:
   ```bash
   npx ngrok http 4000
   # or
   npx localtunnel --port 4000
   ```
2. Copy the public HTTPS URL (e.g., `https://abcdef.ngrok-free.app`).
3. Set your deployed app's endpoint to that public URL.

*(If TraceOps is deployed to a server/VPS, simply use its domain, e.g., `https://traceops.yourdomain.com`.)*

---

## 3. Connecting a Next.js Application (App & Pages Router)

Next.js has native OpenTelemetry support through `@vercel/otel`.

### Step 1: Install `@vercel/otel`
```bash
npm install @vercel/otel
```

### Step 2: Create `instrumentation.ts`
Create an `instrumentation.ts` (or `instrumentation.js`) file in your project root or `src/` directory:

```typescript
// instrumentation.ts
import { registerOTel } from '@vercel/otel';

export function register() {
  registerOTel({ serviceName: 'my-nextjs-app' });
}
```

### Step 3: Add Environment Variables
Add the following to your `.env.local` or deployment environment variables (e.g. Vercel Project Settings):

```env
OTEL_SERVICE_NAME="my-nextjs-app"
OTEL_EXPORTER_OTLP_PROTOCOL="http/json"
OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4000"
OTEL_EXPORTER_OTLP_HEADERS="x-traceops-key=YOUR_TRACEOPS_API_KEY"
```
*(Replace `http://localhost:4000` with your public ngrok/domain URL if deployed).*

---

## 4. Connecting a Node.js Backend (Express / NestJS / Fastify)

You can auto-instrument any Node.js service without touching application code.

### Step 1: Install OpenTelemetry Auto-Instrumentation
```bash
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
```

### Step 2: Configure Environment Variables
```env
OTEL_SERVICE_NAME="my-express-api"
OTEL_EXPORTER_OTLP_PROTOCOL="http/json"
OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4000"
OTEL_EXPORTER_OTLP_HEADERS="x-traceops-key=YOUR_TRACEOPS_API_KEY"
```

### Step 3: Run with the Pre-load Hook
Run your application with the `--require` flag:
```bash
node --require @opentelemetry/auto-instrumentations-node/register server.js
```
All incoming HTTP requests, database queries, and downstream fetches are automatically traced and reported to TraceOps.

---

## 5. Connecting a Client-Side Website (React, Vue, Plain HTML/JS)

If you have a frontend website and want to capture pageviews, user interactions, and unhandled errors without installing heavy libraries:

### Drop-In Snippet (Zero Dependencies)
Paste this into your `<head>` or main app component (`App.tsx`, `layout.tsx`, or `index.html`):

```html
<script>
(function() {
  const TRACEOPS_URL = 'http://localhost:4000'; // Or your deployed public URL
  const TRACEOPS_KEY = 'YOUR_TRACEOPS_API_KEY';
  const SERVICE_NAME = 'marketing-site';

  function sendTelemetry(operationName, durationMs = 50, isError = false, attributes = {}) {
    fetch(`${TRACEOPS_URL}/v1/traces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-traceops-key': TRACEOPS_KEY,
      },
      body: JSON.stringify({
        serviceName: SERVICE_NAME,
        operationName: operationName,
        durationMs: durationMs,
        statusCode: isError ? 2 : 1, // 2 = Error, 1 = OK
        attributes: {
          url: window.location.href,
          userAgent: navigator.userAgent,
          ...attributes,
        },
      }),
    }).catch(function() {});
  }

  // Record initial pageview
  sendTelemetry('pageview: ' + window.location.pathname, 80);

  // Auto-capture uncaught exceptions
  window.addEventListener('error', function(event) {
    sendTelemetry('client_error: ' + event.message, 100, true, {
      filename: event.filename,
      lineno: event.lineno,
    });
  });

  // Expose globally for manual tracking
  window.traceops = { track: sendTelemetry };
})();
</script>
```

---

## 6. Connecting a Python Backend (FastAPI / Flask / Django)

### Step 1: Install OpenTelemetry Packages
```bash
pip install opentelemetry-distro opentelemetry-exporter-otlp-proto-http
opentelemetry-bootstrap -a install
```

### Step 2: Set Environment Variables
```bash
export OTEL_SERVICE_NAME="python-api"
export OTEL_EXPORTER_OTLP_PROTOCOL="http/json"
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4000"
export OTEL_EXPORTER_OTLP_HEADERS="x-traceops-key=YOUR_TRACEOPS_API_KEY"
```

### Step 3: Run with Automatic Instrumentation
```bash
opentelemetry-instrument uvicorn main:app --port 8000
# or for Flask:
opentelemetry-instrument python app.py
```

---

## 7. Connecting Any Other Language (Go, Java, Generic HTTP)

TraceOps accepts both full standard OTLP JSON and simplified JSON payloads.

### Simple JSON HTTP Schema
Send a `POST` request to `http://localhost:4000/v1/traces` with header `x-traceops-key`:

```json
{
  "serviceName": "auth-service",
  "operationName": "POST /api/v1/login",
  "durationMs": 142.5,
  "statusCode": 1,
  "attributes": {
    "http.method": "POST",
    "http.status_code": 200
  }
}
```

Or send a batch of spans:
```json
{
  "spans": [
    {
      "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
      "spanId": "00f067aa0ba902b7",
      "serviceName": "api-gateway",
      "operationName": "GET /users",
      "durationMs": 220,
      "statusCode": 1
    },
    {
      "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
      "spanId": "5fb397be34d23b0f",
      "parentSpanId": "00f067aa0ba902b7",
      "serviceName": "user-database",
      "operationName": "SELECT * FROM users",
      "durationMs": 180,
      "statusCode": 1
    }
  ]
}
```

---

## 8. Verifying Your Connection

### Method 1: Using the UI "Send Test Ping" Button
1. Open the TraceOps dashboard at `http://localhost:3000`.
2. Select your project from the top dropdown.
3. Switch to the **Connect SDK** tab.
4. Click **Send Test Ping**. A real span will immediately be delivered and registered on your project.

### Method 2: Testing via cURL
Run this command in your terminal (replace `YOUR_API_KEY`):

```bash
curl -X POST http://localhost:4000/v1/traces \
  -H "Content-Type: application/json" \
  -H "x-traceops-key: YOUR_API_KEY" \
  -d '{"serviceName": "curl-test", "operationName": "test-ping", "durationMs": 50, "statusCode": 1}'
```

You should receive an HTTP 202 response:
```json
{"acceptedSpans":1}
```

Open the **Overview** or **Traces** tab in the dashboard to inspect your telemetry in real time!

