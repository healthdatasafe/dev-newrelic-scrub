/**
 * PHI-safe New Relic APM agent config preset.
 *
 * The APM agent auto-instruments http/db and captures request attributes and
 * exception messages — a separate channel from logs (which dev-boiler scrubs).
 * This preset keeps PHI/secrets out of that channel by config:
 *   - `strip_exception_messages` so error message text never leaves (platform
 *     validation errors quote client-supplied values, e.g. rejected stream ids);
 *   - `attributes.exclude` for the URL, route/query params, identifying headers
 *     and request/response bodies;
 *   - `url_obfuscation` masking whole outbound paths in external segment/span
 *     NAMES, the one surface attribute exclusion cannot reach;
 *   - SQL recording off;
 *   - custom events/attributes off;
 *   - winston auto-instrumentation off, so the agent forwards no log level on
 *     its own (dev-boiler -> nrErrorLogger is the only forward path).
 *
 * ⚠️ This is a DENY-list: the guarantee depends on enumerating what must not
 * leave, and an agent upgrade can silently widen the collected surface. Upstream
 * pryv is replacing the equivalent config with an allow-list emitter over OTLP
 * for exactly that reason (pryv/open-pryv.io#116). Treat this preset as
 * defense-in-depth, not as a durable guarantee, and do not deepen it further
 * without revisiting that decision.
 *
 * ⚠️ What remains after all of the above is PSEUDONYMOUS, not anonymous:
 * timestamps, route patterns, status codes and the core FQDN still describe
 * individual activity and are re-identifiable against our own audit log. It is
 * still personal data, so the processor relationship (BAA/DPA) with the APM
 * vendor still matters.
 *
 * Usage — in a consumer's `newrelic.js` (CommonJS, read by `node --import newrelic`):
 *
 *   const { newrelicConfig } = require('dev-newrelic-scrub');
 *   exports.config = newrelicConfig({ app_name: ['hds-dev-bridge-mira'] });
 *
 * The license key still comes from `NEW_RELIC_LICENSE_KEY` in the environment.
 */

export interface NewRelicConfigOptions {
  /** Entity name(s), e.g. `['hds-dev-bridge-mira']`. */
  app_name?: string[];
  /** Any agent config keys to deep-merge over the preset (e.g. distributed_tracing). */
  [key: string]: unknown;
}

function isPlainObject (v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge (
  base: Record<string, unknown>,
  over: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const cur = out[k];
    out[k] = isPlainObject(cur) && isPlainObject(v) ? deepMerge(cur, v) : v;
  }
  return out;
}

/**
 * Attribute patterns excluded everywhere — common PHI/secret carriers.
 *
 * ⚠️ Write these as the agent EMITS them, not as the HTTP header is spelled.
 * The agent camel-cases multi-word header names, so `request.headers.user-agent`
 * matches nothing and fails **silently**. Upstream pryv shipped exactly that bug
 * and only caught it by enumerating live telemetry
 * (pryv/open-pryv.io#116). `tests/newrelicConfig.test.ts` therefore asks the
 * agent's own attribute filter for its decision rather than asserting the
 * contents of this array — a list assertion cannot catch a misspelling.
 */
export const NR_ATTRIBUTE_EXCLUDE: readonly string[] = [
  // Credentials.
  'request.headers.cookie',
  'request.headers.authorization',
  'request.headers.proxyAuthorization',
  'request.headers.setCookie*',
  'request.headers.x*',
  // The URL itself. On the HDS/Pryv APIs the path carries usernames, event ids
  // and attachment ids, so it is a first-class identifier channel.
  'request.uri',
  'http.url',
  // Route + query parameters. The username arrives as a first-class attribute
  // (`request.parameters.route.username`), not merely inside a path.
  'request.parameters.*',
  // Identifying / fingerprinting headers. `host` carries the username as a
  // subdomain in DNS-ful topologies; `referer` leaks the originating URL.
  'request.headers.host',
  'request.headers.referer',
  'request.headers.userAgent',
  // Payloads.
  'request.body',
  'response.headers.*'
];

/**
 * Build a PHI-safe New Relic agent config object. Pass `app_name` and any
 * overrides; everything else defaults to the safe preset.
 */
export function newrelicConfig (options: NewRelicConfigOptions = {}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    app_name: options.app_name,
    allow_all_headers: false,
    attributes: {
      enabled: true,
      exclude: [...NR_ATTRIBUTE_EXCLUDE]
    },
    // PHI may appear in exception messages — never let the text leave the box.
    strip_exception_messages: { enabled: true },
    transaction_tracer: {
      enabled: true,
      // 'off', not 'obfuscated': obfuscation masks literals but still ships the
      // statement shape, and a WHERE on a username/id is identifying on its own.
      record_sql: 'off'
    },
    slow_sql: {
      enabled: true
    },
    // External segment + span NAMES embed the outbound path, and attribute
    // exclusion cannot reach names. Mask the whole path rather than trying to
    // match identifier shapes: enumerating the shapes a caller might choose is
    // not winnable (attachment filenames, user-chosen stream ids and webhook
    // path segments all survived pryv's shape-matching pattern).
    url_obfuscation: {
      enabled: true,
      regex: { pattern: '^/.*', replacement: '*' }
    },
    // Nothing here emits custom events/attributes today; keep the channel shut
    // so it cannot become an accidental one.
    custom_insights_events: { enabled: false },
    api: {
      custom_attributes_enabled: false,
      custom_events_enabled: false
    },
    application_logging: {
      enabled: true,
      // Must be ON for recordLogEvent (our error-only forwarder) to work. Winston
      // auto-instrumentation is disabled below so the agent does NOT forward every
      // level — only the error logs we send via dev-boiler -> nrErrorLogger reach NR.
      forwarding: { enabled: true },
      local_decorating: { enabled: false },
      metrics: { enabled: true }
    },
    instrumentation: {
      // Stop NR from auto-forwarding ALL winston log levels. Error-level logs are
      // forwarded explicitly (scrubbed) via recordLogEvent. See newrelicForward.ts.
      winston: { enabled: false }
    },
    distributed_tracing: { enabled: true }
  };

  const { app_name: _app, ...rest } = options;
  return deepMerge(base, rest);
}
