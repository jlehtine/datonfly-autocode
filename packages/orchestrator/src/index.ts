// Public contract surface for @datonfly-autocode/orchestrator.
//
// An in-memory implementation of the core Orchestrator that drives a pluggable
// SandboxProvider through the session lifecycle and emits control-plane events.

export { createOrchestrator } from "./orchestrator.js";
export { NoCodegenProviderError } from "./orchestrator.js";
export type { ControlPlaneEventSink, InMemoryOrchestrator, OrchestratorOptions } from "./orchestrator.js";
