import type { WorkspaceId } from "../domain/ids.js";
import type { ResourceLimits } from "../domain/values.js";

/** Kind of per-user pod the sandbox provider can run. */
export type SandboxWorkloadKind = "app-runtime" | "codegen";

/** Runtime constant mapping each {@link SandboxWorkloadKind} to itself. */
export const SANDBOX_WORKLOAD_KINDS = {
    "app-runtime": "app-runtime",
    codegen: "codegen",
} as const satisfies Record<SandboxWorkloadKind, SandboxWorkloadKind>;

/** A network egress rule permitting traffic to a single declared destination. */
export interface EgressRule {
    /** Host the workload is allowed to reach. */
    host: string;
    /** Port the workload is allowed to reach. */
    port: number;
}

/** Options for provisioning a per-user namespace. */
export interface CreateNamespaceOptions {
    /** Workspace the namespace belongs to. */
    workspaceId: WorkspaceId;
    /** Kubernetes namespace name to create. */
    namespace: string;
    /** Resource quota applied to the namespace. */
    resourceLimits: ResourceLimits;
    /** Default-deny egress allow-list for workloads in the namespace. */
    egressAllowList: EgressRule[];
}

/** Options for starting a workload pod within a workspace namespace. */
export interface StartWorkloadOptions {
    /** Workspace the workload belongs to. */
    workspaceId: WorkspaceId;
    /** Kind of workload to start. */
    kind: SandboxWorkloadKind;
    /** Container image to run. */
    image: string;
    /**
     * Optional instance discriminator distinguishing concurrent workloads of the
     * same {@link kind} for a workspace (e.g. a deployment id). When provided,
     * the provider gives the workload a distinct identity so a new instance can
     * run alongside the one it supersedes during a health-gated deploy. When
     * omitted, the provider replaces any existing workload of the same kind.
     */
    instanceId?: string | undefined;
    /** Environment variables for the workload. */
    env?: Record<string, string> | undefined;
    /** Host paths to mount into the workload (e.g. a host-built artifact). */
    mounts?: WorkloadMount[] | undefined;
}

/** A host path mounted into a running workload. */
export interface WorkloadMount {
    /** Absolute host path to mount. */
    hostPath: string;
    /** Absolute path the host path is mounted at inside the container. */
    containerPath: string;
    /** Whether the mount is read-only. Defaults to writable when omitted. */
    readOnly?: boolean | undefined;
}

/** A handle to a running workload. */
export interface WorkloadHandle {
    /** Workspace the workload belongs to. */
    workspaceId: WorkspaceId;
    /** Kind of workload. */
    kind: SandboxWorkloadKind;
    /** Instance discriminator the workload was started with, if any. */
    instanceId?: string | undefined;
    /** Provider-specific workload name (e.g. pod name). */
    name: string;
    /** Reachable base URL of the workload once started (e.g. its published port). */
    endpoint: string;
}

/** Health of a running workload. */
export interface WorkloadHealth {
    /** Whether the workload is currently healthy. */
    healthy: boolean;
    /** Optional human-readable health detail. */
    detail?: string | undefined;
}

/**
 * Provisions and manages per-user runtime workloads.
 *
 * Translates orchestrator intent into namespaces, pods, network policies,
 * quotas, health checks, and log/stream access. Pluggable: a Kubernetes
 * provider backs real deployments, a Docker provider backs local development.
 */
export interface SandboxProvider {
    /** Create the per-user namespace with its network policy and quotas. */
    createNamespace(options: CreateNamespaceOptions): Promise<void>;
    /** Destroy the per-user namespace and everything in it. */
    destroyNamespace(workspaceId: WorkspaceId): Promise<void>;
    /** Start a workload pod and return a handle to it. */
    startWorkload(options: StartWorkloadOptions): Promise<WorkloadHandle>;
    /** Stop a running workload. */
    stopWorkload(handle: WorkloadHandle): Promise<void>;
    /** Scale a workspace's App Runtime to zero (idle / expiry). */
    scaleToZero(workspaceId: WorkspaceId): Promise<void>;
    /** Query the health of a running workload. */
    checkHealth(handle: WorkloadHandle): Promise<WorkloadHealth>;
    /** Stream logs from a running workload as an async iterable of lines. */
    streamLogs(handle: WorkloadHandle): AsyncIterable<string>;
}
