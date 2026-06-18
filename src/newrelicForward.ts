/**
 * Forward (only) error-level logs to New Relic, scrubbed.
 *
 * Why this exists: NR's APM agent cannot level-filter forwarded logs — when
 * `application_logging.forwarding` is on it ships every level. So `newrelicConfig`
 * disables NR's winston auto-instrumentation and we forward error logs ourselves
 * via `newrelic.recordLogEvent`. dev-boiler calls our boiler custom-logger on every
 * log event (already scrubbed); the level filter keeps only `error`.
 */
import { createRequire } from 'module';
import { createBoilerLogger, type BoilerLogger, type RedactedLogEntry } from './boilerLogger.ts';

const require = createRequire(import.meta.url);

/**
 * A sink that sends an entry to New Relic via `recordLogEvent`. The `newrelic`
 * agent is loaded lazily (it lives in the consuming service, loaded by
 * `node --import newrelic`). No-ops if the agent isn't present/loaded.
 */
export function newRelicLogForward (): (entry: RedactedLogEntry) => void {
  let api: { recordLogEvent?: (e: object) => void } | null = null;
  let resolved = false;
  function getApi (): typeof api {
    if (resolved) return api;
    resolved = true;
    try {
      api = require('newrelic');
    } catch {
      api = null;
    }
    return api;
  }
  return (entry: RedactedLogEntry): void => {
    const nr = getApi();
    if (!nr || typeof nr.recordLogEvent !== 'function') return;
    nr.recordLogEvent({
      message: entry.message,
      level: String(entry.level || 'ERROR').toUpperCase(),
      timestamp: Date.now()
    });
  };
}

/**
 * A boiler custom-logger that forwards ONLY error-level logs to New Relic,
 * scrubbed. Wire via boiler config `logs:custom:path: dev-newrelic-scrub/nrErrorLogger`.
 */
export function createNewRelicErrorLogger (): BoilerLogger {
  return createBoilerLogger({ levels: ['error'], forward: newRelicLogForward() });
}
