import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sanitizeAttributes, isSensitiveKey, sanitizeString, sanitizeUrl } from '../src/sanitizer';

describe('Sanitizer', () => {
  it('detects sensitive keys accurately', () => {
    assert.strictEqual(isSensitiveKey('password'), true);
    assert.strictEqual(isSensitiveKey('user_password'), true);
    assert.strictEqual(isSensitiveKey('authToken'), true);
    assert.strictEqual(isSensitiveKey('apiKey'), true);
    assert.strictEqual(isSensitiveKey('x-traceops-key'), true);
    assert.strictEqual(isSensitiveKey('authorization'), true);
    assert.strictEqual(isSensitiveKey('cookie'), true);
    assert.strictEqual(isSensitiveKey('clientSecret'), true);
    assert.strictEqual(isSensitiveKey('formData'), true);

    assert.strictEqual(isSensitiveKey('route'), false);
    assert.strictEqual(isSensitiveKey('http.method'), false);
    assert.strictEqual(isSensitiveKey('duration'), false);
  });

  it('redacts sensitive attribute values', () => {
    const input = {
      user_id: 'usr_123',
      password: 'super-secret-password',
      token: 'jwt.token.value',
      authorization: 'Bearer secret',
      cookie: 'session=xyz',
      apiKey: 'tops_live_12345',
      nested: {
        secretKey: 'nested-secret',
        normalKey: 'visible-value',
      },
    };

    const result = sanitizeAttributes(input);

    assert.strictEqual(result.user_id, 'usr_123');
    assert.strictEqual(result.password, '[REDACTED]');
    assert.strictEqual(result.token, '[REDACTED]');
    assert.strictEqual(result.authorization, '[REDACTED]');
    assert.strictEqual(result.cookie, '[REDACTED]');
    assert.strictEqual(result.apiKey, '[REDACTED]');
    assert.strictEqual(result.nested.secretKey, '[REDACTED]');
    assert.strictEqual(result.nested.normalKey, 'visible-value');
  });

  it('handles circular references without throwing or infinite loop', () => {
    const circularObj: any = { name: 'test' };
    circularObj.self = circularObj;

    const result = sanitizeAttributes({ ref: circularObj });
    assert.strictEqual(result.ref.name, 'test');
    assert.strictEqual(result.ref.self, '[Circular]');
  });

  it('truncates excessively long strings', () => {
    const longStr = 'a'.repeat(3000);
    const result = sanitizeAttributes({ message: longStr });
    assert.ok(result.message.length <= 2048 + '...[truncated]'.length);
    assert.ok(result.message.endsWith('...[truncated]'));
  });

  it('caps maximum attribute count to prevent memory bloat', () => {
    const manyAttrs: Record<string, string> = {};
    for (let i = 0; i < 80; i++) {
      manyAttrs[`key_${i}`] = `value_${i}`;
    }

    const result = sanitizeAttributes(manyAttrs);
    const keys = Object.keys(result);
    assert.ok(keys.length <= 51); // 50 items + _attributes_truncated
    assert.strictEqual(result['_attributes_truncated'], true);
  });

  it('sanitizes strings with boundary check', () => {
    assert.strictEqual(sanitizeString(null), '');
    assert.strictEqual(sanitizeString(undefined), '');
    assert.strictEqual(sanitizeString('short text'), 'short text');
    const long = 'x'.repeat(300);
    const truncated = sanitizeString(long, 100);
    assert.strictEqual(truncated.length, 100 + '...[truncated]'.length);
    assert.ok(truncated.endsWith('...[truncated]'));
  });

  it('sanitizes sensitive query parameters in URLs', () => {
    const raw = 'https://example.com/checkout?user=123&token=secret_jwt_xyz&apiKey=tops_live_999&item=laptop';
    const sanitized = sanitizeUrl(raw);
    assert.ok(!sanitized.includes('secret_jwt_xyz'));
    assert.ok(!sanitized.includes('tops_live_999'));
    assert.ok(sanitized.includes('user=123'));
    assert.ok(sanitized.includes('item=laptop'));
    assert.ok(sanitized.includes('token=%5BREDACTED%5D') || sanitized.includes('token=[REDACTED]'));
  });
});

