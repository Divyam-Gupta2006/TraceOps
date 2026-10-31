# TraceOps — AI-Powered Distributed Observability & Root-Cause Analysis Platform

TraceOps is a high-density, real-time observability and AI incident response platform built for modern engineering teams. It ingests distributed traces and logs from standard OpenTelemetry SDKs, auto-discovers service topology, detects latency and error anomalies, and leverages Groq AI models to perform deterministic root-cause diagnosis.

---

## Features

- **Standard OTLP/HTTP Ingestion**: Native endpoints for `/v1/traces` and `/v1/logs` supporting Node.js, Next.js, Python, Go, and frontend websites.
- **AI Root-Cause Diagnosis (Groq)**: Correlates distributed call chains and error signatures to formulate high-confidence incident hypotheses and actionable fix recommendations.
- **Distributed Trace Waterfall**: Dual-pane trace explorer with span-level timing breakdown, HTTP status codes, parent-child hierarchies, and metadata inspection.
- **Service Topology Mapping**: Auto-generated directed call graph of your microservices architecture rendered in real time.
- **High-Density Dark / Light Console**: Thoughtfully organized UI following strict observability design principles, complete with a 1-click Dark/Light mode toggle.
- **Multi-Project Isolation**: Separate API ingestion keys and dashboards per application.

---

## Quick Start

### 1. Prerequisites
- [Docker](https://www.docker.com/) (for PostgreSQL and Redis)
- [Node.js](https://nodejs.org/) (v18+)

### 2. Start PostgreSQL & Redis
```bash
docker compose up -d
```

### 3. Start Backend Service
```bash
cd backend
npm install
npm run build
npm run start
```
*The backend and OTLP ingestion gateway will be running at `http://localhost:4000`.*

### 4. Start Frontend Dashboard
```bash
cd frontend
npm install
npm run dev
```
*The frontend dashboard will be running at `http://localhost:3000`.*

---

## Connecting Your Applications

For full step-by-step instructions, see the dedicated [**Application Connection Guide (CONNECT_GUIDE.md)**](./CONNECT_GUIDE.md).

### Quick Summary

#### 1. Obtain Your Ingestion Key
Open `http://localhost:3000`, choose your project, and navigate to the **Connect SDK** tab to copy your project-specific API key (`tops_live_...`).

#### 2. Local vs. Deployed Apps
- **Local apps**: Point to `http://localhost:4000`.
- **Cloud-deployed apps (Vercel, AWS, Render)**: Expose your local backend via a tunnel:
  ```bash
  npx ngrok http 4000
  ```
  and point your app's OTLP endpoint to the generated HTTPS ngrok URL.

#### 3. Standard Environment Variables
```env
OTEL_SERVICE_NAME="my-production-app"
OTEL_EXPORTER_OTLP_PROTOCOL="http/json"
OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4000"
OTEL_EXPORTER_OTLP_HEADERS="x-traceops-key=YOUR_PROJECT_API_KEY"
```

#### 4. Frontend Websites (Zero Dependencies)
Drop this snippet directly into your web app:
```javascript
const TRACEOPS_URL = 'http://localhost:4000'; // Or your public tunnel URL
const TRACEOPS_KEY = 'YOUR_PROJECT_API_KEY';

function sendTrace(operation, durationMs = 50, isError = false) {
  fetch(`${TRACEOPS_URL}/v1/traces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-traceops-key': TRACEOPS_KEY },
    body: JSON.stringify({
      serviceName: 'my-website',
      operationName: operation,
      durationMs,
      statusCode: isError ? 2 : 1,
    }),
  }).catch(() => {});
}

// Auto-track pageview and errors
sendTrace('pageview: ' + window.location.pathname);
window.addEventListener('error', (e) => sendTrace('error: ' + e.message, 100, true));
```

---

## Architecture Overview

```
[External User Apps / Websites]
               │
               ▼ (OTLP / HTTP JSON + API Key)
   [TraceOps Backend (NestJS)] :4000
        ├── PostgreSQL (Prisma ORM)
        ├── Redis (Rolling metrics cache)
        ├── WebSocket Gateway (Real-time live updates)
        └── AI RCA Engine (Groq API: openai/gpt-oss-120b)
               │
               ▼ (REST API & WebSockets)
   [TraceOps Frontend (Next.js 14)] :3000
        ├── Overview & Microservices Inventory
        ├── Performance (P50/P90/P95/P99 latency)
        ├── Error Signatures & Faults
        ├── Trace Waterfall Explorer
        ├── Real-time Log Stream
        ├── Architecture Topology Map (ReactFlow + Dagre)
        └── Dark / Light Mode Theme Engine
```

---

## License
MIT License.

