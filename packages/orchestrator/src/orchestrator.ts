import { randomUUID } from "node:crypto";

import { deployArtifact } from "@datonfly-autocode/build-deploy";
import {
    deploymentIdSchema,
    formatLoggedError,
    NOOP_PROVIDER_LOGGER,
    revisionIdSchema,
    sessionIdSchema,
    workspaceIdSchema,
    type BuildProvider,
    type ControlPlaneEvent,
    type Deployment,
    type DeploymentId,
    type Orchestrator,
    type ProviderLogger,
    type ProvisionWorkspaceOptions,
    type RecoveryChoice,
    type RecoveryState,
    type RepoProvider,
    type ResourceLimits,
    type Revision,
    type RevisionId,
    type SandboxProvider,
    type Session,
    type SessionId,
    type StartSessionOptions,
    type TemplateRepoCoordinates,
    type UserWorkspace,
    type WorkloadHandle,
    type WorkspaceId,
} from "@datonfly-autocode/core";

/** Default resource ceiling recorded on provisioned workspaces (advisory this slice). */
const DEFAULT_RESOURCE_LIMITS: ResourceLimits = { cpu: "500m", memory: "256Mi" };

/**
 * Template every workspace is provisioned from until an Application registry
 * lands. The local-git repo provider resolves the actual seed from its own
 * configured path; only `owner` / `templateVersion` are recorded here.
 */
const DEFAULT_TEMPLATE: TemplateRepoCoordinates = {
    owner: "datonfly-autocode",
    name: "reference-empty-app",
    cloneUrl: "",
    templateVersion: "0.0.1",
};

/** Sink the orchestrator pushes control-plane events into for fan-out to the Shell. */
export type ControlPlaneEventSink = (event: ControlPlaneEvent) => void;

/** Options for {@link createOrchestrator}. */
export interface OrchestratorOptions {
    /** Sandbox provider the orchestrator drives (Docker in this slice). */
    sandbox: SandboxProvider;
    /** Repository provider used to clone templates, tag revisions, and revert. */
    repo: RepoProvider;
    /** Build provider that turns a revision into a deployable `dist/` artifact. */
    build: BuildProvider;
    /** Sink for control-plane events emitted during lifecycle transitions. */
    emit: ControlPlaneEventSink;
    /** Application template new workspaces are provisioned from. */
    template?: TemplateRepoCoordinates;
    /** Resource ceiling recorded on provisioned workspaces. */
    resourceLimits?: ResourceLimits;
    /** Number of health probes before a deploy is considered failed. */
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
    /** All revisions of a workspace, newest first. */
    listRevisions(workspaceId: WorkspaceId): Revision[];
    /** All deployments of a workspace, newest first. */
    listDeployments(workspaceId: WorkspaceId): Deployment[];
}

/** In-memory control-plane state for a single orchestrator instance. */
interface Store {
    workspaces: Map<WorkspaceId, UserWorkspace>;
    sessions: Map<SessionId, Session>;
    revisions: Map<RevisionId, Revision>;
    deployments: Map<DeploymentId, Deployment>;
    /** Live sandbox handle per deployment, used to stop the workload on supersede/end. */
    deploymentHandles: Map<DeploymentId, WorkloadHandle>;
    /** Built `dist/` directory path per successfully built revision. */
    distPaths: Map<RevisionId, string>;
    /** Reachable App Runtime URL per session. */
    appRuntimeUrls: Map<SessionId, string>;
}

/** Git tag naming a revision on the workspace main line. */
function revisionTag(revisionId: RevisionId): string {
    return `rev-${revisionId}`;
}

/**
 * Create an in-memory {@link Orchestrator} that drives a real build and deploy
 * of each workspace's current revision.
 *
 * Provisioning clones the application template into a per-workspace Git
 * repository (via the {@link RepoProvider}) and records the vanilla baseline
 * {@link Revision}. Starting a session builds the current revision (via the
 * {@link BuildProvider}) and deploys its artifact behind a static server,
 * gating on health before linking a {@link Deployment}. Reverting restores a
 * prior revision, rebuilds it, and health-gated-supersedes the running one.
 * State is in-memory; codegen and persistence land in later slices.
 */
export function createOrchestrator(options: OrchestratorOptions): InMemoryOrchestrator {
    const sandbox = options.sandbox;
    const repo = options.repo;
    const build = options.build;
    const emit = options.emit;
    const template = options.template ?? DEFAULT_TEMPLATE;
    const resourceLimits = options.resourceLimits ?? DEFAULT_RESOURCE_LIMITS;
    const healthGateAttempts = options.healthGateAttempts ?? 30;
    const healthGateIntervalMs = options.healthGateIntervalMs ?? 500;
    const logger = options.logger ?? NOOP_PROVIDER_LOGGER;

    const store: Store = {
        workspaces: new Map(),
        sessions: new Map(),
        revisions: new Map(),
        deployments: new Map(),
        deploymentHandles: new Map(),
        distPaths: new Map(),
        appRuntimeUrls: new Map(),
    };

    function newWorkspaceId(): WorkspaceId {
        return workspaceIdSchema.parse(randomUUID());
    }

    function newRevisionId(): RevisionId {
        return revisionIdSchema.parse(randomUUID());
    }

    function newSessionId(): SessionId {
        return sessionIdSchema.parse(randomUUID());
    }

    function newDeploymentId(): DeploymentId {
        return deploymentIdSchema.parse(randomUUID());
    }

    function requireSession(sessionId: SessionId): Session {
        const session = store.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Unknown session ${sessionId}`);
        }
        return session;
    }

    function requireWorkspace(workspaceId: WorkspaceId): UserWorkspace {
        const workspace = store.workspaces.get(workspaceId);
        if (!workspace) {
            throw new Error(`Unknown workspace ${workspaceId}`);
        }
        return workspace;
    }

    function setRecoveryState(sessionId: SessionId, state: RecoveryState): RecoveryState {
        const session = requireSession(sessionId);
        store.sessions.set(sessionId, { ...session, recoveryState: state, lastActivityAt: new Date() });
        emit({ event: "recovery-state-changed", sessionId, state });
        return state;
    }

    function baselineRevisionOf(workspaceId: WorkspaceId): Revision | undefined {
        for (const revision of store.revisions.values()) {
            if (revision.workspaceId === workspaceId && revision.isBaseline) {
                return revision;
            }
        }
        return undefined;
    }

    /** Build a revision if it has no usable artifact yet; returns its `dist/` path. */
    async function ensureBuilt(revision: Revision): Promise<{ revision: Revision; distPath: string }> {
        const cached = store.distPaths.get(revision.id);
        if (revision.buildStatus === "succeeded" && cached !== undefined) {
            return { revision, distPath: cached };
        }

        const building: Revision = { ...revision, buildStatus: "building" };
        store.revisions.set(revision.id, building);
        const result = await build.build({
            workspaceId: revision.workspaceId,
            revisionId: revision.id,
            ref: revision.gitTag,
        });
        if (!result.succeeded || !result.artifact) {
            store.revisions.set(revision.id, { ...building, buildStatus: "failed" });
            logger.warn(
                { workspaceId: revision.workspaceId, revisionId: revision.id, ref: revision.gitTag },
                "Revision build failed",
            );
            throw new Error(`Build failed for revision ${revision.id}`);
        }

        const built: Revision = { ...building, buildStatus: "succeeded", artifactDigest: result.artifact.digest };
        store.revisions.set(revision.id, built);
        store.distPaths.set(revision.id, result.artifact.reference);
        logger.info(
            { workspaceId: revision.workspaceId, revisionId: revision.id, digest: result.artifact.digest },
            "Built revision artifact",
        );
        return { revision: built, distPath: result.artifact.reference };
    }

    /**
     * Deploy a built revision behind a static server, gate on health, and only
     * then supersede the workspace's previously healthy deployment (so an
     * unhealthy deploy never displaces a working one).
     */
    async function deployRevision(
        sessionId: SessionId,
        workspaceId: WorkspaceId,
        revision: Revision,
        distPath: string,
    ): Promise<Deployment> {
        const deploymentId = newDeploymentId();
        const createdAt = new Date();
        const deploying: Deployment = {
            id: deploymentId,
            workspaceId,
            revisionId: revision.id,
            status: "deploying",
            createdAt,
        };
        store.deployments.set(deploymentId, deploying);
        emit({ event: "deployment-state-changed", workspaceId, deploymentId, status: "deploying" });

        let result: Awaited<ReturnType<typeof deployArtifact>>;
        try {
            result = await deployArtifact({
                sandbox,
                workspaceId,
                revisionId: revision.id,
                deploymentId,
                distPath,
                logger,
                healthGateAttempts,
                healthGateIntervalMs,
            });
        } catch (error) {
            store.deployments.set(deploymentId, { ...deploying, status: "unhealthy" });
            emit({ event: "deployment-state-changed", workspaceId, deploymentId, status: "unhealthy" });
            throw error;
        }

        // Health gate passed: supersede the prior healthy deployment, if any.
        const workspace = requireWorkspace(workspaceId);
        let supersededId: DeploymentId | undefined;
        const priorId = workspace.activeDeploymentId;
        if (priorId !== undefined) {
            const prior = store.deployments.get(priorId);
            if (prior?.status === "healthy") {
                const priorHandle = store.deploymentHandles.get(priorId);
                if (priorHandle) {
                    await sandbox.stopWorkload(priorHandle).catch((error: unknown) => {
                        logger.warn(
                            { workspaceId, deploymentId: priorId, error: formatLoggedError(error) },
                            "Failed to stop superseded workload",
                        );
                    });
                    store.deploymentHandles.delete(priorId);
                }
                store.deployments.set(priorId, { ...prior, status: "superseded" });
                emit({ event: "deployment-state-changed", workspaceId, deploymentId: priorId, status: "superseded" });
                supersededId = priorId;
            }
        }

        const healthyAt = new Date();
        const healthy: Deployment = {
            ...deploying,
            status: "healthy",
            healthyAt,
            ...(supersededId !== undefined ? { supersededDeploymentId: supersededId } : {}),
        };
        store.deployments.set(deploymentId, healthy);
        store.deploymentHandles.set(deploymentId, result.handle);
        store.workspaces.set(workspaceId, { ...workspace, activeDeploymentId: deploymentId, updatedAt: healthyAt });
        store.appRuntimeUrls.set(sessionId, result.endpoint);

        emit({ event: "sandbox-state-changed", workspaceId, kind: "app-runtime", state: "running" });
        emit({
            event: "deployment-state-changed",
            workspaceId,
            deploymentId,
            status: "healthy",
            appRuntimeUrl: result.endpoint,
        });
        return healthy;
    }

    return {
        async provisionWorkspace(options: ProvisionWorkspaceOptions): Promise<WorkspaceId> {
            const workspaceId = newWorkspaceId();
            const now = new Date();
            const revisionId = newRevisionId();
            const baselineTag = revisionTag(revisionId);

            const coordinates = await repo.createWorkspaceFromTemplate({ workspaceId, template, baselineTag });
            const [head] = await repo.history(workspaceId, 1);
            const baseline: Revision = {
                id: revisionId,
                workspaceId,
                gitTag: baselineTag,
                commitSha: head?.sha ?? "",
                buildStatus: "pending",
                isBaseline: true,
                createdAt: now,
            };
            store.revisions.set(revisionId, baseline);

            const workspace: UserWorkspace = {
                id: workspaceId,
                applicationId: options.applicationId,
                ownerId: options.ownerId,
                namespace: `df-autocode-${workspaceId}`,
                repo: coordinates,
                templateVersion: template.templateVersion,
                currentRevisionId: revisionId,
                resourceLimits,
                createdAt: now,
                updatedAt: now,
            };
            store.workspaces.set(workspaceId, workspace);
            logger.info({ workspaceId, applicationId: options.applicationId }, "Provisioned workspace");
            return workspaceId;
        },

        async startSession(options: StartSessionOptions): Promise<Session> {
            const workspace = requireWorkspace(options.workspaceId);
            const revision = workspace.currentRevisionId ? store.revisions.get(workspace.currentRevisionId) : undefined;
            if (!revision) {
                throw new Error(`Workspace ${workspace.id} has no current revision to deploy`);
            }

            const sessionId = newSessionId();
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

            let built: { revision: Revision; distPath: string };
            try {
                built = await ensureBuilt(revision);
            } catch (error) {
                setRecoveryState(sessionId, "build_failed");
                logger.warn(
                    { sessionId, workspaceId: workspace.id, error: formatLoggedError(error) },
                    "Failed to build current revision on session start",
                );
                throw error;
            }

            let deployment: Deployment;
            try {
                deployment = await deployRevision(sessionId, workspace.id, built.revision, built.distPath);
            } catch (error) {
                emit({
                    event: "sandbox-state-changed",
                    workspaceId: workspace.id,
                    kind: "app-runtime",
                    state: "stopped",
                });
                store.sessions.delete(sessionId);
                throw error;
            }

            const activeSession: Session = {
                ...startingSession,
                status: "active",
                deploymentId: deployment.id,
                lastActivityAt: new Date(),
            };
            store.sessions.set(sessionId, activeSession);
            emit({ event: "session-state-changed", sessionId, status: "active" });
            logger.info(
                { sessionId, workspaceId: workspace.id, endpoint: store.appRuntimeUrls.get(sessionId) },
                "Started session",
            );
            return activeSession;
        },

        async endSession(sessionId: SessionId): Promise<void> {
            const session = store.sessions.get(sessionId);
            if (!session) {
                return;
            }

            const deploymentId = session.deploymentId;
            if (deploymentId !== undefined) {
                const handle = store.deploymentHandles.get(deploymentId);
                if (handle) {
                    await sandbox.stopWorkload(handle);
                    store.deploymentHandles.delete(deploymentId);
                }
                const deployment = store.deployments.get(deploymentId);
                if (deployment) {
                    store.deployments.set(deploymentId, { ...deployment, status: "stopped" });
                    emit({
                        event: "deployment-state-changed",
                        workspaceId: session.workspaceId,
                        deploymentId,
                        status: "stopped",
                    });
                }
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

        async recover(
            sessionId: SessionId,
            choice: RecoveryChoice,
            targetRevisionId?: RevisionId,
        ): Promise<RecoveryState> {
            const session = requireSession(sessionId);
            // Auto-repair drives codegen, which is deferred to a later slice; it
            // is a pure state transition for now.
            if (choice === "auto_repair") {
                return setRecoveryState(sessionId, "recovered");
            }

            const workspace = requireWorkspace(session.workspaceId);
            const target =
                choice === "vanilla"
                    ? baselineRevisionOf(workspace.id)
                    : targetRevisionId
                      ? store.revisions.get(targetRevisionId)
                      : baselineRevisionOf(workspace.id);
            if (!target) {
                throw new Error(`No target revision to revert to for workspace ${workspace.id}`);
            }

            setRecoveryState(sessionId, "building");

            const commit = await repo.revertToTag(workspace.id, target.gitTag);
            const revId = newRevisionId();
            const newTag = revisionTag(revId);
            await repo.tag(workspace.id, commit.sha, newTag);
            const now = new Date();
            const reverted: Revision = {
                id: revId,
                workspaceId: workspace.id,
                gitTag: newTag,
                commitSha: commit.sha,
                parentRevisionId: workspace.currentRevisionId,
                isBaseline: false,
                buildStatus: "pending",
                createdAt: now,
            };
            store.revisions.set(revId, reverted);
            store.workspaces.set(workspace.id, { ...workspace, currentRevisionId: revId, updatedAt: now });

            let built: { revision: Revision; distPath: string };
            try {
                built = await ensureBuilt(reverted);
            } catch (error) {
                logger.warn(
                    { sessionId, workspaceId: workspace.id, error: formatLoggedError(error) },
                    "Failed to build reverted revision",
                );
                return setRecoveryState(sessionId, "build_failed");
            }

            const deployment = await deployRevision(sessionId, workspace.id, built.revision, built.distPath);
            const current = requireSession(sessionId);
            store.sessions.set(sessionId, {
                ...current,
                deploymentId: deployment.id,
                lastActivityAt: new Date(),
            });

            return setRecoveryState(sessionId, choice === "vanilla" ? "vanilla" : "recovered");
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

        listRevisions(workspaceId: WorkspaceId): Revision[] {
            // Map iteration is insertion order, which is chronological per
            // workspace; reverse for newest-first without relying on
            // millisecond-resolution timestamps that can tie.
            return [...store.revisions.values()].filter((revision) => revision.workspaceId === workspaceId).reverse();
        },

        listDeployments(workspaceId: WorkspaceId): Deployment[] {
            return [...store.deployments.values()]
                .filter((deployment) => deployment.workspaceId === workspaceId)
                .reverse();
        },
    };
}
