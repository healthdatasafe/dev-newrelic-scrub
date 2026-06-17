# dev-newrelic-scrub

Shared PHI/secret scrubber for any data leaving HDS apps & services toward a
telemetry sink (New Relic logs, custom events, error traces). One redaction
function, imported everywhere, so the rules live in exactly one place.

## Why

Logs/telemetry forwarded to New Relic can contain PHI or auth tokens, which makes
the monitoring provider a subprocessor with ePHI exposure. This package keeps
unredacted PHI and secrets from leaving the box.

**This is defence in depth, not the primary control.** The primary rule is
*don't log payloads on the data path* — never log event/stream bodies or
request/response bodies; log shapes, counts, and non-identifying IDs. A scrubber
cannot catch arbitrary health values; minimum-necessary by construction can.

## What it does

Two layers:

1. **`redactString(text)`** — regex pass over rendered text:
   - `scheme://TOKEN@host` → `scheme://***@host` (Pryv apiEndpoint / basic-auth URLs)
   - `?auth=` / `token=` / `access_token=` / `api_key=` query params
   - `Authorization: Bearer <token>`
   - JWTs (`eyJ….….…`)
   - email addresses (HIPAA direct identifier)
2. **`redact(value, opts?)`** — recursive walk that masks values whose **field
   name** matches a sensitive pattern (`password`, `secret`, `token`, `apiKey`,
   `authorization`, `cookie`, `license`, `clientSecret`, `credential`,
   `database_url`, `ssn`, `mrn`, …) and runs `redactString` over every string it
   meets. Non-mutating, circular-safe, depth-limited.

## Usage

```ts
import { redact, redactString } from 'dev-newrelic-scrub';

redactString('login https://tok@jdoe.demo.datasafe.dev/');
// 'login https://***@jdoe.demo.datasafe.dev/'

redact({ userId: 'u1', accessToken: 'abc', op: 'signin' });
// { userId: 'u1', accessToken: '***', op: 'signin' }
```

### As a @pryv/boiler custom logger (the chokepoint for log forwarding)

boiler calls a custom logger on every log event. Wire this adapter so anything
forwarded off-box is scrubbed first:

```ts
import { createBoilerLogger } from 'dev-newrelic-scrub/boilerLogger';

// settings.logs.custom.path → a module that re-exports init/log from this:
export const { init, log } = createBoilerLogger({
  forward: (entry) => pushToNewRelic(entry) // your sink; default is no-op
});
```

The local winston file/console transports are untouched — only the forward sink
leaves the host, and only the forward sink receives scrubbed data.

## Known limitations

- The **Pryv username** (the apiEndpoint subdomain, e.g. `jdoe` in
  `jdoe.demo.datasafe.dev`) is a direct identifier and is **not** auto-redacted —
  only the auth token is. Services that log endpoints should log a hash/id, not
  the raw endpoint, if the subdomain is sensitive in context.
- This package does **not** configure the New Relic APM agent. Auto-instrumented
  exception messages and request URIs are a separate channel — neutralise them via
  the agent config (`strip_exception_messages.enabled`, `attributes.exclude`,
  `transaction_tracer.record_sql='obfuscated'`). See the plan note.

## Prerequisites

- Node.js >= 24
- npm

## Setup

```
npm run setup
```

## Build

```
npm run build
```
