import { TraceOps } from '@traceops/browser';

const terminal = document.getElementById('terminal');
const statusPill = document.getElementById('sdk-status');
const statusText = document.getElementById('status-text');
const inputKey = document.getElementById('input-key');

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

async function startSDK() {
  try {
    // 1. Fetch server config
    const res = await fetch('/api/config');
    const config = await res.json();

    const storedKey = localStorage.getItem('traceops_demo_key');
    const activeApiKey = storedKey || config.apiKey || 'tops_live_demo_key';
    const activeEndpoint = config.endpoint || 'http://localhost:4000';

    if (inputKey) {
      inputKey.value = activeApiKey;
    }

    // 2. Initialize TraceOps Browser SDK
    TraceOps.init({
      apiKey: activeApiKey,
      endpoint: activeEndpoint,
      serviceName: 'demo-storefront',
      batchSize: 5,
      flushInterval: 2000,
      onError: (err) => {
        logTerminal('error', `SDK Error: ${err.message}`);
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

// Interactive Controls
document.getElementById('btn-span')?.addEventListener('click', () => {
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
});

document.getElementById('btn-log')?.addEventListener('click', () => {
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
  if (inputKey && inputKey.value.trim()) {
    localStorage.setItem('traceops_demo_key', inputKey.value.trim());
    logTerminal('log', 'API Key updated! Re-initializing SDK...');
    startSDK();
  }
});

// Product action helper
window.buyProduct = (name, price) => {
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
};

startSDK();

