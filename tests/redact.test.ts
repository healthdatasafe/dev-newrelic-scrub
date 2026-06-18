import assert from 'node:assert/strict';
import { redact, redactString } from '../src/redact.ts';
import { createBoilerLogger, type RedactedLogEntry } from '../src/boilerLogger.ts';

describe('redactString', () => {
  it('masks the auth token in a Pryv apiEndpoint URL', () => {
    const out = redactString('endpoint https://cabc123token@jdoe.demo.datasafe.dev/ ok');
    assert.equal(out, 'endpoint https://***@jdoe.demo.datasafe.dev/ ok');
  });

  it('masks token query params', () => {
    assert.equal(redactString('GET /x?auth=secrettok&page=2'), 'GET /x?auth=***&page=2');
    assert.equal(redactString('?access_token=abc.def#frag'), '?access_token=***#frag');
  });

  it('masks Bearer tokens', () => {
    assert.equal(redactString('Authorization: Bearer abc123.def-456'), 'Authorization: Bearer ***');
  });

  it('masks JWTs', () => {
    const jwt = 'eyJhbGciOiJ.eyJzdWIiOiIx.SflKxwRJSME';
    assert.equal(redactString(`tok=${jwt}`), 'tok=***');
  });

  it('masks email addresses', () => {
    assert.equal(redactString('user jane.doe@example.com logged in'), 'user *** logged in');
  });

  it('leaves clean strings untouched', () => {
    assert.equal(redactString('weight recorded for stream body-weight'), 'weight recorded for stream body-weight');
  });
});

describe('redact (deep)', () => {
  it('masks values by sensitive field name', () => {
    const out = redact({
      userId: 'u-1',
      password: 'hunter2',
      accessToken: 'abc',
      apiKey: 'k',
      nested: { clientSecret: 's', keep: 'me' }
    }) as Record<string, any>;
    assert.equal(out.userId, 'u-1');
    assert.equal(out.password, '***');
    assert.equal(out.accessToken, '***');
    assert.equal(out.apiKey, '***');
    assert.equal(out.nested.clientSecret, '***');
    assert.equal(out.nested.keep, 'me');
  });

  it('runs the string layer on non-sensitive string values', () => {
    const out = redact({ endpoint: 'https://tok@a.datasafe.dev/' }) as Record<string, any>;
    assert.equal(out.endpoint, 'https://***@a.datasafe.dev/');
  });

  it('handles arrays', () => {
    const out = redact([{ token: 't' }, 'plain', 'a@b.co']) as any[];
    assert.equal(out[0].token, '***');
    assert.equal(out[1], 'plain');
    assert.equal(out[2], '***');
  });

  it('does not mutate the input', () => {
    const input = { password: 'p' };
    const out = redact(input) as Record<string, any>;
    assert.equal(input.password, 'p');
    assert.equal(out.password, '***');
  });

  it('survives circular references', () => {
    const a: any = { name: 'x' };
    a.self = a;
    const out = redact(a) as Record<string, any>;
    assert.equal(out.name, 'x');
    assert.equal(out.self, '[Circular]');
  });

  it('truncates beyond maxDepth', () => {
    const out = redact({ a: { b: { c: 'deep' } } }, { maxDepth: 2 }) as Record<string, any>;
    assert.equal(out.a.b, '[Truncated]');
  });

  it('redacts Error message and stack', () => {
    const err = new Error('failed for https://tok@a.datasafe.dev/');
    const out = redact(err) as Record<string, any>;
    assert.equal(out.name, 'Error');
    assert.ok(!out.message.includes('tok@'));
    assert.ok(out.message.includes('***@'));
  });

  it('honours extraKeys', () => {
    const out = redact({ patientName: 'Jane' }, { extraKeys: ['patientname'] }) as Record<string, any>;
    assert.equal(out.patientName, '***');
  });
});

describe('createBoilerLogger', () => {
  it('forwards a scrubbed entry to the sink', () => {
    const seen: RedactedLogEntry[] = [];
    const logger = createBoilerLogger({ forward: (e) => seen.push(e) });
    logger.log('info', 'auth', 'login https://tok@jdoe.demo.datasafe.dev/', { accessToken: 'abc', op: 'signin' });
    assert.equal(seen.length, 1);
    const entry = seen[0]!;
    assert.equal(entry.level, 'info');
    assert.equal(entry.key, 'auth');
    assert.equal(entry.message, 'login https://***@jdoe.demo.datasafe.dev/');
    assert.equal((entry.context as any).accessToken, '***');
    assert.equal((entry.context as any).op, 'signin');
  });

  it('defaults to a no-op sink without throwing', () => {
    const logger = createBoilerLogger();
    assert.doesNotThrow(() => logger.log('error', 'x', 'msg', { token: 't' }));
  });

  it('with levels:[error], forwards only error-level entries', () => {
    const seen: RedactedLogEntry[] = [];
    const logger = createBoilerLogger({ levels: ['error'], forward: (e) => seen.push(e) });
    logger.log('info', 'k', 'an info line');
    logger.log('warn', 'k', 'a warn line');
    logger.log('debug', 'k', 'a debug line');
    logger.log('error', 'k', 'an error line');
    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.level, 'error');
    assert.equal(seen[0]!.message, 'an error line');
  });
});

describe('newRelicLogForward', () => {
  it('returns a sink that no-ops when the newrelic agent is absent', async () => {
    const { newRelicLogForward } = await import('../src/newrelicForward.ts');
    const sink = newRelicLogForward();
    assert.equal(typeof sink, 'function');
    assert.doesNotThrow(() => sink({ level: 'error', key: 'k', message: 'm' }));
  });
});
