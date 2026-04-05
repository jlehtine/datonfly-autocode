/**
 * Status enumerations for the framework's domain entities.
 *
 * Each enumeration is declared as a string-literal union plus a runtime
 * constant object mapping every member to itself, following the
 * `datonfly-assistant` `STATUS_CODES`/`ERROR_CODES` convention so the values
 * are usable for autocomplete, iteration, and Zod `z.enum` derivation.
 */

/** Build outcome of a {@link Revision}. */
export type BuildStatus = "pending" | "building" | "succeeded" | "failed";

/** Runtime constant mapping each {@link BuildStatus} to itself. */
export const BUILD_STATUSES = {
    pending: "pending",
    building: "building",
    succeeded: "succeeded",
    failed: "failed",
} as const satisfies Record<BuildStatus, BuildStatus>;

/** Lifecycle state of a {@link Deployment} of a built {@link Revision}. */
export type DeploymentStatus = "pending" | "deploying" | "healthy" | "unhealthy" | "superseded" | "stopped";

/** Runtime constant mapping each {@link DeploymentStatus} to itself. */
export const DEPLOYMENT_STATUSES = {
    pending: "pending",
    deploying: "deploying",
    healthy: "healthy",
    unhealthy: "unhealthy",
    superseded: "superseded",
    stopped: "stopped",
} as const satisfies Record<DeploymentStatus, DeploymentStatus>;

/** Lifecycle state of a {@link Session}. */
export type SessionStatus = "starting" | "active" | "idle" | "expired";

/** Runtime constant mapping each {@link SessionStatus} to itself. */
export const SESSION_STATUSES = {
    starting: "starting",
    active: "active",
    idle: "idle",
    expired: "expired",
} as const satisfies Record<SessionStatus, SessionStatus>;

/** Lifecycle state of a {@link CodegenJob}. */
export type CodegenJobStatus = "queued" | "planning" | "committing" | "building" | "deploying" | "succeeded" | "failed";

/** Runtime constant mapping each {@link CodegenJobStatus} to itself. */
export const CODEGEN_JOB_STATUSES = {
    queued: "queued",
    planning: "planning",
    committing: "committing",
    building: "building",
    deploying: "deploying",
    succeeded: "succeeded",
    failed: "failed",
} as const satisfies Record<CodegenJobStatus, CodegenJobStatus>;

/**
 * State of the recovery machine for a workspace's current variant.
 *
 * `vanilla` → `building` → `deployed` / `build_failed`, with `runtime_failed`
 * reachable from `deployed`, and `recovered` as the resolution of a failure.
 */
export type RecoveryState = "vanilla" | "building" | "deployed" | "build_failed" | "runtime_failed" | "recovered";

/** Runtime constant mapping each {@link RecoveryState} to itself. */
export const RECOVERY_STATES = {
    vanilla: "vanilla",
    building: "building",
    deployed: "deployed",
    build_failed: "build_failed",
    runtime_failed: "runtime_failed",
    recovered: "recovered",
} as const satisfies Record<RecoveryState, RecoveryState>;

/** Whether a {@link CodegenJob} is a fresh Generate or a repair of a prior failure. */
export type CodegenJobKind = "generate" | "repair";

/** Runtime constant mapping each {@link CodegenJobKind} to itself. */
export const CODEGEN_JOB_KINDS = {
    generate: "generate",
    repair: "repair",
} as const satisfies Record<CodegenJobKind, CodegenJobKind>;
