import assert from 'node:assert/strict';
import { newrelicConfig, NR_ATTRIBUTE_EXCLUDE } from '../src/newrelicConfig.ts';

describe('newrelicConfig', () => {
  it('sets the PHI-safe defaults', () => {
    const c = newrelicConfig({ app_name: ['hds-dev-bridge-mira'] }) as any;
    assert.deepEqual(c.app_name, ['hds-dev-bridge-mira']);
    assert.equal(c.allow_all_headers, false);
    assert.equal(c.strip_exception_messages.enabled, true);
    assert.equal(c.transaction_tracer.record_sql, 'obfuscated');
    assert.equal(c.application_logging.forwarding.enabled, false);
    assert.ok(c.attributes.exclude.includes('request.headers.authorization'));
    assert.ok(c.attributes.exclude.includes('request.parameters.*'));
  });

  it('deep-merges overrides without dropping sibling defaults', () => {
    const c = newrelicConfig({
      app_name: ['x'],
      application_logging: { forwarding: { enabled: true } }
    }) as any;
    // overridden
    assert.equal(c.application_logging.forwarding.enabled, true);
    // sibling defaults preserved
    assert.equal(c.application_logging.metrics.enabled, true);
    assert.equal(c.strip_exception_messages.enabled, true);
  });

  it('lets a caller replace the exclude list wholesale', () => {
    const c = newrelicConfig({ attributes: { exclude: ['request.body'] } }) as any;
    assert.deepEqual(c.attributes.exclude, ['request.body']);
  });

  it('exposes the default exclude list', () => {
    assert.ok(NR_ATTRIBUTE_EXCLUDE.includes('response.headers.*'));
  });
});
