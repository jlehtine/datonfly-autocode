export {
    API_PREFIX,
    WS_PATH,
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
} from "./paths.js";

export type {
    WorkspaceWire,
    SessionWire,
    ProvisionWorkspaceRequest,
    StartSessionRequest,
    RecoveryRequest,
    OperateDispatchRequest,
    OperateDispatchResponse,
} from "./schemas.js";
export {
    workspaceWireSchema,
    sessionWireSchema,
    provisionWorkspaceRequestSchema,
    startSessionRequestSchema,
    recoveryRequestSchema,
    operateDispatchRequestSchema,
    operateDispatchResponseSchema,
} from "./schemas.js";
