import { randomUUID } from "node:crypto";

import {
    deploymentIdSchema,
    formatLoggedError,
    NOOP_PROVIDER_LOGGER,
    revisionIdSchema,
    sessionIdSchema,
    workspaceIdSchema,
    type ControlPlaneEvent,
    type Deployment,
    type Orchestrator,
    type ProviderLogger,
    type ProvisionWorkspaceOptions,
    type RecoveryChoice,
    type RecoveryState,
    type ResourceLimits,
    type SandboxProvider,
    type Session,
    type SessionId,
    type StartSessionOptions,
    type UserWorkspace,
    type WorkloadHandle,
    type WorkspaceId,
} from "@datonfly-autocode/core";

/** Stub App Runtime image used until real build/deploy lands; proves lifecycle only. */
const DEFAULT_APP_RUNTIME_IMAGE = "traefik/whoami";

/** Default resource ceiling recorded on provisioned workspaces (advisory this slice). */
const DEFAULT_RESOURCE_LIMITS: ResourceLimits = { cpu: "500m", memory: "256Mi" };

/** Sink the orchestrator pushes control-plane events into for fan-out to the Shell. */
export type ControlPlaneEventSink = (event: ControlPlaneEvent) => void;

/** Options for {@link createOrchestrator}. */
export interface OrchestratorOptions {
    /** Sandbox provider the orchestrator drives (Docker in this slice). */
    sandbox: SandboxProvider;
    /** Sink for control-plane events emitted during lifecycle transitions. */
    emit: ControlPlaneEventSink;
    /** Image the App Runtime workload runs; defaults to a stub web server. */
    appRuntimeImage?: string;
    /** Resource ceiling recorded on provisioned workspaces. */
    resourceLimits?: ResourceLimits;
    /** Number of health probes before the App Runtime start is considered failed. */
    healthGateAttempts?: number;
    /** Delay between health probes, in milliseconds. */
    healthGateIntervalMs?: number;
    /** Structured logger; defaults to a no-op logger. */
    logger?: ProviderLogger;
}

/**
 * An {@link Orchestrator} backed by an in-memory store, exposing the read
 * accessors the control-plane REST/WS layer needs on top of the core lifecycle.
 */
export interface InMemoryOrchestrator extends Orchestrator {
    /** All provisioned workspaces. */
    listWorkspaces(): UserWorkspace[];
    /** A workspace by id, if it exists. */
    getWorkspace(workspaceId: WorkspaceId): UserWorkspace | undefined;
    /** A session by id, if it exists. */
    getSession(sessionId: SessionId): Session | undefined;
    /** The reachable App Runtime URL for an active session, if any. */
    getAppRuntimeUrl(sessionId: SessionId): string | undefined;
}

/** In-memory control-plane state for a single orchestrator instance. */
interface Store {
    workspaces: Map<WorkspaceId, UserWorkspace>;
    sessions: Map<SessionId, Session>;
    deployments: Map<string, Deployment>;
    /** Live sandbox handle per session, used to stop the workload on end. */
    handles: Map<SessionId, WorkloadHandle>;
    /** Reachable App Runtime URL per session. */
    appRuntimeUrls: Map<SessionId, string>;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * Create an in-memory {@link Orchestrator} driving the given
 * {@link SandboxProvider}.
 *
 * This slice keeps all control-plane state in memory and runs a stub App Runtime
 * container; there is no real build, codegen, or persistence. Session start
 * provisions a namespace, starts the App Runtime, gates on health, and links a
 * synthetic healthy {@link Deployment}; the recovery methods perform state-machine
 * transitions and emit events only.
 */
export function createOrchestrator(options: OrchestratorOptions): InMemoryOrchestrator {
    const sandbox = options.sandbox;
    const emit = options.emit;
    const appRuntimeImage = options.appRuntimeImage ?? DEFAULT_APP_RUNTIME_IMAGE;
    const resourceLimits = options.resourceLimits ?? DEFAULT_RESOURCE_LIMITS;
    const healthGateAttempts = options.healthGateAttempts ?? 30;
    const healthGateIntervalMs = options.healthGateIntervalMs ?? 500;
    const logger = options.logger ?? NOOP_PROVIDER_LOGGER;

    const store: Store = {
        workspaces: new Map(),
        sessions: new Map(),
        deployments: new Map(),
        handles: new Map(),
        appRuntimeUrls: new Map(),
    };

    function newWorkspaceId(): WorkspaceId {
        return workspaceIdSchema.parse(randomUUID());
    }

    function requireSession(sessionId: SessionId): Session {
        const session = store.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Unknown session ${sessionId}`);
        }
        return session;
    }

    function setRecoveryState(sessionId: SessionId, state: RecoveryState): RecoveryState {
        const session = requireSession(sessionId);
        store.sessions.set(sessionId, { ...session, recoveryState: state, lastActivityAt: new Date() });
        emit({ event: "recovery-state-changed", sessionId, state });
        return state;
    }

    async function gateOnHealth(handle: WorkloadHandle): Promise<boolean> {
        for (let attempt = 0; attempt < healthGateAttempts; attempt++) {
            const health = await sandbox.checkHealth(handle);
            if (health.healthy) {
                return true;
            }
            if (attempt < healthGateAttempts - 1) {
                await sleep(healthGateIntervalMs);
            }
        }
        return false;
    }

    return {
        provisionWorkspace(options: ProvisionWorkspaceOptions): Promise<WorkspaceId> {
            const workspaceId = newWorkspaceId();
            const now = new Date();
            const workspace: UserWorkspace = {
                id: workspaceId,
                applicationId: options.applicationId,
                ownerId: options.ownerId,
                namespace: `df-autocode-${workspaceId}`,
                repo: {
                    owner: "datonfly-autocode",
                    name: `workspace-${workspaceId}`,
                    cloneUrl: `https://git.invalid/workspace-${workspaceId}.git`,
                },
                templateVersion: "0.0.0",
                currentRevisionId: revisionIdSchema.parse(randomUUID()),
                resourceLimits,
                createdAt: now,
                updatedAt: now,
            };
            store.workspaces.set(workspaceId, workspace);
            logger.info({ workspaceId, applicationId: options.applicationId }, "Provisioned workspace");
            return Promise.resolve(workspaceId);
        },

        async startSession(options: StartSessionOptions): Promise<Session> {
            const workspace = store.workspaces.get(options.workspaceId);
            if (!workspace) {
                throw new Error(`Unknown workspace ${options.workspaceId}`);
            }

            const sessionId = sessionIdSchema.parse(randomUUID());
            const now = new Date();
            const startingSession: Session = {
                id: sessionId,
                workspaceId: options.workspaceId,
                userId: options.userId,
                status: "starting",
                recoveryState: "vanilla",
                startedAt: now,
                lastActivityAt: now,
            };
            store.sessions.set(sessionId, startingSession);
            emit({ event: "session-state-changed", sessionId, status: "starting" });

            await sandbox.createNamespace({
                workspaceId: workspace.id,
                namespace: workspace.namespace,
                resourceLimits: workspace.resourceLimits,
                egressAllowList: [],
            });
            emit({
                event: "sandbox-state-changed",
                workspaceId: workspace.id,
                kind: "app-runtime",
                state: "provisioning",
            });

            const handle = await sandbox.startWorkload({
                workspaceId: workspace.id,
                kind: "app-runtime",
                image: appRuntimeImage,
            });

            const healthy = await gateOnHealth(handle);
            if (!healthy) {
                await sandbox.stopWorkload(handle).catch((error: unknown) => {
                    logger.warn(
                        { sessionId, error: formatLoggedError(error) },
                        "Failed to stop workload after failed health gate",
                    );
                });
                emit({
                    event: "sandbox-state-changed",
                    workspaceId: workspace.id,
                    kind: "app-runtime",
                    state: "stopped",
                });
                store.sessions.delete(sessionId);
                throw new Error(`App Runtime for workspace ${workspace.id} failed the health gate`);
            }
            emit({ event: "sandbox-state-changed", workspaceId: workspace.id, kind: "app-runtime", state: "running" });

            const deploymentId = deploymentIdSchema.parse(randomUUID());
            const deployedAt = new Date();
            const deployment: Deployment = {
                id: deploymentId,
                workspaceId: workspace.id,
                revisionId: workspace.currentRevisionId ?? revisionIdSchema.parse(randomUUID()),
                status: "healthy",
                createdAt: deployedAt,
                healthyAt: deployedAt,
            };
            store.deployments.set(deploymentId, deployment);
            store.handles.set(sessionId, handle);
            store.appRuntimeUrls.set(sessionId, handle.endpoint);

            const activeSession: Session = {
                ...startingSession,
                status: "active",
                deploymentId,
                lastActivityAt: deployedAt,
            };
            store.sessions.set(sessionId, activeSession);
            store.workspaces.set(workspace.id, {
                ...workspace,
                activeDeploymentId: deploymentId,
                updatedAt: deployedAt,
            });
            emit({ event: "session-state-changed", sessionId, status: "active" });

            logger.info({ sessionId, workspaceId: workspace.id, endpoint: handle.endpoint }, "Started session");
            return activeSession;
        },

        async endSession(sessionId: SessionId): Promise<void> {
            const session = store.sessions.get(sessionId);
            if (!session) {
                return;
            }

            const handle = store.handles.get(sessionId);
            if (handle) {
                await sandbox.stopWorkload(handle);
            }
            await sandbox.scaleToZero(session.workspaceId);
            emit({
                event: "sandbox-state-changed",
                workspaceId: session.workspaceId,
                kind: "app-runtime",
                state: "scaled-to-zero",
            });

            const endedAt = new Date();
            store.sessions.set(sessionId, {
                ...session,
                status: "expired",
                lastActivityAt: endedAt,
                expiredAt: endedAt,
            });
            store.handles.delete(sessionId);
            store.appRuntimeUrls.delete(sessionId);
            emit({ event: "session-state-changed", sessionId, status: "expired" });
            logger.info({ sessionId }, "Ended session");
        },

        reportBuildFailure(sessionId: SessionId): Promise<RecoveryState> {
            return Promise.resolve(setRecoveryState(sessionId, "build_failed"));
        },

        reportRuntimeFailure(sessionId: SessionId): Promise<RecoveryState> {
            return Promise.resolve(setRecoveryState(sessionId, "runtime_failed"));
        },

        recover(sessionId: SessionId, choice: RecoveryChoice): Promise<RecoveryState> {
            const nextState: RecoveryState = choice === "vanilla" ? "vanilla" : "recovered";
            return Promise.resolve(setRecoveryState(sessionId, nextState));
        },

        listWorkspaces(): UserWorkspace[] {
            return [...store.workspaces.values()];
        },

        getWorkspace(workspaceId: WorkspaceId): UserWorkspace | undefined {
            return store.workspaces.get(workspaceId);
        },

        getSession(sessionId: SessionId): Session | undefined {
            return store.sessions.get(sessionId);
        },

        getAppRuntimeUrl(sessionId: SessionId): string | undefined {
            return store.appRuntimeUrls.get(sessionId);
        },
    };
}
