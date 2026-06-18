# Changelog

## [Unreleased]
- Added: initial scrubber — `redactString` (regex layer) + `redact` (deep walk by sensitive field name).
- Added: `createBoilerLogger` — @pryv/boiler custom-logger adapter that redacts before forwarding to a sink.
- Added: `newrelicConfig` — PHI-safe New Relic APM agent config preset (strip exception messages, exclude header/param/body attributes, obfuscate SQL).
- Added: error-only NR log forwarding — `createBoilerLogger({ levels })` filter, `newRelicLogForward`, `createNewRelicErrorLogger`, and the `dev-newrelic-scrub/nrErrorLogger` boiler custom-logger module. `newrelicConfig` now keeps `forwarding` on (for `recordLogEvent`) but disables winston auto-instrumentation, so only error-level logs reach NR.
