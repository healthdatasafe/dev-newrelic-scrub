/**
 * PHI / secret redaction for any data leaving HDS toward a telemetry sink
 * (New Relic logs, custom events, error traces, …).
 *
 * Two layers:
 *   1. `redactString` — regex pass over rendered text (URL tokens, JWTs, emails…).
 *   2. `redact`       — recursive walk that masks values by sensitive field name,
 *                       and runs `redactString` over every string it meets.
 *
 * Design note: over-redaction is the safe failure mode. This is a defence in
 * depth, NOT a substitute for the primary rule — never log event/stream payloads
 * or request/response bodies on the data path (minimum-necessary by construction).
 */

export interface RedactOptions {
  /** Replacement for masked values. Default `'***'`. */
  placeholder?: string;
  /** Max object depth to walk before collapsing. Default 8. */
  maxDepth?: number;
  /** Extra field-name substrings to treat as sensitive (case-insensitive). */
  extraKeys?: string[];
}

const DEFAULT_PLACEHOLDER = '***';
const DEFAULT_MAX_DEPTH = 8;

/**
 * Field-name substrings whose values are always masked (case-insensitive).
 * Substring match is intentional: `accessToken`, `refreshToken`, `apiToken`
 * all match `token`.
 */
export const SENSITIVE_KEY_PATTERNS: readonly string[] = [
  'password', 'passwd', 'pwd',
  'secret',
  'token',
  'apikey', 'api_key',
  'authorization',
  'cookie',
  'license',
  'privatekey', 'private_key',
  'clientsecret', 'client_secret',
  'credential',
  'connectionstring', 'connection_string',
  'database_url',
  'ssn', 'mrn'
];

/**
 * String rewrite rules, applied in order. Each targets a concrete leak vector.
 * Pryv apiEndpoint URLs embed the auth token as URL userinfo — rule 1 is the
 * single highest-value pattern.
 */
const STRING_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // scheme://TOKEN@host  ->  scheme://***@host   (Pryv apiEndpoint, basic-auth URLs)
  [/(https?:\/\/)[^@/\s]+@/gi, '$1***@'],
  // ?auth=… / &token=… / access_token=… / api_key=… in a query string
  [/([?&](?:auth|token|access_token|apikey|api_key)=)[^&\s#]+/gi, '$1***'],
  // Authorization: Bearer <token>
  [/(bearer\s+)[\w.-]+/gi, '$1***'],
  // JSON Web Tokens (header.payload.signature)
  [/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '***'],
  // Email addresses (HIPAA direct identifier)
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '***']
];

/** Run the regex layer over a single string. */
export function redactString (input: string): string {
  let out = input;
  for (const [re, repl] of STRING_RULES) {
    out = out.replace(re, repl);
  }
  return out;
}

function isSensitiveKey (key: string, extra: string[]): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((p) => k.includes(p)) ||
    extra.some((p) => k.includes(p.toLowerCase()));
}

/**
 * Deep-redact an arbitrary value. Returns a redacted copy — the input is never
 * mutated. Safe against circular references and deeply-nested structures.
 */
export function redact (value: unknown, options: RedactOptions = {}): unknown {
  const placeholder = options.placeholder ?? DEFAULT_PLACEHOLDER;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const extraKeys = options.extraKeys ?? [];
  const seen = new WeakSet<object>();

  function walk (val: unknown, depth: number): unknown {
    if (typeof val === 'string') return redactString(val);
    if (val === null || typeof val !== 'object') return val;
    if (depth >= maxDepth) return '[Truncated]';
    if (seen.has(val)) return '[Circular]';
    seen.add(val);

    if (val instanceof Error) {
      return {
        name: val.name,
        message: redactString(val.message),
        stack: val.stack != null ? redactString(val.stack) : undefined
      };
    }
    if (Array.isArray(val)) {
      return val.map((item) => walk(item, depth + 1));
    }

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k, extraKeys) ? placeholder : walk(v, depth + 1);
    }
    return out;
  }

  return walk(value, 0);
}
