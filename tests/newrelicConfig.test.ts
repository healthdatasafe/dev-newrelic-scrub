import assert from 'node:assert/strict';
import { createRequire } from 'module';
import { newrelicConfig, NR_ATTRIBUTE_EXCLUDE } from '../src/newrelicConfig.ts';

const require_ = createRequire(import.meta.url);

/**
 * Ask the AGENT for its resolved decision, rather than asserting the contents of
 * our own exported array.
 *
 * Why this shape: an exclusion entry that is merely misspelled — the classic case
 * being a hyphenated header name where the agent emits camelCase — matches nothing
 * and fails **silently**. A test that reads our exported list is structurally
 * incapable of catching that: the list contains exactly what it contains, and the
 * assertion passes while the attribute keeps flowing to the vendor. Upstream pryv
 * shipped that exact defect and found it only by enumerating live telemetry
 * (pryv/open-pryv.io#116).
 */
function resolvedFilter (): (key: string) => number {
  const Config = require_('newrelic/lib/config');
  const AttributeFilter = require_('newrelic/lib/config/attribute-filter');
  const config = Config.initialize(newrelicConfig({ app_name: ['hds-test'] }));
  const filter = new AttributeFilter(config);
  const { DESTINATIONS } = AttributeFilter;
  return (key: string) => filter.filterAll(DESTINATIONS.TRANS_COMMON, key);
}

/** Attributes that must never reach the vendor. */
const MUST_BE_EXCLUDED = [
  'request.uri',
  'http.url',
  'request.parameters.route.username',
  'request.parameters.auth',
  'request.headers.host',
  'request.headers.referer',
  'request.headers.userAgent',
  'request.headers.cookie',
  'request.headers.authorization',
  'request.headers.proxyAuthorization',
  'request.headers.setCookie',
  'request.headers.xForwardedFor',
  'request.body',
  'response.headers.contentType'
];

/** Attributes we deliberately keep, so monitoring stays useful. */
const MUST_BE_KEPT = [
  'request.method',
  'request.headers.accept',
  'request.headers.contentType',
  'request.headers.contentLength'
];

describe('newrelicConfig', () => {
  it('sets the PHI-safe defaults', () => {
    const c = newrelicConfig({ app_name: ['hds-dev-bridge-mira'] }) as any;
    assert.deepEqual(c.app_name, ['hds-dev-bridge-mira']);
    assert.equal(c.allow_all_headers, false);
    assert.equal(c.strip_exception_messages.enabled, true);
    assert.equal(c.transaction_tracer.record_sql, 'off');
    assert.equal(c.url_obfuscation.enabled, true);
    assert.equal(c.url_obfuscation.regex.pattern, '^/.*');
    assert.equal(c.custom_insights_events.enabled, false);
    assert.equal(c.api.custom_attributes_enabled, false);
    assert.equal(c.api.custom_events_enabled, false);
    // forwarding ON (needed for recordLogEvent) but winston auto-forward OFF,
    // so only our error-level recordLogEvent reaches NR.
    assert.equal(c.application_logging.forwarding.enabled, true);
    assert.equal(c.instrumentation.winston.enabled, false);
  });

  it('deep-merges overrides without dropping sibling defaults', () => {
    const c = newrelicConfig({
      app_name: ['x'],
      application_logging: { metrics: { enabled: false } }
    }) as any;
    // overridden
    assert.equal(c.application_logging.metrics.enabled, false);
    // sibling defaults preserved
    assert.equal(c.application_logging.forwarding.enabled, true);
    assert.equal(c.strip_exception_messages.enabled, true);
  });

  it('lets a caller replace the exclude list wholesale', () => {
    const c = newrelicConfig({ attributes: { exclude: ['request.body'] } }) as any;
    assert.deepEqual(c.attributes.exclude, ['request.body']);
  });

  it('spells every header exclusion as the agent emits it, not as the header', () => {
    // The agent camel-cases multi-word header names. A hyphen after
    // `request.headers.` therefore matches nothing and fails silently.
    const hyphenated = NR_ATTRIBUTE_EXCLUDE
      .filter((p) => p.startsWith('request.headers.'))
      .filter((p) => p.slice('request.headers.'.length).includes('-'));
    assert.deepEqual(hyphenated, [], `hyphenated header exclusions match nothing: ${hyphenated.join(', ')}`);
  });

  describe('resolved agent decisions', () => {
    it('excludes every identifier-bearing attribute', () => {
      const decide = resolvedFilter();
      const leaking = MUST_BE_EXCLUDED.filter((key) => decide(key) !== 0);
      assert.deepEqual(leaking, [], `still collected by the agent: ${leaking.join(', ')}`);
    });

    it('keeps the attributes monitoring actually needs', () => {
      const decide = resolvedFilter();
      const dropped = MUST_BE_KEPT.filter((key) => decide(key) === 0);
      assert.deepEqual(dropped, [], `unexpectedly excluded: ${dropped.join(', ')}`);
    });

    it('would fail if an exclusion were misspelled (guard proves the guard)', () => {
      const Config = require_('newrelic/lib/config');
      const AttributeFilter = require_('newrelic/lib/config/attribute-filter');
      const { DESTINATIONS } = AttributeFilter;
      // Same config, but with the header exclusions written the WRONG way.
      const broken = newrelicConfig({
        app_name: ['hds-test'],
        attributes: { exclude: ['request.headers.user-agent'] }
      });
      const filter = new AttributeFilter(Config.initialize(broken));
      assert.notEqual(
        filter.filterAll(DESTINATIONS.TRANS_COMMON, 'request.headers.userAgent'),
        0,
        'a hyphenated exclusion should NOT exclude the camelCased attribute'
      );
    });
  });
});
