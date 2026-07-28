# Changelog

## [Unreleased]
- **Changed (security): `newrelicConfig` hardened to match the posture pryv shipped in [pryv/open-pryv.io#116](https://github.com/pryv/open-pryv.io/issues/116).** Newly excluded: `request.uri`, `http.url`, `request.headers.host`, `request.headers.referer`, `request.headers.userAgent`. The URL is a first-class identifier channel on these APIs (usernames, event ids, attachment ids), and `host` carries the username as a subdomain in DNS-ful topologies.
- **Fixed (security): `request.headers.x-*` matched nothing.** The agent camel-cases multi-word header names, so a hyphenated exclusion fails **silently**. Corrected to `request.headers.x*`. Low impact in practice (`allow_all_headers: false` limits collection), but the same class of defect is what let usernames reach the vendor upstream.
- Added: `url_obfuscation` masking whole outbound paths (`^/.*` → `*`) in external segment/span **names**, the one surface attribute exclusion cannot reach. Shape-matching patterns are not sufficient: attachment filenames, user-chosen stream ids and webhook path segments all survive them.
- Changed: `transaction_tracer.record_sql` `obfuscated` → `off`. Obfuscation masks literals but still ships the statement shape.
- Added: custom events and custom attributes disabled (`custom_insights_events`, `api.custom_*`) so they cannot become an accidental channel.
- **Changed (tests): the config suite now asks the agent's own `AttributeFilter` for its resolved decision** instead of asserting the contents of our exported list. A list assertion is structurally incapable of catching a misspelled exclusion. Includes a guard test proving a hyphenated exclusion does *not* exclude the camelCased attribute. `newrelic` added as a devDependency for this.
- Note: this preset is a **deny-list**, and pryv is replacing the equivalent with an allow-list emitter over OTLP because any agent upgrade can silently widen the collected surface. Treat it as defense-in-depth; do not deepen it further without revisiting that decision. What remains after it is pseudonymous, not anonymous, so a BAA/DPA with the APM vendor is still required.

- Added: initial scrubber — `redactString` (regex layer) + `redact` (deep walk by sensitive field name).
- Added: `createBoilerLogger` — @pryv/boiler custom-logger adapter that redacts before forwarding to a sink.
- Added: `newrelicConfig` — PHI-safe New Relic APM agent config preset (strip exception messages, exclude header/param/body attributes, obfuscate SQL).
- Added: error-only NR log forwarding — `createBoilerLogger({ levels })` filter, `newRelicLogForward`, `createNewRelicErrorLogger`, and the `dev-newrelic-scrub/nrErrorLogger` boiler custom-logger module. `newrelicConfig` now keeps `forwarding` on (for `recordLogEvent`) but disables winston auto-instrumentation, so only error-level logs reach NR.
