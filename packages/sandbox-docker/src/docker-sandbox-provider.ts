import { PassThrough } from "node:stream";

import Docker from "dockerode";

import {
    formatLoggedError,
    NOOP_PROVIDER_LOGGER,
    type CreateNamespaceOptions,
    type ProviderLogger,
    type SandboxProvider,
    type SandboxWorkloadKind,
    type StartWorkloadOptions,
    type WorkloadHandle,
    type WorkloadHealth,
    type WorkspaceId,
} from "@datonfly-autocode/core";

/** Docker label marking every resource this provider manages. */
const LABEL_MANAGED = "com.datonfly.autocode.managed";
/** Docker label recording the owning workspace of a managed resource. */
const LABEL_WORKSPACE = "com.datonfly.autocode.workspace";
/** Docker label recording the workload kind of a managed container. */
const LABEL_KIND = "com.datonfly.autocode.kind";

/** Container port the stub App Runtime image listens on by default (`traefik/whoami`). */
const DEFAULT_APP_RUNTIME_PORT = 80;
/** Host the published container ports are reachable on by default. */
const DEFAULT_PUBLISH_HOST = "localhost";
/** Timeout for a single HTTP health probe. */
const HEALTH_PROBE_TIMEOUT_MS = 2_000;

/** Options for constructing a {@link DockerSandboxProvider}. */
export interface DockerSandboxProviderOptions {
    /** Pre-configured dockerode client; defaults to the local daemon's default socket. */
    docker?: Docker;
    /** Host the published container ports are reachable on. Defaults to `localhost`. */
    publishHost?: string;
    /** Container port the App Runtime workload listens on. Defaults to `80`. */
    appRuntimePort?: number;
    /** Structured logger; defaults to a no-op logger. */
    logger?: ProviderLogger;
}

/** Read a Docker API HTTP status code off a caught error, if present. */
function dockerStatusCode(error: unknown): number | undefined {
    if (error && typeof error === "object" && "statusCode" in error) {
        const code = (error as { statusCode?: unknown }).statusCode;
        return typeof code === "number" ? code : undefined;
    }
    return undefined;
}

/**
 * {@link SandboxProvider} backed by the local Docker daemon.
 *
 * Runs each workspace's App Runtime workload as a Docker container with a
 * published port, so the Shell can reach it on `localhost`. This is the local
 * development / proof-of-concept provider: network isolation, egress
 * allow-lists, and resource quotas are documented no-ops here and are enforced
 * for real by the Kubernetes provider in a later slice.
 */
export class DockerSandboxProvider implements SandboxProvider {
    private readonly docker: Docker;
    private readonly publishHost: string;
    private readonly appRuntimePort: number;
    private readonly logger: ProviderLogger;

    constructor(options: DockerSandboxProviderOptions = {}) {
        this.docker = options.docker ?? new Docker();
        this.publishHost = options.publishHost ?? DEFAULT_PUBLISH_HOST;
        this.appRuntimePort = options.appRuntimePort ?? DEFAULT_APP_RUNTIME_PORT;
        this.logger = options.logger ?? NOOP_PROVIDER_LOGGER;
    }

    /**
     * Create the per-workspace Docker network.
     *
     * Best-effort and advisory only this slice: the network provides no real
     * isolation, and `resourceLimits` / `egressAllowList` are accepted but not
     * enforced. A pre-existing network is treated as success.
     */
    async createNamespace(options: CreateNamespaceOptions): Promise<void> {
        const networkName = this.networkName(options.workspaceId);
        try {
            await this.docker.createNetwork({
                Name: networkName,
                Labels: { [LABEL_MANAGED]: "true", [LABEL_WORKSPACE]: options.workspaceId },
            });
        } catch (error) {
            if (dockerStatusCode(error) === 409) {
                return;
            }
            this.logger.warn(
                { workspaceId: options.workspaceId, error: formatLoggedError(error) },
                "Failed to create workspace network (continuing; network isolation is a no-op this slice)",
            );
        }
    }

    /** Remove the workspace's managed containers and its network. */
    async destroyNamespace(workspaceId: WorkspaceId): Promise<void> {
        await this.removeContainerByName(this.containerName(workspaceId, "app-runtime"));
        await this.removeContainerByName(this.containerName(workspaceId, "codegen"));

        const network = this.docker.getNetwork(this.networkName(workspaceId));
        try {
            await network.remove();
        } catch (error) {
            if (dockerStatusCode(error) !== 404) {
                this.logger.warn(
                    { workspaceId, error: formatLoggedError(error) },
                    "Failed to remove workspace network",
                );
            }
        }
    }

    /**
     * Start a workload container from `image` with a published port and return a
     * handle whose `endpoint` is the reachable base URL.
     */
    async startWorkload(options: StartWorkloadOptions): Promise<WorkloadHandle> {
        const { workspaceId, kind, image } = options;
        await this.ensureImage(image);

        const name = this.containerName(workspaceId, kind);
        // Replace any stale container left from a previous run.
        await this.removeContainerByName(name);

        const portKey = `${String(this.appRuntimePort)}/tcp`;
        const createOptions: Docker.ContainerCreateOptions = {
            name,
            Image: image,
            Labels: { [LABEL_MANAGED]: "true", [LABEL_WORKSPACE]: workspaceId, [LABEL_KIND]: kind },
            ExposedPorts: { [portKey]: {} },
            HostConfig: { PortBindings: { [portKey]: [{ HostPort: "" }] } },
        };
        if (options.env) {
            createOptions.Env = Object.entries(options.env).map(([key, value]) => `${key}=${value}`);
        }

        const container = await this.docker.createContainer(createOptions);
        await container.start();

        // Best-effort: attach the workload to its workspace network. Published
        // ports remain reachable on the default bridge regardless.
        try {
            await this.docker.getNetwork(this.networkName(workspaceId)).connect({ Container: container.id });
        } catch (error) {
            this.logger.debug(
                { workspaceId, error: formatLoggedError(error) },
                "Could not attach workload to workspace network (continuing)",
            );
        }

        const info = await container.inspect();
        const hostPort = info.NetworkSettings.Ports[portKey]?.[0]?.HostPort;
        if (!hostPort) {
            await this.removeContainerByName(name);
            throw new Error(`Container ${name} did not publish a host port for ${portKey}`);
        }

        const endpoint = `http://${this.publishHost}:${hostPort}`;
        this.logger.info({ workspaceId, kind, name, endpoint }, "Started workload container");
        return { workspaceId, kind, name, endpoint };
    }

    /** Stop and remove a workload container. */
    async stopWorkload(handle: WorkloadHandle): Promise<void> {
        await this.removeContainerByName(handle.name);
    }

    /** Stop and remove the workspace's App Runtime container. */
    async scaleToZero(workspaceId: WorkspaceId): Promise<void> {
        await this.removeContainerByName(this.containerName(workspaceId, "app-runtime"));
    }

    /** Probe the workload's HTTP endpoint and report whether it is serving. */
    async checkHealth(handle: WorkloadHandle): Promise<WorkloadHealth> {
        const controller = new AbortController();
        const timer = setTimeout(() => {
            controller.abort();
        }, HEALTH_PROBE_TIMEOUT_MS);
        try {
            const response = await fetch(handle.endpoint, { signal: controller.signal, redirect: "manual" });
            return { healthy: response.status < 500, detail: `HTTP ${String(response.status)}` };
        } catch (error) {
            return { healthy: false, detail: formatLoggedError(error) };
        } finally {
            clearTimeout(timer);
        }
    }

    /** Stream the workload container's logs as an async iterable of lines. */
    async *streamLogs(handle: WorkloadHandle): AsyncIterable<string> {
        const container = this.docker.getContainer(handle.name);
        const logStream = await container.logs({ follow: true, stdout: true, stderr: true, tail: 100 });

        const out = new PassThrough();
        this.docker.modem.demuxStream(logStream, out, out);
        logStream.on("end", () => {
            out.end();
        });
        logStream.on("error", (error: Error) => {
            out.destroy(error);
        });

        let buffer = "";
        for await (const chunk of out) {
            buffer += (chunk as Buffer).toString("utf8");
            let newlineIndex = buffer.indexOf("\n");
            while (newlineIndex >= 0) {
                yield buffer.slice(0, newlineIndex);
                buffer = buffer.slice(newlineIndex + 1);
                newlineIndex = buffer.indexOf("\n");
            }
        }
        if (buffer.length > 0) {
            yield buffer;
        }
    }

    /** Pull `image` if it is not already present locally. */
    private async ensureImage(image: string): Promise<void> {
        try {
            await this.docker.getImage(image).inspect();
            return;
        } catch (error) {
            if (dockerStatusCode(error) !== 404) {
                throw error;
            }
        }

        this.logger.info({ image }, "Pulling workload image");
        const pullStream = await this.docker.pull(image);
        await new Promise<void>((resolve, reject) => {
            this.docker.modem.followProgress(pullStream, (followError: Error | null) => {
                if (followError) {
                    reject(followError);
                } else {
                    resolve();
                }
            });
        });
    }

    /** Stop and remove a container by name, treating "no such container" as success. */
    private async removeContainerByName(name: string): Promise<void> {
        try {
            await this.docker.getContainer(name).remove({ force: true });
        } catch (error) {
            if (dockerStatusCode(error) !== 404) {
                throw error;
            }
        }
    }

    /** Deterministic container name for a workspace's workload of a given kind. */
    private containerName(workspaceId: WorkspaceId, kind: SandboxWorkloadKind): string {
        return `df-autocode-${kind}-${workspaceId}`;
    }

    /** Deterministic network name for a workspace. */
    private networkName(workspaceId: WorkspaceId): string {
        return `df-autocode-ns-${workspaceId}`;
    }
}

/** Resolve whether a Docker daemon is reachable, for conditionally skipping integration tests. */
export async function isDockerAvailable(docker: Docker = new Docker()): Promise<boolean> {
    try {
        await docker.ping();
        return true;
    } catch {
        return false;
    }
}
