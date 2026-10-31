import { TraceOps } from '@traceops/browser';

const terminal = document.getElementById('terminal');
const statusPill = document.getElementById('sdk-status');
const statusText = document.getElementById('status-text');
const inputKey = document.getElementById('input-key');
const inputEndpoint = document.getElementById('input-endpoint');

function logTerminal(type, msg) {
  if (!terminal) return;
  const time = new Date().toLocaleTimeString();
  const row = document.createElement('div');
  row.className = 'log-row';
  row.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-type ${type}">[${type.toUpperCase()}]</span>
    <span class="log-msg">${msg}</span>
  `;
  terminal.appendChild(row);
  terminal.scrollTop = terminal.scrollHeight;
}

let activeEndpoint = 'https://traceops-backend-j7b0.onrender.com';
let activeApiKey = '';

async function startSDK() {
  try {
    // 1. Fetch server config
    const res = await fetch('/api/config');
    const config = await res.json();

    const storedKey = localStorage.getItem('traceops_demo_key');
    const storedEndpoint = localStorage.getItem('traceops_demo_endpoint');

    activeApiKey = storedKey || config.apiKey || 'tops_live_demo_key';
    activeEndpoint = storedEndpoint || config.endpoint || 'https://traceops-backend-j7b0.onrender.com';

    if (inputKey) inputKey.value = activeApiKey;
    if (inputEndpoint) inputEndpoint.value = activeEndpoint;

    // 2. Initialize TraceOps Browser SDK
    TraceOps.init({
      apiKey: activeApiKey,
      endpoint: activeEndpoint,
      serviceName: 'demo-storefront',
      batchSize: 5,
      flushInterval: 2000,
      onError: (err) => {
        logTerminal('error', `SDK Ingestion Failure: ${err.message}`);
        if (statusPill && statusText) {
          statusPill.style.color = '#ef4444';
          statusPill.style.background = 'rgba(239, 68, 68, 0.1)';
          statusPill.style.borderColor = 'rgba(239, 68, 68, 0.3)';
          statusText.textContent = `Delivery Failed (Check Endpoint/Key)`;
        }
      },
    });

    if (statusPill && statusText) {
      statusPill.style.color = '#10b981';
      statusPill.style.background = 'rgba(16, 185, 129, 0.1)';
      statusPill.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      statusText.textContent = `SDK Active (${activeApiKey.slice(0, 14)}...)`;
    }

    logTerminal('log', `TraceOps initialized for "demo-storefront" -> ${activeEndpoint}`);
    logTerminal('span', `Automatic collectors armed: JS Errors, Web Vitals, Page Navigation`);
  } catch (err) {
    logTerminal('error', `Failed to start SDK: ${err.message}`);
  }
}

// Preset helpers
document.getElementById('btn-preset-render')?.addEventListener('click', () => {
  if (inputEndpoint) {
    inputEndpoint.value = 'https://traceops-backend-j7b0.onrender.com';
    logTerminal('log', 'Selected preset: ☁️ Render Production Backend');
  }
});

document.getElementById('btn-preset-local')?.addEventListener('click', () => {
  if (inputEndpoint) {
    inputEndpoint.value = 'http://localhost:4000';
    logTerminal('log', 'Selected preset: 💻 Localhost Backend (port 4000)');
  }
});

// Full web session simulation: sends vitals, pageview, API calls, logs
document.getElementById('btn-session')?.addEventListener('click', async () => {
  logTerminal('log', '⚡ Dispatching full realistic browser session to TraceOps...');

  // 1. Navigation & Page Load
  TraceOps.captureSpan({
    name: 'GET /storefront',
    durationMs: 240,
    statusCode: 1,
    attributes: { 'http.status_code': 200, 'page.title': 'Acme Cloud Store - Catalog' },
  });

  // 2. Core Web Vitals
  TraceOps.captureSpan({
    name: 'web-vital: LCP',
    durationMs: 1200,
    statusCode: 1,
    attributes: { 'vital.name': 'LCP', 'vital.value': 1200, 'vital.rating': 'good' },
  });
  TraceOps.captureSpan({
    name: 'web-vital: INP',
    durationMs: 45,
    statusCode: 1,
    attributes: { 'vital.name': 'INP', 'vital.value': 45, 'vital.rating': 'good' },
  });
  TraceOps.captureSpan({
    name: 'web-vital: CLS',
    durationMs: 1,
    statusCode: 1,
    attributes: { 'vital.name': 'CLS', 'vital.value': 0.015, 'vital.rating': 'good' },
  });

  // 3. API interactions
  TraceOps.captureSpan({
    name: 'GET /api/catalog/products',
    durationMs: 68,
    statusCode: 1,
    attributes: { 'http.status_code': 200, 'catalog.items_count': 12 },
  });
  TraceOps.captureSpan({
    name: 'POST /api/cart/add',
    durationMs: 115,
    statusCode: 1,
    attributes: { 'http.status_code': 200, 'cart.item_id': 'mbp_16', 'cart.currency': 'USD' },
  });

  // 4. Correlated logs
  TraceOps.captureLog({
    message: 'User session started: Anonymous shopper (session_id: sess_9812)',
    severity: 'INFO',
  });
  TraceOps.captureLog({
    message: 'Core Web Vitals evaluated: LCP 1200ms (Good), INP 45ms (Good), CLS 0.015 (Good)',
    severity: 'INFO',
  });
  TraceOps.captureLog({
    message: 'Cart transaction completed for MacBook Pro 16" ($2,499.00)',
    severity: 'INFO',
  });

  await TraceOps.flush();
  logTerminal('log', '✓ Full session dispatched and flushed! Check your TraceOps dashboard.');
});

// Interactive Controls
document.getElementById('btn-span')?.addEventListener('click', async () => {
  const dur = Math.floor(Math.random() * 60) + 20;
  TraceOps.captureSpan({
    name: 'POST /api/cart/add',
    durationMs: dur,
    statusCode: 1,
    attributes: {
      'cart.item_id': 'prod_987',
      'cart.currency': 'USD',
      'http.status': 200,
    },
  });
  logTerminal('span', `Captured span "POST /api/cart/add" (${dur}ms, status: 200)`);
  await TraceOps.flush();
  logTerminal('log', '✓ Flushed span to backend.');
});

document.getElementById('btn-log')?.addEventListener('click', async () => {
  const msg = `User added item to shopping cart (session: sess_${Math.floor(Math.random() * 9000 + 1000)})`;
  TraceOps.captureLog({
    message: msg,
    severity: 'INFO',
    attributes: {
      action: 'cart_update',
      component: 'storefront_ui',
    },
  });
  logTerminal('log', `Captured log: "${msg}"`);
  await TraceOps.flush();
  logTerminal('log', '✓ Flushed log to backend.');
});

document.getElementById('btn-err')?.addEventListener('click', () => {
  logTerminal('error', 'Triggering deliberate runtime TypeError...');
  setTimeout(() => {
    // Deliberate runtime uncaught error
    throw new TypeError("Cannot read properties of undefined (reading 'calculateTax')");
  }, 10);
});

document.getElementById('btn-rejection')?.addEventListener('click', () => {
  logTerminal('error', 'Triggering deliberate unhandled Promise rejection...');
  setTimeout(() => {
    Promise.reject(new Error('PaymentGatewayTimeout: Stripe auth timed out after 5000ms'));
  }, 10);
});

document.getElementById('btn-nav')?.addEventListener('click', () => {
  const path = `/catalog/category-${Math.floor(Math.random() * 5 + 1)}`;
  history.pushState({}, '', path);
  logTerminal('span', `Navigated to route "${path}" (captured page transition span)`);
});

document.getElementById('btn-flush')?.addEventListener('click', async () => {
  logTerminal('log', 'Flushing pending telemetry queue to TraceOps backend...');
  await TraceOps.flush();
  logTerminal('log', '✓ Queue flushed.');
});

document.getElementById('btn-clear-log')?.addEventListener('click', () => {
  if (terminal) terminal.innerHTML = '';
});

document.getElementById('btn-save-key')?.addEventListener('click', () => {
  const newKey = inputKey?.value?.trim();
  const newEp = inputEndpoint?.value?.trim();

  if (newKey) localStorage.setItem('traceops_demo_key', newKey);
  if (newEp) localStorage.setItem('traceops_demo_endpoint', newEp);

  logTerminal('log', 'Settings updated! Re-initializing SDK...');
  startSDK();
});

// Product action helper
window.buyProduct = async (name, price) => {
  const dur = Math.floor(Math.random() * 80) + 30;
  TraceOps.captureSpan({
    name: `purchase: ${name}`,
    durationMs: dur,
    statusCode: 1,
    attributes: {
      'product.name': name,
      'product.price': price,
    },
  });
  TraceOps.captureLog({
    message: `Cart checkout initiated for ${name} ($${price})`,
    severity: 'INFO',
  });
  logTerminal('span', `Purchased "${name}" ($${price}) -> Captured span & log`);
  await TraceOps.flush();
  logTerminal('log', '✓ Flushed purchase telemetry to backend.');
};

startSDK();

