/**
 * The only module allowed to import `@earendil-works/pi-agent-core`.
 * Kernel and apps talk to runtime; they do not import this package.
 */
export * from "@earendil-works/pi-agent-core";
export { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
export { reduceLaneSnapshot } from "@earendil-works/pi-agent-core/harness/runtime/reducer";

import * as piAgentCore from "@earendil-works/pi-agent-core";

/** Namespace object injected into user extensions as `@earendil-works/pi-agent-core`. */
export { piAgentCore };
