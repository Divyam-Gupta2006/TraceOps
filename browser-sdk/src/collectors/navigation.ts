/**
 * Automatic Navigation & Page Performance Collector
 */

import { TraceOpsSDK } from '../types';
import { sanitizeUrl } from '../sanitizer';

export function setupNavigationCollector(sdk: TraceOpsSDK): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  let reportedInitialLoad = false;

  const recordPageLoad = () => {
    if (reportedInitialLoad) return;
    reportedInitialLoad = true;

    try {
      const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      let durationMs = 100;
      const attributes: Record<string, any> = {
        'page.url': sanitizeUrl(window.location.href),
        'page.pathname': window.location.pathname || '/',
        'page.title': document.title || '',
        'device.screen': `${window.screen?.width || 0}x${window.screen?.height || 0}`,
        'browser.language': navigator.language || 'en',
      };

      if (navEntries && navEntries.length > 0) {
        const nav = navEntries[0];
        const loadEnd = nav.loadEventEnd || nav.domContentLoadedEventEnd || nav.responseEnd;
        durationMs = Math.max(1, Math.round(loadEnd - nav.startTime));

        attributes['timing.dns_ms'] = Math.max(0, Math.round(nav.domainLookupEnd - nav.domainLookupStart));
        attributes['timing.tcp_ms'] = Math.max(0, Math.round(nav.connectEnd - nav.connectStart));
        attributes['timing.ttfb_ms'] = Math.max(0, Math.round(nav.responseStart - nav.requestStart));
        attributes['timing.dom_ready_ms'] = Math.max(0, Math.round(nav.domContentLoadedEventEnd - nav.startTime));
        attributes['timing.load_ms'] = durationMs;
      }

      sdk.captureSpan({
        name: `page-load: ${window.location.pathname || '/'}`,
        durationMs,
        statusCode: 1,
        attributes,
      });
    } catch {}
  };

  if (document.readyState === 'complete') {
    // Delay slightly to let navigation timing properties finalize
    setTimeout(recordPageLoad, 50);
  } else {
    window.addEventListener('load', () => setTimeout(recordPageLoad, 50), { once: true });
  }

  // SPA Route Transition Tracking (pushState, replaceState, popstate)
  let lastPathname = window.location.pathname;

  const handleRouteTransition = (newPathname: string) => {
    if (newPathname === lastPathname) return;
    const startMs = Date.now();
    lastPathname = newPathname;

    // Use requestAnimationFrame to measure duration until DOM renders
    requestAnimationFrame(() => {
      const dur = Math.max(1, Date.now() - startMs);
      sdk.captureSpan({
        name: `route-change: ${newPathname}`,
        durationMs: dur,
        statusCode: 1,
        attributes: {
          'page.pathname': newPathname,
          'page.url': sanitizeUrl(window.location.href),
          'page.title': document.title || '',
        },
      });
    });
  };

  const popstateListener = () => {
    handleRouteTransition(window.location.pathname);
  };
  window.addEventListener('popstate', popstateListener);

  // Monkey-patch pushState and replaceState safely
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (data: any, unused: string, url?: string | URL | null) {
    originalPushState.call(this, data, unused, url);
    handleRouteTransition(window.location.pathname);
  };

  history.replaceState = function (data: any, unused: string, url?: string | URL | null) {
    originalReplaceState.call(this, data, unused, url);
    handleRouteTransition(window.location.pathname);
  };

  return () => {
    try {
      window.removeEventListener('popstate', popstateListener);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    } catch {}
  };
}
