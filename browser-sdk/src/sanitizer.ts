/**
 * Security and Attribute Sanitizer for TraceOps Browser SDK
 */

const SENSITIVE_KEY_PATTERN =
  /(password|passwd|pwd|token|secret|auth|authorization|cookie|api[_-]?key|traceops[_-]?key|credential|bearer|session|credit_card|cvv|ssn)/i;

const FORM_VALUE_PATTERN =
  /(form_data|formData|formValues|input_value|inputVal|user_input)/i;

const MAX_STRING_LENGTH = 2048;
const MAX_ATTRIBUTES_COUNT = 50;
const MAX_DEPTH = 3;

/**
 * Checks if a key matches any sensitive or dangerous pattern.
 */
export function isSensitiveKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  return SENSITIVE_KEY_PATTERN.test(key) || FORM_VALUE_PATTERN.test(key);
}

/**
 * Sanitizes a single primitive or structured value.
 */
function sanitizeValue(val: any, depth: number, visited: WeakSet<object>): any {
  if (val === null || val === undefined) {
    return val;
  }

  const type = typeof val;

  if (type === 'string') {
    if (val.length > MAX_STRING_LENGTH) {
      return val.slice(0, MAX_STRING_LENGTH) + '...[truncated]';
    }
    return val;
  }

  if (type === 'number' || type === 'boolean') {
    return val;
  }

  if (type === 'function' || type === 'symbol') {
    return undefined;
  }

  if (type === 'object') {
    if (depth >= MAX_DEPTH) {
      return '[Object]';
    }

    if (visited.has(val)) {
      return '[Circular]';
    }
    visited.add(val);

    if (Array.isArray(val)) {
      const sanitizedArray: any[] = [];
      const len = Math.min(val.length, 50);
      for (let i = 0; i < len; i++) {
        sanitizedArray.push(sanitizeValue(val[i], depth + 1, visited));
      }
      return sanitizedArray;
    }

    if (val instanceof Date) {
      return val.toISOString();
    }

    if (val instanceof Error) {
      return {
        name: val.name,
        message: sanitizeValue(val.message, depth + 1, visited),
        stack: sanitizeValue(val.stack, depth + 1, visited),
      };
    }

    const out: Record<string, any> = {};
    let count = 0;
    for (const [k, v] of Object.entries(val)) {
      if (count >= MAX_ATTRIBUTES_COUNT) {
        out['_truncated'] = true;
        break;
      }
      if (isSensitiveKey(k)) {
        out[k] = '[REDACTED]';
      } else {
        const sanitizedChild = sanitizeValue(v, depth + 1, visited);
        if (sanitizedChild !== undefined) {
          out[k] = sanitizedChild;
        }
      }
      count++;
    }
    return out;
  }

  return String(val);
}

/**
 * Sanitizes an attributes object, stripping or masking sensitive keys,
 * enforcing bounds and preventing circular references.
 */
export function sanitizeAttributes(
  attributes?: Record<string, any> | null,
): Record<string, any> {
  if (!attributes || typeof attributes !== 'object') {
    return {};
  }

  try {
    const visited = new WeakSet<object>();
    const sanitized: Record<string, any> = {};
    let count = 0;

    for (const [key, value] of Object.entries(attributes)) {
      if (count >= MAX_ATTRIBUTES_COUNT) {
        sanitized['_attributes_truncated'] = true;
        break;
      }

      if (isSensitiveKey(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        const clean = sanitizeValue(value, 0, visited);
        if (clean !== undefined) {
          sanitized[key] = clean;
        }
      }
      count++;
    }

    return sanitized;
  } catch {
    // If sanitization fails for any reason, return an empty object to avoid breaking the host application
    return {};
  }
}

/**
 * Truncates and sanitizes a string message or body.
 */
export function sanitizeString(str?: string | null, maxLength = MAX_STRING_LENGTH): string {
  if (!str || typeof str !== 'string') return '';
  if (str.length > maxLength) {
    return str.slice(0, maxLength) + '...[truncated]';
  }
  return str;
}

/**
 * Sanitizes URLs by masking sensitive query parameters (e.g. token, password, apiKey).
 */
export function sanitizeUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const base = typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost';
    const parsed = new URL(rawUrl, base);
    const searchParams = new URLSearchParams(parsed.search);
    let modified = false;

    for (const [key] of Array.from(searchParams.entries())) {
      if (isSensitiveKey(key)) {
        searchParams.set(key, '[REDACTED]');
        modified = true;
      }
    }

    if (modified) {
      parsed.search = searchParams.toString();
    }
    return parsed.toString();
  } catch {
    // If URL parsing fails, remove any query string altogether to be safe
    return rawUrl.split('?')[0];
  }
}
