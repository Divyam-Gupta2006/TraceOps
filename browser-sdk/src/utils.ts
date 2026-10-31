/**
 * Utility functions for TraceOps Browser SDK
 */

/**
 * Generates random hexadecimal string of specified byte length.
 */
export function generateRandomHex(byteLength: number): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(byteLength);
      crypto.getRandomValues(bytes);
      let hex = '';
      for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, '0');
      }
      return hex;
    }
  } catch {
    // Fall back to pseudo-random if crypto fails
  }

  let hex = '';
  for (let i = 0; i < byteLength * 2; i++) {
    hex += Math.floor(Math.random() * 16).toString(16);
  }
  return hex;
}

/**
 * Generates a 32-character hex traceId (16 bytes)
 */
export function generateTraceId(): string {
  return generateRandomHex(16);
}

/**
 * Generates a 16-character hex spanId (8 bytes)
 */
export function generateSpanId(): string {
  return generateRandomHex(8);
}

/**
 * Converts a Date or epoch milliseconds timestamp to nanoseconds string.
 */
export function toNanoString(time?: Date | number): string {
  let ms: number;
  if (time instanceof Date) {
    ms = time.getTime();
  } else if (typeof time === 'number' && !isNaN(time)) {
    ms = time;
  } else {
    ms = Date.now();
  }
  return String(BigInt(Math.round(ms)) * 1_000_000n);
}

/**
 * Normalizes status code to OpenTelemetry span status: 1 = OK, 2 = ERROR.
 */
export function normalizeStatusCode(code?: number): number {
  if (code === undefined || code === null) return 1;
  if (code === 2 || code >= 400) return 2;
  return 1;
}

/**
 * Promise-based delay helper.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

