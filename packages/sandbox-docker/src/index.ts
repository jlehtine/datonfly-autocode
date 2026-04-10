// Public contract surface for @datonfly-autocode/sandbox-docker.
//
// A Docker-backed implementation of the core SandboxProvider, used for local
// development and the Phase 4 proof-of-concept.

export { DockerSandboxProvider, isDockerAvailable } from "./docker-sandbox-provider.js";
export type { DockerSandboxProviderOptions } from "./docker-sandbox-provider.js";
