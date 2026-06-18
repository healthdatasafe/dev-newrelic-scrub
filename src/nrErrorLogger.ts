/**
 * Ready-to-use boiler custom-logger module: forwards only error-level logs to
 * New Relic, scrubbed. Wire it in a service's boiler config:
 *
 *   logs:
 *     custom:
 *       active: true
 *       path: dev-newrelic-scrub/nrErrorLogger
 *
 * boiler `require()`s this path and calls `.init()` then `.log(...)` on every
 * log event.
 */
import { createNewRelicErrorLogger } from './newrelicForward.ts';

const logger = createNewRelicErrorLogger();

export const init = logger.init;
export const log = logger.log;
