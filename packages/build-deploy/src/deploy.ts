import {
    formatLoggedError,
    NOOP_PROVIDER_LOGGER,
    type DeploymentId,
    type ProviderLogger,
    type RevisionId,
    type SandboxProvider,
    type WorkloadHandle,
    type WorkspaceId,
} from "@datonfly-autocode/core";

/** Container image used to statically serve a built application's `dist/`. */
export const STATIC_SERVER_IMAGE = "nginx:alpine";

/** Path inside {@link STATIC_SERVER_IMAGE} from which static files are served. */
export const STATIC_SERVER_ROOT = "/usr/share/nginx/html";

/** Options for {@link deployArtifact}. */
export interface DeployArtifactOptions {
    /** Sandbox provider that runs the static-server workload. */
    sandbox: SandboxProvider;
    /** Workspace the deployment belongs to. */
    workspaceId: WorkspaceId;
    /** Revision being deployed (for logging/traceability). */
    revisionId: RevisionId;
    /**
     * Deployment this workload is the instance of. Used as the workload instance
     * discriminator so a new deployment runs alongside the one it supersedes
     * during the health gate.
     */
    deploymentId: DeploymentId;
    /** Absolute host path to the built `dist/` directory to serve. */
    distPath: string;
    /** Logger; defaults to a no-op. */
    logger?: ProviderLogger | undefined;
    /** Number of health probes before the deploy is considered failed. */
    healthGateAttempts?: number | undefined;
    /** Delay between health probes, in milliseconds. */
    healthGateIntervalMs?: number | undefined;
}

/** Result of a successful {@link deployArtifact}. */
export interface DeployArtifactResult {
    /** Handle to the running static-server workload. */
    handle: WorkloadHandle;
    /** Reachable base URL of the deployed application. */
    endpoint: string;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * Deploy a built `dist/` directory by starting a static-server workload with the
 * artifact bind-mounted read-only, gating on the workload's health. Keeps the
 * sandbox / static-server specifics out of the Orchestrator.
 */
export async function deployArtifact(options: DeployArtifactOptions): Promise<DeployArtifactResult> {
    const { sandbox, workspaceId, revisionId, distPath } = options;
    const logger = options.logger ?? NOOP_PROVIDER_LOGGER;
    const attempts = options.healthGateAttempts ?? 30;
    const intervalMs = options.healthGateIntervalMs ?? 500;

    const handle = await sandbox.startWorkload({
        workspaceId,
        kind: "app-runtime",
        image: STATIC_SERVER_IMAGE,
        instanceId: options.deploymentId,
        mounts: [{ hostPath: distPath, containerPath: STATIC_SERVER_ROOT, readOnly: true }],
    });
    logger.info({ workspaceId, revisionId, endpoint: handle.endpoint }, "Started static-server workload");

    for (let attempt = 0; attempt < attempts; attempt++) {
        const health = await sandbox.checkHealth(handle);
        if (health.healthy) {
            return { handle, endpoint: handle.endpoint };
        }
        if (attempt < attempts - 1) {
            await sleep(intervalMs);
        }
    }

    await sandbox.stopWorkload(handle).catch((error: unknown) => {
        logger.warn(
            { workspaceId, revisionId, error: formatLoggedError(error) },
            "Failed to stop workload after failed health gate",
        );
    });
    throw new Error(`Static server for workspace ${workspaceId} failed the health gate`);
}
