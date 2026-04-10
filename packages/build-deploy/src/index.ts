// Public contract surface for @datonfly-autocode/build-deploy.
//
// A host-based build provider plus a static-server deploy helper used by the
// Phase 5 real build/deploy slice.

export { computeDistDigest, digestFiles } from "./digest.js";
export type { DistFile } from "./digest.js";
export { deployArtifact, STATIC_SERVER_IMAGE, STATIC_SERVER_ROOT } from "./deploy.js";
export type { DeployArtifactOptions, DeployArtifactResult } from "./deploy.js";
export { HostBuildProvider } from "./host-build-provider.js";
export type { HostBuildProviderOptions } from "./host-build-provider.js";
