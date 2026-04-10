import { describe, expect, it } from "vitest";

import {
    applicationIdSchema,
    revisionIdSchema,
    type ApplicationId,
    type BuildDiagnostics,
    type ControlPlaneEvent,
    type CreateNamespaceOptions,
    type RuntimeDiagnostics,
    type SandboxProvider,
    type StartWorkloadOptions,
    type UserId,
    type WorkloadHandle,
    type WorkloadHealth,
    type WorkspaceId,
} from "@datonfly-autocode/core";

import { createOrchestrator } from "./orchestrator.js";

const APP_ID: ApplicationId = applicationIdSchema.parse("22222222-2222-4222-8222-222222222222");
const USER_ID: UserId = "user-1";

/** A SandboxProvider that records calls and reports healthy immediately, with no Docker. */
class FakeSandboxProvider implements SandboxProvider {
    readonly calls: string[] = [];
    healthy = true;

    createNamespace(_options: CreateNamespaceOptions): Promise<void> {
        this.calls.push("createNamespace");
        return Promise.resolve();
    }
    destroyNamespace(): Promise<void> {
        this.calls.push("destroyNamespace");
        return Promise.resolve();
    }
    startWorkload(options: StartWorkloadOptions): Promise<WorkloadHandle> {
        this.calls.push("startWorkload");
        return Promise.resolve({
            workspaceId: options.workspaceId,
            kind: options.kind,
            name: `fake-${options.kind}`,
            endpoint: "http://fake-runtime:8080",
        });
    }
    stopWorkload(): Promise<void> {
        this.calls.push("stopWorkload");
        return Promise.resolve();
    }
    scaleToZero(): Promise<void> {
        this.calls.push("scaleToZero");
        return Promise.resolve();
    }
    checkHealth(): Promise<WorkloadHealth> {
        return Promise.resolve({ healthy: this.healthy });
    }
    // eslint-disable-next-line @typescript-eslint/require-await
    async *streamLogs(): AsyncIterable<string> {
        yield "fake log line";
    }
}

function setup(): {
    sandbox: FakeSandboxProvider;
    events: ControlPlaneEvent[];
    orchestrator: ReturnType<typeof createOrchestrator>;
} {
    const sandbox = new FakeSandboxProvider();
    const events: ControlPlaneEvent[] = [];
    const orchestrator = createOrchestrator({
        sandbox,
        emit: (event) => events.push(event),
        healthGateAttempts: 1,
        healthGateIntervalMs: 0,
    });
    return { sandbox, events, orchestrator };
}

describe("createOrchestrator", () => {
    it("provisions a workspace and lists it", async () => {
        const { orchestrator } = setup();

        const workspaceId = await orchestrator.provisionWorkspace({ applicationId: APP_ID, ownerId: USER_ID });

        const workspaces = orchestrator.listWorkspaces();
        expect(workspaces).toHaveLength(1);
        expect(workspaces[0]?.id).toBe(workspaceId);
        expect(orchestrator.getWorkspace(workspaceId)?.applicationId).toBe(APP_ID);
    });

    it("starts a session: runs the workload, links a deployment, and surfaces the App Runtime URL", async () => {
        const { sandbox, events, orchestrator } = setup();
        const workspaceId = await orchestrator.provisionWorkspace({ applicationId: APP_ID, ownerId: USER_ID });

        const session = await orchestrator.startSession({ workspaceId, userId: USER_ID });

        expect(session.status).toBe("active");
        expect(session.deploymentId).toBeDefined();
        expect(orchestrator.getAppRuntimeUrl(session.id)).toBe("http://fake-runtime:8080");
        expect(sandbox.calls).toEqual(["createNamespace", "startWorkload"]);
        expect(events.map((e) => e.event)).toEqual([
            "session-state-changed",
            "sandbox-state-changed",
            "sandbox-state-changed",
            "session-state-changed",
        ]);
        const statuses = events.filter((e) => e.event === "session-state-changed").map((e) => e.status);
        expect(statuses).toEqual(["starting", "active"]);
    });

    it("fails session start when the workload never becomes healthy", async () => {
        const { sandbox, orchestrator } = setup();
        sandbox.healthy = false;
        const workspaceId = await orchestrator.provisionWorkspace({ applicationId: APP_ID, ownerId: USER_ID });

        await expect(orchestrator.startSession({ workspaceId, userId: USER_ID })).rejects.toThrow(/health gate/);
        expect(sandbox.calls).toContain("stopWorkload");
    });

    it("ends a session: stops the workload, scales to zero, and expires the session", async () => {
        const { sandbox, events, orchestrator } = setup();
        const workspaceId = await orchestrator.provisionWorkspace({ applicationId: APP_ID, ownerId: USER_ID });
        const session = await orchestrator.startSession({ workspaceId, userId: USER_ID });

        await orchestrator.endSession(session.id);

        expect(orchestrator.getSession(session.id)?.status).toBe("expired");
        expect(orchestrator.getAppRuntimeUrl(session.id)).toBeUndefined();
        expect(sandbox.calls).toContain("stopWorkload");
        expect(sandbox.calls).toContain("scaleToZero");
        expect(events.at(-1)).toEqual({ event: "session-state-changed", sessionId: session.id, status: "expired" });
    });

    it("transitions recovery state and emits recovery events", async () => {
        const { events, orchestrator } = setup();
        const workspaceId = await orchestrator.provisionWorkspace({ applicationId: APP_ID, ownerId: USER_ID });
        const session = await orchestrator.startSession({ workspaceId, userId: USER_ID });

        expect(await orchestrator.reportBuildFailure(session.id, buildDiagnostics(workspaceId))).toBe("build_failed");
        expect(await orchestrator.recover(session.id, "auto_repair")).toBe("recovered");
        expect(await orchestrator.recover(session.id, "vanilla")).toBe("vanilla");
        expect(await orchestrator.reportRuntimeFailure(session.id, runtimeDiagnostics(workspaceId))).toBe(
            "runtime_failed",
        );

        const recoveryStates = events.filter((e) => e.event === "recovery-state-changed").map((e) => e.state);
        expect(recoveryStates).toEqual(["build_failed", "recovered", "vanilla", "runtime_failed"]);
        expect(orchestrator.getSession(session.id)?.recoveryState).toBe("runtime_failed");
    });
});

function buildDiagnostics(workspaceId: WorkspaceId): BuildDiagnostics {
    return {
        workspaceId,
        revisionId: revisionIdSchema.parse("33333333-3333-4333-8333-333333333333"),
        entries: [],
        rawLog: "",
        capturedAt: new Date(),
    };
}

function runtimeDiagnostics(workspaceId: WorkspaceId): RuntimeDiagnostics {
    return {
        workspaceId,
        revisionId: revisionIdSchema.parse("33333333-3333-4333-8333-333333333333"),
        entries: [],
        capturedAt: new Date(),
    };
}
