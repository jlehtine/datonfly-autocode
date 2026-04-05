import { z } from "zod";

/**
 * Branded identifier schemas and types for the framework's domain entities.
 *
 * Each identifier is a UUID at runtime but carries a distinct compile-time
 * brand so that, for example, a {@link RevisionId} cannot be passed where a
 * {@link SessionId} is expected. The Zod schemas double as wire validators for
 * identifiers crossing the control-plane API and the Shell bridge.
 */

/** Schema for a {@link TenantId}. */
export const tenantIdSchema = z.uuid().brand("TenantId");
/** Identifier of a {@link Tenant} (vendor organization). */
export type TenantId = z.infer<typeof tenantIdSchema>;

/** Schema for an {@link ApplicationId}. */
export const applicationIdSchema = z.uuid().brand("ApplicationId");
/** Identifier of an {@link Application}. */
export type ApplicationId = z.infer<typeof applicationIdSchema>;

/** Schema for a {@link WorkspaceId}. */
export const workspaceIdSchema = z.uuid().brand("WorkspaceId");
/** Identifier of a {@link UserWorkspace}. */
export type WorkspaceId = z.infer<typeof workspaceIdSchema>;

/** Schema for a {@link RevisionId}. */
export const revisionIdSchema = z.uuid().brand("RevisionId");
/** Identifier of a {@link Revision}. */
export type RevisionId = z.infer<typeof revisionIdSchema>;

/** Schema for a {@link DeploymentId}. */
export const deploymentIdSchema = z.uuid().brand("DeploymentId");
/** Identifier of a {@link Deployment}. */
export type DeploymentId = z.infer<typeof deploymentIdSchema>;

/** Schema for a {@link SessionId}. */
export const sessionIdSchema = z.uuid().brand("SessionId");
/** Identifier of a {@link Session}. */
export type SessionId = z.infer<typeof sessionIdSchema>;

/** Schema for a {@link CodegenJobId}. */
export const codegenJobIdSchema = z.uuid().brand("CodegenJobId");
/** Identifier of a {@link CodegenJob}. */
export type CodegenJobId = z.infer<typeof codegenJobIdSchema>;

/** Schema for an {@link OperateActionId}. */
export const operateActionIdSchema = z.uuid().brand("OperateActionId");
/** Identifier of an {@link OperateAction}. */
export type OperateActionId = z.infer<typeof operateActionIdSchema>;

/** Identifier of the end user who owns a workspace and drives sessions. */
export type UserId = string;
