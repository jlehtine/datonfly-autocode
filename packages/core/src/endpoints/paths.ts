/** Unique path prefix for all Datonfly Autocode control-plane endpoints. */
export const API_PREFIX = "/datonfly-autocode";

/** Socket.io transport path for control-plane events. */
export const WS_PATH = `${API_PREFIX}/socket.io`;

/** Path for the applications collection. */
export const APPLICATIONS_PATH = `${API_PREFIX}/applications`;

/** Path for a single application by id. */
export function applicationPath(applicationId: string): string {
    return `${APPLICATIONS_PATH}/${applicationId}`;
}

/** Path for the workspaces collection. */
export const WORKSPACES_PATH = `${API_PREFIX}/workspaces`;

/** Path for a single workspace by id. */
export function workspacePath(workspaceId: string): string {
    return `${WORKSPACES_PATH}/${workspaceId}`;
}

/** Path for a workspace's revisions. */
export function workspaceRevisionsPath(workspaceId: string): string {
    return `${WORKSPACES_PATH}/${workspaceId}/revisions`;
}

/** Path for a workspace's deployments. */
export function workspaceDeploymentsPath(workspaceId: string): string {
    return `${WORKSPACES_PATH}/${workspaceId}/deployments`;
}

/** Path for a workspace's template-upgrade operation. */
export function workspaceTemplateUpgradePath(workspaceId: string): string {
    return `${WORKSPACES_PATH}/${workspaceId}/template-upgrade`;
}

/** Path for the sessions collection. */
export const SESSIONS_PATH = `${API_PREFIX}/sessions`;

/** Path for a single session by id. */
export function sessionPath(sessionId: string): string {
    return `${SESSIONS_PATH}/${sessionId}`;
}

/** Path for a session's recovery operations. */
export function sessionRecoveryPath(sessionId: string): string {
    return `${SESSIONS_PATH}/${sessionId}/recovery`;
}

/** Path for the codegen jobs collection. */
export const CODEGEN_JOBS_PATH = `${API_PREFIX}/codegen-jobs`;

/** Path for a single codegen job by id. */
export function codegenJobPath(jobId: string): string {
    return `${CODEGEN_JOBS_PATH}/${jobId}`;
}

/** Path for the Operate dispatch endpoint within a session. */
export function sessionOperatePath(sessionId: string): string {
    return `${SESSIONS_PATH}/${sessionId}/operate`;
}
