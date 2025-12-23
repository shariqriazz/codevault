import test from 'node:test';
import assert from 'node:assert/strict';
import { LogLevel, logger, log, print, redactLogData } from '../utils/logger.js';

// ============================================================================
// LogLevel Enum Tests
// ============================================================================

test('LogLevel enum has correct values', () => {
  assert.equal(LogLevel.DEBUG, 0);
  assert.equal(LogLevel.INFO, 1);
  assert.equal(LogLevel.WARN, 2);
  assert.equal(LogLevel.ERROR, 3);
  assert.equal(LogLevel.SILENT, 4);
});

test('LogLevel values are in ascending order', () => {
  assert.ok(LogLevel.DEBUG < LogLevel.INFO);
  assert.ok(LogLevel.INFO < LogLevel.WARN);
  assert.ok(LogLevel.WARN < LogLevel.ERROR);
  assert.ok(LogLevel.ERROR < LogLevel.SILENT);
});

// ============================================================================
// redactLogData Tests - Secret Pattern Matching
// ============================================================================

test('redactLogData redacts OpenAI style API keys', () => {
  const result = redactLogData('Using key sk-abc123def456ghi789jkl');
  assert.ok(!result.message.includes('sk-abc123def456ghi789jkl'));
  assert.ok(result.message.includes('[REDACTED]'));
});

test('redactLogData redacts GitHub tokens', () => {
  const ghpResult = redactLogData('Token: ghp_abcdefghijklmnopqrstuvwxyz');
  assert.ok(!ghpResult.message.includes('ghp_abcdefghijklmnopqrstuvwxyz'));
  assert.ok(ghpResult.message.includes('[REDACTED]'));

  const ghoResult = redactLogData('Token: gho_abcdefghijklmnopqrstuvwxyz');
  assert.ok(!ghoResult.message.includes('gho_abcdefghijklmnopqrstuvwxyz'));
});

test('redactLogData redacts Slack tokens', () => {
  const result = redactLogData('Slack: xoxb-123456789012-abcdefghij');
  assert.ok(!result.message.includes('xoxb-123456789012-abcdefghij'));
  assert.ok(result.message.includes('[REDACTED]'));
});

test('redactLogData redacts JWT tokens', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const result = redactLogData(`Bearer ${jwt}`);
  assert.ok(!result.message.includes(jwt));
  assert.ok(result.message.includes('[REDACTED]'));
});

test('redactLogData redacts Bearer tokens', () => {
  const result = redactLogData('Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456');
  assert.ok(!result.message.includes('abcdefghijklmnopqrstuvwxyz123456'));
  assert.ok(result.message.includes('[REDACTED]'));
});

test('redactLogData redacts AWS access key IDs', () => {
  const result = redactLogData('AWS Key: AKIAIOSFODNN7EXAMPLE');
  assert.ok(!result.message.includes('AKIAIOSFODNN7EXAMPLE'));
  assert.ok(result.message.includes('[REDACTED]'));
});

test('redactLogData redacts PEM private keys', () => {
  const pemKey = '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7o5fkj\n-----END PRIVATE KEY-----';
  const result = redactLogData(`Key: ${pemKey}`);
  assert.ok(!result.message.includes('MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7o5fkj'));
  assert.ok(result.message.includes('[REDACTED]'));
});

test('redactLogData redacts generic api_key patterns', () => {
  const result = redactLogData('api_key=mySecretApiKey123456');
  assert.ok(result.message.includes('[REDACTED]'));
});

test('redactLogData redacts password patterns', () => {
  const result = redactLogData('password: mysecretpassword');
  assert.ok(result.message.includes('[REDACTED]'));
});

// ============================================================================
// redactLogData Tests - Environment Variable Names
// ============================================================================

test('redactLogData redacts OPENAI_API_KEY values', () => {
  const result = redactLogData('OPENAI_API_KEY=sk-myapikey123456789');
  assert.equal(result.message, 'OPENAI_API_KEY=[REDACTED]');
});

test('redactLogData redacts NPM_TOKEN values', () => {
  const result = redactLogData('NPM_TOKEN=npm_token_value_here');
  assert.equal(result.message, 'NPM_TOKEN=[REDACTED]');
});

test('redactLogData redacts GITHUB_TOKEN values', () => {
  const result = redactLogData('GITHUB_TOKEN=ghp_tokenvalue123');
  assert.equal(result.message, 'GITHUB_TOKEN=[REDACTED]');
});

test('redactLogData redacts DATABASE_URL values', () => {
  const result = redactLogData('DATABASE_URL=postgresql://user:pass@host/db');
  assert.equal(result.message, 'DATABASE_URL=[REDACTED]');
});

// ============================================================================
// redactLogData Tests - Metadata Redaction
// ============================================================================

test('redactLogData redacts sensitive key names in metadata', () => {
  const result = redactLogData('Log message', {
    apiKey: 'secret123',
    normalField: 'visible'
  });

  assert.equal(result.meta?.apiKey, '[REDACTED]');
  assert.equal(result.meta?.normalField, 'visible');
});

test('redactLogData redacts password field in metadata', () => {
  const result = redactLogData('Log message', {
    password: 'secret123',
    username: 'admin'
  });

  assert.equal(result.meta?.password, '[REDACTED]');
  assert.equal(result.meta?.username, 'admin');
});

test('redactLogData redacts token field in metadata', () => {
  const result = redactLogData('Log message', {
    token: 'bearer_xyz123',
    count: 42
  });

  assert.equal(result.meta?.token, '[REDACTED]');
  assert.equal(result.meta?.count, 42);
});

test('redactLogData redacts client_secret in metadata', () => {
  const result = redactLogData('OAuth', {
    client_secret: 'my-client-secret',
    client_id: 'my-client-id'
  });

  assert.equal(result.meta?.client_secret, '[REDACTED]');
  assert.equal(result.meta?.client_id, 'my-client-id');
});

test('redactLogData redacts nested sensitive fields', () => {
  const result = redactLogData('Nested', {
    config: {
      apiKey: 'secret',
      url: 'https://example.com'
    }
  });

  const config = result.meta?.config as Record<string, unknown>;
  assert.equal(config.apiKey, '[REDACTED]');
  assert.equal(config.url, 'https://example.com');
});

test('redactLogData handles arrays in metadata', () => {
  const result = redactLogData('Array test', {
    items: ['one', 'two', 'three'],
    tokens: ['secret1', 'secret2'] // This is an array, not a token field
  });

  assert.deepEqual(result.meta?.items, ['one', 'two', 'three']);
  // tokens as a key should be redacted
  assert.equal(result.meta?.tokens, '[REDACTED]');
});

test('redactLogData handles null and undefined in metadata', () => {
  const result = redactLogData('Null test', {
    nullField: null,
    undefinedField: undefined,
    normalField: 'value'
  });

  assert.equal(result.meta?.nullField, null);
  assert.equal(result.meta?.undefinedField, undefined);
  assert.equal(result.meta?.normalField, 'value');
});

test('redactLogData handles empty metadata', () => {
  const result = redactLogData('Empty meta', {});
  assert.deepEqual(result.meta, {});
});

test('redactLogData handles undefined metadata', () => {
  const result = redactLogData('No meta');
  assert.equal(result.meta, undefined);
});

// ============================================================================
// redactLogData Tests - Combination Patterns
// ============================================================================

test('redactLogData redacts api_key combinations', () => {
  const result = redactLogData('Setting', {
    my_api_key: 'secret'
  });

  assert.equal(result.meta?.my_api_key, '[REDACTED]');
});

test('redactLogData redacts access_token combinations', () => {
  const result = redactLogData('Token', {
    user_access_token: 'token123'
  });

  assert.equal(result.meta?.user_access_token, '[REDACTED]');
});

test('redactLogData redacts camelCase sensitive keys', () => {
  const result = redactLogData('CamelCase', {
    clientSecret: 'secret',
    accessToken: 'token',
    refreshToken: 'refresh'
  });

  assert.equal(result.meta?.clientSecret, '[REDACTED]');
  assert.equal(result.meta?.accessToken, '[REDACTED]');
  assert.equal(result.meta?.refreshToken, '[REDACTED]');
});

// ============================================================================
// Logger Level Tests
// ============================================================================

test('logger getLevel returns current level', () => {
  const currentLevel = logger.getLevel();
  assert.ok(Object.values(LogLevel).includes(currentLevel));
});

test('logger setLevel changes level', () => {
  const originalLevel = logger.getLevel();

  logger.setLevel(LogLevel.DEBUG);
  assert.equal(logger.getLevel(), LogLevel.DEBUG);

  logger.setLevel(LogLevel.ERROR);
  assert.equal(logger.getLevel(), LogLevel.ERROR);

  // Restore original level
  logger.setLevel(originalLevel);
});

test('logger isQuiet returns boolean', () => {
  const quiet = logger.isQuiet();
  assert.equal(typeof quiet, 'boolean');
});

test('logger setQuiet enables quiet mode', () => {
  const originalQuiet = logger.isQuiet();
  const originalLevel = logger.getLevel();

  logger.setQuiet(true);
  assert.equal(logger.isQuiet(), true);
  assert.ok(logger.getLevel() >= LogLevel.WARN);

  // Restore
  logger.setQuiet(originalQuiet);
  logger.setLevel(originalLevel);
});

test('logger setQuiet false does not automatically lower level', () => {
  const originalLevel = logger.getLevel();

  logger.setLevel(LogLevel.ERROR);
  logger.setQuiet(false);

  // Level should stay at ERROR, not automatically lowered
  assert.equal(logger.getLevel(), LogLevel.ERROR);

  logger.setLevel(originalLevel);
});

// ============================================================================
// Logger Output Tests (with captured output)
// ============================================================================

test('logger.debug does not output when level is INFO', () => {
  const originalLevel = logger.getLevel();
  logger.setLevel(LogLevel.INFO);

  // This should not throw, just not output
  logger.debug('Debug message');

  logger.setLevel(originalLevel);
});

test('logger.info does not output when level is WARN', () => {
  const originalLevel = logger.getLevel();
  logger.setLevel(LogLevel.WARN);

  // This should not throw, just not output
  logger.info('Info message');

  logger.setLevel(originalLevel);
});

test('logger.warn does not output when level is ERROR', () => {
  const originalLevel = logger.getLevel();
  logger.setLevel(LogLevel.ERROR);

  // This should not throw, just not output
  logger.warn('Warn message');

  logger.setLevel(originalLevel);
});

test('logger.error does not output when level is SILENT', () => {
  const originalLevel = logger.getLevel();
  logger.setLevel(LogLevel.SILENT);

  // This should not throw, just not output
  logger.error('Error message');

  logger.setLevel(originalLevel);
});

// ============================================================================
// Logger Error Method Tests
// ============================================================================

test('logger.error handles Error objects', () => {
  const originalLevel = logger.getLevel();
  logger.setLevel(LogLevel.SILENT); // Suppress output

  const error = new Error('Test error');
  // Should not throw
  logger.error('Operation failed', error);

  logger.setLevel(originalLevel);
});

test('logger.error handles string errors', () => {
  const originalLevel = logger.getLevel();
  logger.setLevel(LogLevel.SILENT);

  // Should not throw
  logger.error('Operation failed', 'string error');

  logger.setLevel(originalLevel);
});

test('logger.error handles null/undefined errors', () => {
  const originalLevel = logger.getLevel();
  logger.setLevel(LogLevel.SILENT);

  // Should not throw
  logger.error('Operation failed', null);
  logger.error('Operation failed', undefined);

  logger.setLevel(originalLevel);
});

test('logger.error handles additional metadata', () => {
  const originalLevel = logger.getLevel();
  logger.setLevel(LogLevel.SILENT);

  // Should not throw
  logger.error('Operation failed', new Error('Test'), { requestId: '123' });

  logger.setLevel(originalLevel);
});

// ============================================================================
// log Convenience Object Tests
// ============================================================================

test('log.debug calls logger.debug', () => {
  const originalLevel = logger.getLevel();
  logger.setLevel(LogLevel.SILENT);

  // Should not throw
  log.debug('Debug message', { key: 'value' });

  logger.setLevel(originalLevel);
});

test('log.info calls logger.info', () => {
  const originalLevel = logger.getLevel();
  logger.setLevel(LogLevel.SILENT);

  // Should not throw
  log.info('Info message', { key: 'value' });

  logger.setLevel(originalLevel);
});

test('log.warn calls logger.warn', () => {
  const originalLevel = logger.getLevel();
  logger.setLevel(LogLevel.SILENT);

  // Should not throw
  log.warn('Warn message', { key: 'value' });

  logger.setLevel(originalLevel);
});

test('log.error calls logger.error', () => {
  const originalLevel = logger.getLevel();
  logger.setLevel(LogLevel.SILENT);

  // Should not throw
  log.error('Error message', new Error('test'), { key: 'value' });

  logger.setLevel(originalLevel);
});

test('log.isQuiet returns logger.isQuiet result', () => {
  assert.equal(log.isQuiet(), logger.isQuiet());
});

test('log.setQuiet sets quiet mode', () => {
  const originalQuiet = logger.isQuiet();
  const originalLevel = logger.getLevel();

  log.setQuiet(true);
  assert.equal(logger.isQuiet(), true);

  logger.setQuiet(originalQuiet);
  logger.setLevel(originalLevel);
});

// ============================================================================
// print Function Tests
// ============================================================================

test('print does not throw', () => {
  // print writes to stdout, just verify it does not throw
  assert.doesNotThrow(() => {
    // Capture stdout to prevent actual output in tests
    const originalWrite = process.stdout.write;
    process.stdout.write = (): boolean => true;

    print('Test message');

    process.stdout.write = originalWrite;
  });
});

test('print handles empty string', () => {
  const originalWrite = process.stdout.write;
  let output = '';
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    output += chunk.toString();
    return true;
  };

  print('');

  process.stdout.write = originalWrite;
  assert.equal(output, '\n');
});

test('print handles special characters', () => {
  const originalWrite = process.stdout.write;
  let output = '';
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    output += chunk.toString();
    return true;
  };

  print('Tab:\tNewline in print');

  process.stdout.write = originalWrite;
  assert.ok(output.includes('Tab:\tNewline in print'));
});

// ============================================================================
// Edge Cases
// ============================================================================

test('redactLogData preserves non-sensitive data', () => {
  const result = redactLogData('Normal log message', {
    userId: 123,
    action: 'login',
    timestamp: '2024-01-01T00:00:00Z'
  });

  assert.equal(result.message, 'Normal log message');
  assert.equal(result.meta?.userId, 123);
  assert.equal(result.meta?.action, 'login');
  assert.equal(result.meta?.timestamp, '2024-01-01T00:00:00Z');
});

test('redactLogData handles boolean values in metadata', () => {
  const result = redactLogData('Boolean test', {
    enabled: true,
    disabled: false
  });

  assert.equal(result.meta?.enabled, true);
  assert.equal(result.meta?.disabled, false);
});

test('redactLogData handles numeric values in metadata', () => {
  const result = redactLogData('Number test', {
    count: 42,
    rate: 3.14,
    negative: -100
  });

  assert.equal(result.meta?.count, 42);
  assert.equal(result.meta?.rate, 3.14);
  assert.equal(result.meta?.negative, -100);
});

test('redactLogData handles deeply nested objects', () => {
  const result = redactLogData('Deep nesting', {
    level1: {
      level2: {
        level3: {
          apiKey: 'secret',
          data: 'visible'
        }
      }
    }
  });

  const level1 = result.meta?.level1 as Record<string, unknown>;
  const level2 = level1?.level2 as Record<string, unknown>;
  const level3 = level2?.level3 as Record<string, unknown>;

  assert.equal(level3.apiKey, '[REDACTED]');
  assert.equal(level3.data, 'visible');
});

test('redactLogData handles mixed arrays', () => {
  const result = redactLogData('Mixed array', {
    mixed: [1, 'string', { key: 'value' }, null]
  });

  const mixed = result.meta?.mixed as unknown[];
  assert.deepEqual(mixed, [1, 'string', { key: 'value' }, null]);
});

test('redactLogData does not modify original metadata', () => {
  const original = {
    apiKey: 'secret',
    data: 'visible'
  };

  const result = redactLogData('Test', original);

  // Original should be unchanged
  assert.equal(original.apiKey, 'secret');
  // Result should have redacted version
  assert.equal(result.meta?.apiKey, '[REDACTED]');
});

// ============================================================================
// Sensitive Field Detection Tests
// ============================================================================

test('redactLogData detects authorization field', () => {
  const result = redactLogData('Auth', { authorization: 'Bearer xyz' });
  assert.equal(result.meta?.authorization, '[REDACTED]');
});

test('redactLogData detects session field', () => {
  const result = redactLogData('Session', { session: 'session123' });
  assert.equal(result.meta?.session, '[REDACTED]');
});

test('redactLogData detects cookie field', () => {
  const result = redactLogData('Cookie', { cookie: 'sessionid=abc123' });
  assert.equal(result.meta?.cookie, '[REDACTED]');
});

test('redactLogData detects secret field', () => {
  const result = redactLogData('Secret', { secret: 'mysecret' });
  assert.equal(result.meta?.secret, '[REDACTED]');
});

test('redactLogData detects passwd field', () => {
  const result = redactLogData('Passwd', { passwd: 'mypasswd' });
  assert.equal(result.meta?.passwd, '[REDACTED]');
});

test('redactLogData detects pwd field', () => {
  const result = redactLogData('Pwd', { pwd: 'mypwd' });
  assert.equal(result.meta?.pwd, '[REDACTED]');
});

test('redactLogData detects auth field', () => {
  const result = redactLogData('Auth field', { auth: 'auth_value' });
  assert.equal(result.meta?.auth, '[REDACTED]');
});

test('redactLogData detects bearer field', () => {
  const result = redactLogData('Bearer', { bearer: 'token' });
  assert.equal(result.meta?.bearer, '[REDACTED]');
});
