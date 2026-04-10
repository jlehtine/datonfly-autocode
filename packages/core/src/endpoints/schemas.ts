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

// ─── Revision wire format ───

/** Wire schema for a revision as serialized over JSON. */
export const revisionWireSchema = z.object({
    id: z.string(),
    workspaceId: z.string(),
    gitTag: z.string(),
    commitSha: z.string(),
    artifactDigest: z.string().nullable().optional(),
    buildStatus: z.enum(["pending", "building", "succeeded", "failed"]),
    originCodegenJobId: z.string().nullable().optional(),
    parentRevisionId: z.string().nullable().optional(),
    isBaseline: z.boolean(),
    createdAt: z.string().transform((s) => new Date(s)),
});

/** A revision parsed from its JSON wire representation. */
export type RevisionWire = z.infer<typeof revisionWireSchema>;

// ─── Deployment wire format ───

/** Wire schema for a deployment as serialized over JSON. */
export const deploymentWireSchema = z.object({
    id: z.string(),
    workspaceId: z.string(),
    revisionId: z.string(),
    status: z.enum(["pending", "deploying", "healthy", "unhealthy", "superseded", "stopped"]),
    supersededDeploymentId: z.string().nullable().optional(),
    createdAt: z.string().transform((s) => new Date(s)),
    healthyAt: z
        .string()
        .transform((s) => new Date(s))
        .nullable()
        .optional(),
});

/** A deployment parsed from its JSON wire representation. */
export type DeploymentWire = z.infer<typeof deploymentWireSchema>;

// ─── Responses ───

/**
 * Response from starting a session: the started {@link SessionWire} together
 * with the reachable base URL of its App Runtime workload, which the Shell
 * points the application `<iframe>` at. The routing URL is carried on the
 * response (not the persisted `Session` entity) because it is a property of the
 * currently running workload, not of the durable session.
 */
export const startSessionResponseSchema = z.object({
    session: sessionWireSchema,
    appRuntimeUrl: z.string(),
});

/** Response from starting a session. */
export type StartSessionResponse = z.infer<typeof startSessionResponseSchema>;

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
