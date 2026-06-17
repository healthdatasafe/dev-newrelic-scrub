# Changelog

## [Unreleased]
- Added: initial scrubber — `redactString` (regex layer) + `redact` (deep walk by sensitive field name).
- Added: `createBoilerLogger` — @pryv/boiler custom-logger adapter that redacts before forwarding to a sink.
- Added: `newrelicConfig` — PHI-safe New Relic APM agent config preset (strip exception messages, exclude header/param/body attributes, obfuscate SQL).
