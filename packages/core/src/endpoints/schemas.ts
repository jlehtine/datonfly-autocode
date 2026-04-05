import { z } from "zod";

/**
 * Request/response Zod schemas for the control-plane REST API the Shell and
 * sandboxes call. Entity wire schemas serialize dates as ISO strings and parse
 * them back to {@link Date}, mirroring the `datonfly-assistant` convention.
 */

// ─── Workspace wire format ───

/** Wire schema for a workspace as serialized over JSON. */
export const workspaceWireSchema = z.object({
    id: z.string(),
    applicationId: z.string(),
    ownerId: z.string(),
    namespace: z.string(),
    templateVersion: z.string(),
    currentRevisionId: z.string().nullable().optional(),
    activeDeploymentId: z.string().nullable().optional(),
    createdAt: z.string().transform((s) => new Date(s)),
    updatedAt: z.string().transform((s) => new Date(s)),
});

/** A workspace parsed from its JSON wire representation. */
export type WorkspaceWire = z.infer<typeof workspaceWireSchema>;

// ─── Session wire format ───

/** Wire schema for a session as serialized over JSON. */
export const sessionWireSchema = z.object({
    id: z.string(),
    workspaceId: z.string(),
    userId: z.string(),
    status: z.enum(["starting", "active", "idle", "expired"]),
    recoveryState: z.enum(["vanilla", "building", "deployed", "build_failed", "runtime_failed", "recovered"]),
    deploymentId: z.string().nullable().optional(),
    startedAt: z.string().transform((s) => new Date(s)),
    lastActivityAt: z.string().transform((s) => new Date(s)),
});

/** A session parsed from its JSON wire representation. */
export type SessionWire = z.infer<typeof sessionWireSchema>;

// ─── Requests ───

/** Body for provisioning a new per-user workspace. */
export const provisionWorkspaceRequestSchema = z.object({
    applicationId: z.uuid(),
    ownerId: z.string(),
});

/** Body for provisioning a new per-user workspace. */
export type ProvisionWorkspaceRequest = z.infer<typeof provisionWorkspaceRequestSchema>;

/** Body for starting a session. */
export const startSessionRequestSchema = z.object({
    workspaceId: z.uuid(),
});

/** Body for starting a session. */
export type StartSessionRequest = z.infer<typeof startSessionRequestSchema>;

/** Body for applying a recovery action to a session. */
export const recoveryRequestSchema = z.object({
    choice: z.enum(["auto_repair", "revert", "vanilla"]),
    targetRevisionId: z.uuid().optional(),
});

/** Body for applying a recovery action to a session. */
export type RecoveryRequest = z.infer<typeof recoveryRequestSchema>;

/** Body for dispatching an Operate tool within a session. */
export const operateDispatchRequestSchema = z.object({
    toolName: z.string(),
    parameters: z.record(z.string(), z.unknown()),
});

/** Body for dispatching an Operate tool within a session. */
export type OperateDispatchRequest = z.infer<typeof operateDispatchRequestSchema>;

/** Response from dispatching an Operate tool. */
export const operateDispatchResponseSchema = z.object({
    ok: z.boolean(),
    result: z.unknown().optional(),
    error: z.string().optional(),
});

/** Response from dispatching an Operate tool. */
export type OperateDispatchResponse = z.infer<typeof operateDispatchResponseSchema>;
