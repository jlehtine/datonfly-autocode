/**
 * Machine-readable status code emitted during long-running framework operations
 * (session start, codegen, build, deploy, recovery), surfaced to the Shell for
 * progress display.
 */
export type StatusCode =
    | "session_starting"
    | "sandbox_provisioning"
    | "codegen_planning"
    | "codegen_committing"
    | "building"
    | "deploying"
    | "health_checking"
    | "recovering"
    | "unspecified";

/** Runtime constant mapping each {@link StatusCode} to itself, useful for autocomplete and iteration. */
export const STATUS_CODES = {
    session_starting: "session_starting",
    sandbox_provisioning: "sandbox_provisioning",
    codegen_planning: "codegen_planning",
    codegen_committing: "codegen_committing",
    building: "building",
    deploying: "deploying",
    health_checking: "health_checking",
    recovering: "recovering",
    unspecified: "unspecified",
} as const satisfies Record<StatusCode, StatusCode>;
