/**
 * Automatic Core Web Vitals Collector (Zero Dependency PerformanceObserver)
 */

import { TraceOpsSDK } from '../types';
import { sanitizeUrl } from '../sanitizer';

type MetricRating = 'good' | 'needs-improvement' | 'poor';

function getRating(metric: string, value: number): MetricRating {
  switch (metric) {
    case 'LCP':
      return value <= 2500 ? 'good' : value <= 4000 ? 'needs-improvement' : 'poor';
    case 'CLS':
      return value <= 0.1 ? 'good' : value <= 0.25 ? 'needs-improvement' : 'poor';
    case 'INP':
      return value <= 200 ? 'good' : value <= 500 ? 'needs-improvement' : 'poor';
    case 'FCP':
      return value <= 1800 ? 'good' : value <= 3000 ? 'needs-improvement' : 'poor';
    case 'TTFB':
      return value <= 800 ? 'good' : value <= 1800 ? 'needs-improvement' : 'poor';
    default:
      return 'good';
  }
}

export function setupWebVitalsCollector(sdk: TraceOpsSDK): () => void {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
    return () => {};
  }

  const observers: PerformanceObserver[] = [];
  const reportedMetrics = new Set<string>();

  const reportVital = (name: string, value: number, durationMs?: number) => {
    try {
      const rounded = Math.round(value * 100) / 100;
      const rating = getRating(name, rounded);
      const url = sanitizeUrl(window.location.href);

      sdk.captureSpan({
        name: `web-vital: ${name}`,
        durationMs: Math.max(0.1, durationMs !== undefined ? durationMs : rounded),
        statusCode: rating === 'poor' ? 2 : 1,
        attributes: {
          'vital.name': name,
          'vital.value': rounded,
          'vital.rating': rating,
          'page.url': url,
        },
      });
    } catch {}
  };

  try {
    // 1. TTFB (Time To First Byte) from Navigation Timing
    const checkNavigationTiming = () => {
      const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (navEntries && navEntries.length > 0) {
        const nav = navEntries[0];
        const ttfb = nav.responseStart;
        if (ttfb > 0 && !reportedMetrics.has('TTFB')) {
          reportedMetrics.add('TTFB');
          reportVital('TTFB', ttfb);
        }
      }
    };

    if (document.readyState === 'complete') {
      checkNavigationTiming();
    } else {
      window.addEventListener('load', checkNavigationTiming, { once: true });
    }

    // 2. FCP (First Contentful Paint)
    try {
      const fcpObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (entry.name === 'first-contentful-paint' && !reportedMetrics.has('FCP')) {
            reportedMetrics.add('FCP');
            reportVital('FCP', entry.startTime);
            fcpObserver.disconnect();
            break;
          }
        }
      });
      fcpObserver.observe({ type: 'paint', buffered: true });
      observers.push(fcpObserver);
    } catch {}

    // 3. LCP (Largest Contentful Paint)
    let latestLcpEntry: PerformanceEntry | null = null;
    try {
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        if (entries.length > 0) {
          latestLcpEntry = entries[entries.length - 1];
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      observers.push(lcpObserver);

      const finalizeLcp = () => {
        if (latestLcpEntry && !reportedMetrics.has('LCP')) {
          reportedMetrics.add('LCP');
          reportVital('LCP', latestLcpEntry.startTime);
        }
      };

      // LCP is finalized when user interacts or page changes visibility
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') finalizeLcp();
      });
      window.addEventListener('pagehide', finalizeLcp, { once: true });
    } catch {}

    // 4. CLS (Cumulative Layout Shift)
    let clsValue = 0;
    try {
      const clsObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries() as any[]) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        }
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
      observers.push(clsObserver);

      const finalizeCls = () => {
        if (!reportedMetrics.has('CLS')) {
          reportedMetrics.add('CLS');
          // Map CLS unitless score (e.g. 0.05) to ms duration representation (50ms)
          reportVital('CLS', clsValue, Math.max(1, Math.round(clsValue * 1000)));
        }
      };

      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') finalizeCls();
      });
      window.addEventListener('pagehide', finalizeCls, { once: true });
    } catch {}

    // 5. INP (Interaction to Next Paint) / FID fallback
    let maxInteractionDuration = 0;
    try {
      // Modern INP observer using 'event'
      const inpObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries() as any[]) {
          if (entry.interactionId && entry.duration > maxInteractionDuration) {
            maxInteractionDuration = entry.duration;
          }
        }
      });
      inpObserver.observe({
        type: 'event',
        buffered: true,
        durationThreshold: 16,
      } as any);
      observers.push(inpObserver);

      const finalizeInp = () => {
        if (maxInteractionDuration > 0 && !reportedMetrics.has('INP')) {
          reportedMetrics.add('INP');
          reportVital('INP', maxInteractionDuration);
        }
      };

      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') finalizeInp();
      });
      window.addEventListener('pagehide', finalizeInp, { once: true });
    } catch {
      // Fallback to first-input for older browsers
      try {
        const fidObserver = new PerformanceObserver((entryList) => {
          const entry = entryList.getEntries()[0] as any;
          if (entry && !reportedMetrics.has('INP')) {
            const fid = entry.processingStart - entry.startTime;
            reportedMetrics.add('INP');
            reportVital('INP', fid);
            fidObserver.disconnect();
          }
        });
        fidObserver.observe({ type: 'first-input', buffered: true });
        observers.push(fidObserver);
      } catch {}
    }
  } catch {
    // Graceful fallback if performance APIs fail
  }

  return () => {
    observers.forEach((obs) => {
      try {
        obs.disconnect();
      } catch {}
    });
  };
}

