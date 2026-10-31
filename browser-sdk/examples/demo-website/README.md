# TraceOps Demo Storefront Website

A standalone demonstration website showcasing real-world integration of `@traceops/browser` with automatic error monitoring, Core Web Vitals collection, and distributed tracing.

## Quick Start

1. **Install Dependencies** (from this folder):
   ```bash
   npm install
   ```

2. **Configure Environment**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Set `TRACEOPS_API_KEY` to your project's API key (obtained from the TraceOps dashboard).
   If running TraceOps locally, `TRACEOPS_ENDPOINT` defaults to `http://localhost:4000`.

3. **Start the Demo Website**:
   ```bash
   npm start
   ```
   Open your browser to [http://localhost:5050](http://localhost:5050).

## What This Demo Showcases

- **Zero-Config Browser Observability**: Initialized with just `TraceOps.init({ apiKey, endpoint })`.
- **Automatic JS Error Tracking**: Captures runtime errors and unhandled promise rejections without crashing the host app.
- **Automatic Core Web Vitals**: Real User Monitoring (LCP, CLS, INP, FCP, TTFB) using standard browser `PerformanceObserver`.
- **Automatic Page & Route Tracking**: Captures initial page load metrics and SPA client-side route changes (`pushState` / `popstate`).
- **Interactive Control Panel**: Trigger test spans, logs, errors, and rejections and see them appear live in your TraceOps dashboard.

