import { z } from "zod";

/**
 * WebSocket event payload schemas broadcast by the control plane to the Shell:
 * session, sandbox, codegen-job, and recovery state changes. Each event is a
 * discriminated union member keyed by `event`.
 */

/** A session changed lifecycle state. */
export const sessionStateChangedSchema = z.object({
    event: z.literal("session-state-changed"),
    sessionId: z.string(),
    status: z.enum(["starting", "active", "idle", "expired"]),
});

/** A workspace's sandbox workload changed state. */
export const sandboxStateChangedSchema = z.object({
    event: z.literal("sandbox-state-changed"),
    workspaceId: z.string(),
    kind: z.enum(["app-runtime", "codegen"]),
    state: z.enum(["provisioning", "running", "scaled-to-zero", "stopped"]),
});

/** A codegen job advanced through one of its steps. */
export const codegenJobProgressSchema = z.object({
    event: z.literal("codegen-job-progress"),
    jobId: z.string(),
    step: z.enum(["planned-diff", "commit", "build", "deploy"]),
    phase: z.enum(["started", "completed"]),
    ok: z.boolean().optional(),
});

/** The recovery state machine transitioned. */
export const recoveryStateChangedSchema = z.object({
    event: z.literal("recovery-state-changed"),
    sessionId: z.string(),
    state: z.enum(["vanilla", "building", "deployed", "build_failed", "runtime_failed", "recovered"]),
});

/** Discriminated union of all control-plane → Shell events. */
export const controlPlaneEventSchema = z.discriminatedUnion("event", [
    sessionStateChangedSchema,
    sandboxStateChangedSchema,
    codegenJobProgressSchema,
    recoveryStateChangedSchema,
]);

/** Any event broadcast by the control plane to the Shell. */
export type ControlPlaneEvent = z.infer<typeof controlPlaneEventSchema>;
