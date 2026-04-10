/**
 * Public API of `@datonfly-autocode/app-sdk`.
 *
 * The application-side runtime that binds a per-user application to the
 * framework contracts in `@datonfly-autocode/core`: the Shell bridge client, the
 * extension-hook and Operate registries, and the root bootstrap.
 */

// Shell bridge client
export type {
    BridgeClient,
    BridgeClientOptions,
    BridgeMessageSource,
    BridgeRuntimeError,
    BridgeTargetWindow,
    OperateResultPayload,
} from "./bridge/client.js";
export { createBridgeClient } from "./bridge/client.js";

// Extension hook registry
export type { HookRegistry } from "./hooks/registry.js";
export { createHookRegistry } from "./hooks/registry.js";

// Operate registry
export type { OperateDispatchResult, OperateHandler, OperateRegistry } from "./operate/registry.js";
export { createOperateRegistry } from "./operate/registry.js";

// Root bootstrap
export type { BootstrapHandle, BootstrapOptions } from "./root/bootstrap.js";
export { bootstrap } from "./root/bootstrap.js";
