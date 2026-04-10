// Public contract surface for @datonfly-autocode/core.
//
// Stack-neutral contracts — domain model, provider interfaces, wire schemas,
// and the application-facing contracts (extension hooks, Operate tools, the
// Shell <-> application bridge) — are defined under src/ and re-exported here.

// Domain model
export type {
    TenantId,
    ApplicationId,
    WorkspaceId,
    RevisionId,
    DeploymentId,
    SessionId,
    CodegenJobId,
    OperateActionId,
    UserId,
    BuildStatus,
    DeploymentStatus,
    SessionStatus,
    CodegenJobStatus,
    RecoveryState,
    CodegenJobKind,
    LibraryCoordinates,
    RepoCoordinates,
    TemplateRepoCoordinates,
    ResourceLimits,
    Tenant,
    Application,
    UserWorkspace,
    Revision,
    Deployment,
    Session,
    CodegenJob,
    OperateAction,
} from "./domain/index.js";
export {
    tenantIdSchema,
    applicationIdSchema,
    workspaceIdSchema,
    revisionIdSchema,
    deploymentIdSchema,
    sessionIdSchema,
    codegenJobIdSchema,
    operateActionIdSchema,
    BUILD_STATUSES,
    DEPLOYMENT_STATUSES,
    SESSION_STATUSES,
    CODEGEN_JOB_STATUSES,
    RECOVERY_STATES,
    CODEGEN_JOB_KINDS,
} from "./domain/index.js";

// Error taxonomy, diagnostics, and logging
export type {
    ErrorCode,
    StatusCode,
    FrameworkError,
    DiagnosticSeverity,
    BuildDiagnostic,
    BuildDiagnostics,
    RuntimeDiagnostic,
    RuntimeDiagnostics,
    ProviderLogger,
} from "./types/index.js";
export {
    ERROR_CODES,
    STATUS_CODES,
    DIAGNOSTIC_SEVERITIES,
    formatLoggedError,
    NOOP_PROVIDER_LOGGER,
} from "./types/index.js";

// Provider interfaces
export type {
    Orchestrator,
    StartSessionOptions,
    ProvisionWorkspaceOptions,
    RecoveryChoice,
    SandboxProvider,
    SandboxWorkloadKind,
    EgressRule,
    CreateNamespaceOptions,
    StartWorkloadOptions,
    WorkloadMount,
    WorkloadHandle,
    WorkloadHealth,
    RepoProvider,
    CommitInfo,
    CreateFromTemplateOptions,
    CommitOptions,
    TemplateUpgradeResult,
    BuildProvider,
    BuildArtifact,
    BuildOptions,
    BuildResult,
    RegistryProvider,
    RegistryMode,
    PackageProvenance,
    PolicyDecision,
    CodegenProvider,
} from "./interfaces/index.js";
export { RECOVERY_CHOICES, SANDBOX_WORKLOAD_KINDS, REGISTRY_MODES } from "./interfaces/index.js";

// Extension hooks
export type {
    ExtensionHookKind,
    ExtensionHookBase,
    MenuHook,
    RouteHook,
    PanelHook,
    WidgetHook,
    DataSourceHook,
    ExtensionHook,
} from "./hooks/index.js";
export { HOOK_CONTRACT_VERSION, EXTENSION_HOOK_KINDS } from "./hooks/index.js";

// Operate tools
export type { SideEffectClass, OperateTool, OperateToolParams } from "./operate/index.js";
export { SIDE_EFFECT_CLASSES } from "./operate/index.js";

// Shell ↔ application bridge
export type { AppToShellMessage, ShellToAppMessage } from "./bridge/index.js";
export {
    bridgeRuntimeErrorSchema,
    appReadyMessageSchema,
    appHeartbeatMessageSchema,
    appNavigatedMessageSchema,
    appBuildErrorMessageSchema,
    appRuntimeErrorMessageSchema,
    appOperateResultMessageSchema,
    appToShellMessageSchema,
    shellNavigateMessageSchema,
    shellOperateDispatchMessageSchema,
    shellRecoveryCommandMessageSchema,
    shellToAppMessageSchema,
    parseAppToShellMessage,
    parseShellToAppMessage,
} from "./bridge/index.js";

// Vendor application manifest
export type { VendorAppManifest } from "./manifest/index.js";
export {
    libraryCoordinatesSchema,
    vendorEndpointSchema,
    registryPolicySchema,
    resourceLimitsSchema,
    recoveryOptionsSchema,
    templateRepoSchema,
    vendorAppManifestSchema,
} from "./manifest/index.js";

// Codegen job protocol
export type { CodegenJobRequest, CodegenStep, CodegenStepEvent, CodegenJobResult } from "./dto/index.js";
export {
    codegenJobKindSchema,
    codegenJobRequestSchema,
    codegenStepSchema,
    codegenStepEventSchema,
    codegenJobResultSchema,
} from "./dto/index.js";

// Control-plane endpoints
export {
    API_PREFIX,
    WS_PATH,
    CONTROL_PLANE_EVENT_CHANNEL,
    APPLICATIONS_PATH,
    applicationPath,
    WORKSPACES_PATH,
    workspacePath,
    workspaceRevisionsPath,
    workspaceDeploymentsPath,
    workspaceTemplateUpgradePath,
    SESSIONS_PATH,
    sessionPath,
    sessionRecoveryPath,
    sessionOperatePath,
    CODEGEN_JOBS_PATH,
    codegenJobPath,
} from "./endpoints/index.js";
export type {
    WorkspaceWire,
    SessionWire,
    RevisionWire,
    DeploymentWire,
    StartSessionResponse,
    ProvisionWorkspaceRequest,
    StartSessionRequest,
    RecoveryRequest,
    OperateDispatchRequest,
    OperateDispatchResponse,
} from "./endpoints/index.js";
export {
    workspaceWireSchema,
    sessionWireSchema,
    revisionWireSchema,
    deploymentWireSchema,
    startSessionResponseSchema,
    provisionWorkspaceRequestSchema,
    startSessionRequestSchema,
    recoveryRequestSchema,
    operateDispatchRequestSchema,
    operateDispatchResponseSchema,
} from "./endpoints/index.js";

// Control-plane events
export type { ControlPlaneEvent } from "./events/index.js";
export {
    sessionStateChangedSchema,
    sandboxStateChangedSchema,
    codegenJobProgressSchema,
    recoveryStateChangedSchema,
    deploymentStateChangedSchema,
    controlPlaneEventSchema,
} from "./events/index.js";
