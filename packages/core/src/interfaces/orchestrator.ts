import type { Session } from "../domain/entities.js";
import type { RecoveryState } from "../domain/enums.js";
import type { ApplicationId, RevisionId, SessionId, UserId, WorkspaceId } from "../domain/ids.js";
import type { BuildDiagnostics, RuntimeDiagnostics } from "../types/diagnostics.js";

/** Options for beginning a session against a user's workspace. */
export interface StartSessionOptions {
    /** Workspace to operate on. */
    workspaceId: WorkspaceId;
    /** End user driving the session. */
    userId: UserId;
}

/** Options for provisioning a new per-user workspace for an application. */
export interface ProvisionWorkspaceOptions {
    /** Application the workspace customizes. */
    applicationId: ApplicationId;
    /** End user who will own the workspace. */
    ownerId: UserId;
}

/** A recovery option the user may choose from a failure state. */
export type RecoveryChoice = "auto_repair" | "revert" | "vanilla";

/** Runtime constant mapping each {@link RecoveryChoice} to itself. */
export const RECOVERY_CHOICES = {
    auto_repair: "auto_repair",
    revert: "revert",
    vanilla: "vanilla",
} as const satisfies Record<RecoveryChoice, RecoveryChoice>;

/**
 * Owns session lifecycle and coordinates the other providers.
 *
 * Drives sandbox start/stop, routes the Shell to the correct deployment,
 * enforces entitlements, and runs the recovery state machine. Provider-specific
 * detail stays out of the orchestrator; it composes the pluggable providers.
 */
export interface Orchestrator {
    /** Provision a new per-user workspace from an application template. */
    provisionWorkspace(options: ProvisionWorkspaceOptions): Promise<WorkspaceId>;
    /** Begin a session, starting the App Runtime on demand. */
    startSession(options: StartSessionOptions): Promise<Session>;
    /** End a session, scaling the workspace's App Runtime to zero. */
    endSession(sessionId: SessionId): Promise<void>;
    /** Report a build failure into the recovery machine. */
    reportBuildFailure(sessionId: SessionId, diagnostics: BuildDiagnostics): Promise<RecoveryState>;
    /** Report a runtime failure into the recovery machine. */
    reportRuntimeFailure(sessionId: SessionId, diagnostics: RuntimeDiagnostics): Promise<RecoveryState>;
    /** Apply a user-selected recovery action and return the resulting state. */
    recover(sessionId: SessionId, choice: RecoveryChoice, targetRevisionId?: RevisionId): Promise<RecoveryState>;
}
