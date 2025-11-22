import test from 'node:test';
import assert from 'node:assert/strict';

import { redactLogData } from '../utils/logger.js';
import type { LogMetadata, LogValue } from '../utils/logger.js';

test('redacts obvious secrets in messages and metadata', () => {
  const apiKey = 'sk-1234567890abcdef12345678';
  const bearer = 'Bearer abcdefghijklmnopqrstuvwxyz1234567890';
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature';

  const meta: LogMetadata = {
    apiKey,
    headers: { Authorization: bearer },
    nested: [{ refreshToken: jwt }]
  };

  const { message, meta: redactedMeta } = redactLogData(`sending ${apiKey}`, meta);

  assert.ok(!message.includes(apiKey));
  assert.ok(message.includes('[REDACTED]'));
  assert.equal(redactedMeta?.apiKey, '[REDACTED]');

  const headers = (redactedMeta?.headers ?? {}) as { Authorization?: LogValue };
  assert.equal(headers.Authorization, '[REDACTED]');

  const nested = redactedMeta?.nested as LogValue[] | undefined;
  assert.deepStrictEqual(nested, [{ refreshToken: '[REDACTED]' }]);
});

test('leaves safe metadata untouched', () => {
  const meta: LogMetadata = { file: 'index.ts', count: 2, dryRun: false };
  const originalMessage = 'Processing index.ts';

  const { message, meta: redactedMeta } = redactLogData(originalMessage, meta);

  assert.equal(message, originalMessage);
  assert.deepStrictEqual(redactedMeta, meta);
});

test('redacts configured env var names in message and metadata', () => {
  const previousEnv = process.env.CODEVAULT_REDACT_ENV_VARS;
  process.env.CODEVAULT_REDACT_ENV_VARS = 'CUSTOM_SECRET,ANOTHER_TOKEN';

  try {
    const meta: LogMetadata = { CUSTOM_SECRET: 'abc123', note: 'ok' };
    const { message, meta: redactedMeta } = redactLogData('CUSTOM_SECRET=abc123 safe', meta);

    assert.ok(message.includes('[REDACTED]'));
    assert.equal(redactedMeta?.CUSTOM_SECRET, '[REDACTED]');
    assert.equal(redactedMeta?.note, 'ok');
  } finally {
    if (previousEnv === undefined) {
      delete process.env.CODEVAULT_REDACT_ENV_VARS;
    } else {
      process.env.CODEVAULT_REDACT_ENV_VARS = previousEnv;
    }
  }
});
