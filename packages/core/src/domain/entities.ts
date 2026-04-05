import type {
    BuildStatus,
    CodegenJobKind,
    CodegenJobStatus,
    DeploymentStatus,
    RecoveryState,
    SessionStatus,
} from "./enums.js";
import type {
    ApplicationId,
    CodegenJobId,
    DeploymentId,
    OperateActionId,
    RevisionId,
    SessionId,
    TenantId,
    UserId,
    WorkspaceId,
} from "./ids.js";
import type { LibraryCoordinates, RepoCoordinates, ResourceLimits, TemplateRepoCoordinates } from "./values.js";

/**
 * A vendor organization that owns one or more {@link Application}s. The tenancy
 * root for billing, entitlements, and administration.
 */
export interface Tenant {
    /** Unique tenant identifier. */
    id: TenantId;
    /** Human-readable organization name. */
    name: string;
    /** Timestamp when the tenant was registered. */
    createdAt: Date;
}

/**
 * The authoritative vendor application a workspace is derived from.
 *
 * Identifies the base UI library, vendor backend endpoints, hook contract
 * version, registry policy, and the application template repository. Shared by
 * all users of the application; it owns no end-user data (that lives in vendor
 * services).
 */
export interface Application {
    /** Unique application identifier. */
    id: ApplicationId;
    /** Owning {@link Tenant}. */
    tenantId: TenantId;
    /** Human-readable application name. */
    name: string;
    /** Stable, URL-safe slug used in routes and resource names. */
    slug: string;
    /** Coordinates of the vendor UI base library workspaces extend. */
    baseLibrary: LibraryCoordinates;
    /** The per-application template repository new workspaces are cloned from. */
    templateRepo: TemplateRepoCoordinates;
    /** Hook contract version generated code for this application targets. */
    hookContractVersion: string;
    /** Timestamp when the application was registered. */
    createdAt: Date;
    /** Timestamp of the last application-level change. */
    updatedAt: Date;
}

/**
 * The per-user customization of an {@link Application}: the tenancy boundary
 * tying a user to their Git repository, Kubernetes namespace, current
 * {@link Revision}, and active {@link Deployment}.
 *
 * Created by cloning the application template repository — an unmodified clone
 * is the vanilla baseline — with the template kept as `upstream`. The root
 * aggregate for one user's variant; complete teardown maps to deleting the
 * workspace.
 */
export interface UserWorkspace {
    /** Unique workspace identifier. */
    id: WorkspaceId;
    /** The {@link Application} this workspace customizes. */
    applicationId: ApplicationId;
    /** The end user who owns the workspace. */
    ownerId: UserId;
    /** Kubernetes namespace allocated to this workspace's runtime workloads. */
    namespace: string;
    /** Per-user repository cloned from the application template repository. */
    repo: RepoCoordinates;
    /** Template version the workspace was created from / last upgraded to. */
    templateVersion: string;
    /** Current (most recently integrated) revision, or `undefined` at creation. */
    currentRevisionId?: RevisionId | undefined;
    /** Active deployment serving the workspace, or `undefined` when stopped. */
    activeDeploymentId?: DeploymentId | undefined;
    /** Resource ceiling applied to the workspace's runtime workloads. */
    resourceLimits: ResourceLimits;
    /** Timestamp when the workspace was provisioned. */
    createdAt: Date;
    /** Timestamp of the last workspace-level change. */
    updatedAt: Date;
}

/**
 * An immutable, versioned snapshot of a workspace's generated code,
 * corresponding to a Git tag plus the build artifact digest. The unit of
 * rollback: revert restores a prior revision, rebuilds, and redeploys it.
 */
export interface Revision {
    /** Unique revision identifier. */
    id: RevisionId;
    /** Workspace the revision belongs to. */
    workspaceId: WorkspaceId;
    /** Git tag naming this revision in the workspace repository. */
    gitTag: string;
    /** Commit SHA the tag points at. */
    commitSha: string;
    /** Build artifact digest, or `undefined` until a successful build. */
    artifactDigest?: string | undefined;
    /** Build outcome of the revision. */
    buildStatus: BuildStatus;
    /** Codegen job that produced the revision, or `undefined` for the baseline. */
    originCodegenJobId?: CodegenJobId | undefined;
    /** Parent revision this one was derived from, or `undefined` for the baseline. */
    parentRevisionId?: RevisionId | undefined;
    /** Whether this is the vanilla baseline (the unmodified template clone). */
    isBaseline: boolean;
    /** Timestamp when the revision was created. */
    createdAt: Date;
}

/**
 * A running instance of a specific {@link Revision} in the user's App Runtime
 * pod. A new deployment replaces the previous one only after passing the health
 * gate, so an unhealthy deploy never displaces a working one.
 */
export interface Deployment {
    /** Unique deployment identifier. */
    id: DeploymentId;
    /** Workspace the deployment belongs to. */
    workspaceId: WorkspaceId;
    /** Revision being served. */
    revisionId: RevisionId;
    /** Lifecycle state, including the health-gate outcome. */
    status: DeploymentStatus;
    /** Deployment this one superseded after passing the health gate, if any. */
    supersededDeploymentId?: DeploymentId | undefined;
    /** Timestamp when the deployment was created. */
    createdAt: Date;
    /** Timestamp when the deployment last became healthy, if it did. */
    healthyAt?: Date | undefined;
}

/**
 * An active end-user interaction with a workspace. Drives the on-demand
 * lifecycle (start the App Runtime on begin, scale to zero on expiry/idle) and
 * links the Shell to the correct {@link Deployment}.
 */
export interface Session {
    /** Unique session identifier. */
    id: SessionId;
    /** Workspace the session operates on. */
    workspaceId: WorkspaceId;
    /** The end user driving the session. */
    userId: UserId;
    /** Lifecycle state of the session. */
    status: SessionStatus;
    /** Current recovery state of the workspace's variant within this session. */
    recoveryState: RecoveryState;
    /** Deployment the Shell is currently routed to, or `undefined` while starting. */
    deploymentId?: DeploymentId | undefined;
    /** Timestamp when the session started. */
    startedAt: Date;
    /** Timestamp of the last activity, used for idle/expiry decisions. */
    lastActivityAt: Date;
    /** Timestamp when the session expired, or `undefined` while live. */
    expiredAt?: Date | undefined;
}

/**
 * One Generate or repair run: prompt and curated context in; planned diff →
 * commit(s) → build → deploy out. Executes in an ephemeral codegen sandbox and,
 * on success, is the provenance of the {@link Revision} it produced.
 */
export interface CodegenJob {
    /** Unique codegen job identifier. */
    id: CodegenJobId;
    /** Workspace the job runs against. */
    workspaceId: WorkspaceId;
    /** Session that initiated the job, or `undefined` for system-initiated jobs. */
    sessionId?: SessionId | undefined;
    /** Whether this is a fresh Generate or a repair of a prior failure. */
    kind: CodegenJobKind;
    /** Natural-language prompt that initiated the job. */
    prompt: string;
    /** Git branch the job runs on before integration. */
    branch: string;
    /** Lifecycle state of the job. */
    status: CodegenJobStatus;
    /** Revision produced on success, or `undefined` while running / on failure. */
    producedRevisionId?: RevisionId | undefined;
    /** For repair jobs, the revision whose failure is being repaired. */
    repairTargetRevisionId?: RevisionId | undefined;
    /** Timestamp when the job was created. */
    createdAt: Date;
    /** Timestamp when the job reached a terminal state, if it has. */
    completedAt?: Date | undefined;
}

/**
 * A record of an Operate invocation: the assistant driving existing application
 * functionality via a typed Operate tool. No code is generated — distinct from
 * a {@link CodegenJob}.
 */
export interface OperateAction {
    /** Unique operate-action identifier. */
    id: OperateActionId;
    /** Workspace the action targeted. */
    workspaceId: WorkspaceId;
    /** Session that dispatched the action. */
    sessionId: SessionId;
    /** Name of the Operate tool invoked. */
    toolName: string;
    /** Validated parameters passed to the tool. */
    parameters: Record<string, unknown>;
    /** Timestamp when the action was dispatched. */
    dispatchedAt: Date;
}
