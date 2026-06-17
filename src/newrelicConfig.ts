/**
 * PHI-safe New Relic APM agent config preset.
 *
 * The APM agent auto-instruments http/db and captures request attributes and
 * exception messages — a separate channel from logs (which dev-boiler scrubs).
 * This preset keeps PHI/secrets out of that channel by config:
 *   - `strip_exception_messages` so error message text never leaves;
 *   - `attributes.exclude` for headers, query params, request/response bodies;
 *   - SQL obfuscation;
 *   - APM-side log forwarding off by default (dev-boiler is the forward path).
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

/** Attribute patterns excluded everywhere — common PHI/secret carriers. */
export const NR_ATTRIBUTE_EXCLUDE: readonly string[] = [
  'request.headers.cookie',
  'request.headers.authorization',
  'request.headers.proxyAuthorization',
  'request.headers.setCookie*',
  'request.headers.x-*',
  'request.parameters.*',
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
      record_sql: 'obfuscated'
    },
    slow_sql: {
      enabled: true
    },
    application_logging: {
      enabled: true,
      // Local logs go through dev-boiler (already scrubbed); don't double-ship
      // via the APM agent unless a consumer explicitly opts in.
      forwarding: { enabled: false },
      local_decorating: { enabled: false },
      metrics: { enabled: true }
    },
    distributed_tracing: { enabled: true }
  };

  const { app_name: _app, ...rest } = options;
  return deepMerge(base, rest);
}
