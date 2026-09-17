/**
 * dev-boiler custom-logger adapter.
 *
 * boiler calls a custom logger (registered via the `logs:custom:path` config key)
 * on EVERY log event: `log(level, key, message, context)` — see
 * `dev-boiler/src/logging.js`. That makes it the single chokepoint for anything
 * forwarded off-box (e.g. to New Relic). This adapter scrubs the message + context
 * through `redact` BEFORE handing the entry to a forward sink.
 *
 * The local winston file/console transports are unaffected — they stay on the HDS
 * host and are not the subprocessor exposure. Only the forward sink leaves the box,
 * and only the forward sink receives scrubbed data.
 */
import { redact, redactString, type RedactOptions } from './redact.ts';

export interface RedactedLogEntry {
  level: string;
  key: string;
  message: string;
  context?: unknown;
}

export interface BoilerLogger {
  init: (settings?: unknown) => Promise<void>;
  log: (level: string, key: string, message: string, context?: unknown) => void;
}

export interface BoilerLoggerOptions {
  /**
   * Sink for scrubbed entries (e.g. push to New Relic). Defaults to a no-op so
   * the adapter is safe to wire before a real forwarder exists.
   */
  forward?: (entry: RedactedLogEntry) => void;
  redactOptions?: RedactOptions;
  /**
   * If set, only these log levels are forwarded to the sink (e.g. `['error']`
   * to keep info/warn/debug out of New Relic). Local file/console transports are
   * unaffected — they still get every level. Default: forward all levels.
   */
  levels?: string[];
}

/**
 * Build a boiler custom-logger that redacts before forwarding.
 * Use as `logs:custom:path` target (re-export `init`/`log` from a small module)
 * or call directly in tests.
 */
export function createBoilerLogger (options: BoilerLoggerOptions = {}): BoilerLogger {
  const forward = options.forward ?? (() => {});
  const levels = options.levels;
  return {
    async init (_settings?: unknown): Promise<void> {
      // No async setup needed for the redacting pass-through. A real forwarder
      // (NR client init, etc.) would establish its connection here.
    },
    log (level: string, key: string, message: string, context?: unknown): void {
      if (levels && !levels.includes(level)) return;
      forward({
        level,
        key,
        message: redactString(String(message ?? '')),
        context: context === undefined ? undefined : redact(context, options.redactOptions)
      });
    }
  };
}
