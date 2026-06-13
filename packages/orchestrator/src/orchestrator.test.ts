import { describe, expect, it } from "vitest";

import {
    applicationIdSchema,
    type ApplicationId,
    type BuildOptions,
    type BuildResult,
    type CodegenJobRequest,
    type CodegenJobResult,
    type CodegenProvider,
    type CodegenStepEvent,
    type CommitInfo,
    type CommitOptions,
    type ControlPlaneEvent,
    type CreateFromTemplateOptions,
    type CreateNamespaceOptions,
    type RepoCoordinates,
    type RepoProvider,
    type SandboxProvider,
    type StartWorkloadOptions,
    type TemplateUpgradeResult,
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
    private nextPort = 8080;

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
        const port = this.nextPort++;
        return Promise.resolve({
            workspaceId: options.workspaceId,
            kind: options.kind,
            name: `fake-${options.kind}-${String(port)}`,
            endpoint: `http://fake-runtime:${String(port)}`,
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

/** A RepoProvider that fabricates commits without touching the filesystem. */
class FakeRepoProvider implements RepoProvider {
    readonly calls: string[] = [];
    private counter = 0;

    createWorkspaceFromTemplate(options: CreateFromTemplateOptions): Promise<RepoCoordinates> {
        this.calls.push("createWorkspaceFromTemplate");
        return Promise.resolve({
            owner: options.template.owner,
            name: `workspace-${options.workspaceId}`,
            cloneUrl: `/fake/workspaces/${options.workspaceId}`,
        });
    }
    createBranch(): Promise<void> {
        return Promise.resolve();
    }
    commit(options: CommitOptions): Promise<CommitInfo> {
        return Promise.resolve(this.fabricate(options.message));
    }
    integrateBranch(): Promise<CommitInfo> {
        return Promise.resolve(this.fabricate("integrate"));
    }
    tag(): Promise<void> {
        this.calls.push("tag");
        return Promise.resolve();
    }
    revertToTag(_workspaceId: WorkspaceId, tag: string): Promise<CommitInfo> {
        this.calls.push("revertToTag");
        return Promise.resolve(this.fabricate(`Revert to ${tag}`));
    }
    history(): Promise<CommitInfo[]> {
        return Promise.resolve([this.fabricate("Vanilla baseline")]);
    }
    diff(): Promise<string> {
        return Promise.resolve("");
    }
    upgradeTemplate(): Promise<TemplateUpgradeResult> {
        return Promise.reject(new Error("not implemented"));
    }

    private fabricate(message: string): CommitInfo {
        this.counter++;
        return {
            sha: `sha-${String(this.counter)}`,
            message,
            author: "Fake",
            authoredAt: new Date(),
        };
    }
}

/** A BuildProvider that always succeeds with a deterministic fake artifact. */
class FakeBuildProvider {
    readonly builds: BuildOptions[] = [];
    succeed = true;

    build(options: BuildOptions): Promise<BuildResult> {
        this.builds.push(options);
        if (!this.succeed) {
            return Promise.resolve({
                succeeded: false,
                diagnostics: {
                    workspaceId: options.workspaceId,
                    revisionId: options.revisionId,
                    entries: [{ severity: "error", message: "boom" }],
                    rawLog: "boom",
                    capturedAt: new Date(),
                },
            });
        }
        return Promise.resolve({
            succeeded: true,
            artifact: { revisionId: options.revisionId, digest: `digest-${options.ref}`, reference: "/fake/dist" },
            diagnostics: {
                workspaceId: options.workspaceId,
                revisionId: options.revisionId,
                entries: [],
                rawLog: "",
                capturedAt: new Date(),
            },
        });
    }
}

/**
 * A CodegenProvider that, on success, emits planned-diff + commit steps and
 * returns a freshly minted revision id, without touching an agent or Git.
 */
class FakeCodegenProvider implements CodegenProvider {
    succeed = true;
    /** Revision id the next successful job reports; set to a valid uuid. */
    revisionId = "33333333-3333-4333-8333-333333333333";

    runJob(request: CodegenJobRequest, onStep?: (event: CodegenStepEvent) => void): Promise<CodegenJobResult> {
        void request;
        const planned: CodegenStepEvent = { step: "planned-diff", phase: "completed", ok: true, at: Date.now() };
        onStep?.({ step: "planned-diff", phase: "started", at: Date.now() });
        onStep?.(planned);
        if (!this.succeed) {
            return Promise.resolve({ succeeded: false, summary: "No changes.", steps: [planned] });
        }
        const commit: CodegenStepEvent = { step: "commit", phase: "completed", ok: true, at: Date.now() };
        onStep?.({ step: "commit", phase: "started", at: Date.now() });
        onStep?.(commit);
        return Promise.resolve({
            succeeded: true,
            producedRevisionId: this.revisionId,
            summary: "Added a button.",
            steps: [planned, commit],
        });
    }
}

function setup(): {
    sandbox: FakeSandboxProvider;
    repo: FakeRepoProvider;
    build: FakeBuildProvider;
    codegen: FakeCodegenProvider;
    events: ControlPlaneEvent[];
    orchestrator: ReturnType<typeof createOrchestrator>;
} {
    const sandbox = new FakeSandboxProvider();
    const repo = new FakeRepoProvider();
    const build = new FakeBuildProvider();
    const codegen = new FakeCodegenProvider();
    const events: ControlPlaneEvent[] = [];
    const orchestrator = createOrchestrator({
        sandbox,
        repo,
        build,
        codegen,
        emit: (event) => events.push(event),
        healthGateAttempts: 1,
        healthGateIntervalMs: 0,
    });
    return { sandbox, repo, build, codegen, events, orchestrator };
}

describe("createOrchestrator", () => {
    it("provisions a workspace from the template and records the baseline revision", async () => {
        const { repo, orchestrator } = setup();

        const workspaceId = await orchestrator.provisionWorkspace({ applicationId: APP_ID, ownerId: USER_ID });

        expect(repo.calls).toContain("createWorkspaceFromTemplate");
        const workspace = orchestrator.getWorkspace(workspaceId);
        expect(workspace?.applicationId).toBe(APP_ID);
        expect(workspace?.currentRevisionId).toBeDefined();
        expect(workspace?.repo.cloneUrl).toBe(`/fake/workspaces/${workspaceId}`);

        const revisions = orchestrator.listRevisions(workspaceId);
        expect(revisions).toHaveLength(1);
        expect(revisions[0]?.isBaseline).toBe(true);
        expect(revisions[0]?.buildStatus).toBe("pending");
        expect(revisions[0]?.commitSha).toBe("sha-1");
    });

    it("starts a session: builds the current revision, deploys it, and surfaces the App Runtime URL", async () => {
        const { sandbox, build, events, orchestrator } = setup();
        const workspaceId = await orchestrator.provisionWorkspace({ applicationId: APP_ID, ownerId: USER_ID });

        const session = await orchestrator.startSession({ workspaceId, userId: USER_ID });

        expect(session.status).toBe("active");
        expect(session.deploymentId).toBeDefined();
        expect(build.builds).toHaveLength(1);
        expect(orchestrator.getAppRuntimeUrl(session.id)).toBe("http://fake-runtime:8080");
        expect(sandbox.calls).toEqual(["createNamespace", "startWorkload"]);

        const deployments = orchestrator.listDeployments(workspaceId);
        expect(deployments).toHaveLength(1);
        expect(deployments[0]?.status).toBe("healthy");

        // The current revision is marked built.
        expect(orchestrator.listRevisions(workspaceId)[0]?.buildStatus).toBe("succeeded");
        const eventNames = events.map((e) => e.event);
        expect(eventNames).toContain("deployment-state-changed");
        const healthy = events.find((e) => e.event === "deployment-state-changed" && e.status === "healthy");
        expect(healthy).toMatchObject({ appRuntimeUrl: "http://fake-runtime:8080" });
    });

    it("fails session start when the workload never becomes healthy", async () => {
        const { sandbox, orchestrator } = setup();
        sandbox.healthy = false;
        const workspaceId = await orchestrator.provisionWorkspace({ applicationId: APP_ID, ownerId: USER_ID });

        await expect(orchestrator.startSession({ workspaceId, userId: USER_ID })).rejects.toThrow(/health gate/);
        expect(sandbox.calls).toContain("stopWorkload");
    });

    it("ends a session: stops the workload, scales to zero, and marks the deployment stopped", async () => {
        const { sandbox, events, orchestrator } = setup();
        const workspaceId = await orchestrator.provisionWorkspace({ applicationId: APP_ID, ownerId: USER_ID });
        const session = await orchestrator.startSession({ workspaceId, userId: USER_ID });

        await orchestrator.endSession(session.id);

        expect(orchestrator.getSession(session.id)?.status).toBe("expired");
        expect(orchestrator.getAppRuntimeUrl(session.id)).toBeUndefined();
        expect(sandbox.calls).toContain("stopWorkload");
        expect(sandbox.calls).toContain("scaleToZero");
        expect(orchestrator.listDeployments(workspaceId)[0]?.status).toBe("stopped");
        expect(events.at(-1)).toEqual({ event: "session-state-changed", sessionId: session.id, status: "expired" });
    });

    it("reverts: rebuilds a prior revision and health-gated-supersedes the running deployment", async () => {
        const { sandbox, repo, build, events, orchestrator } = setup();
        const workspaceId = await orchestrator.provisionWorkspace({ applicationId: APP_ID, ownerId: USER_ID });
        const session = await orchestrator.startSession({ workspaceId, userId: USER_ID });
        const firstDeploymentId = session.deploymentId;

        const state = await orchestrator.recover(session.id, "revert");

        expect(state).toBe("recovered");
        expect(repo.calls).toContain("revertToTag");
        // Two builds (baseline on start, reverted revision on recover).
        expect(build.builds).toHaveLength(2);
        // A new revision was created for the revert.
        expect(orchestrator.listRevisions(workspaceId)).toHaveLength(2);

        // The new deployment is healthy and the previous one was superseded.
        const deployments = orchestrator.listDeployments(workspaceId);
        expect(deployments[0]?.status).toBe("healthy");
        const superseded = deployments.find((d) => d.id === firstDeploymentId);
        expect(superseded?.status).toBe("superseded");

        // The App Runtime URL repointed to the new workload, and the old one was stopped.
        expect(orchestrator.getAppRuntimeUrl(session.id)).toBe("http://fake-runtime:8081");
        expect(sandbox.calls).toEqual(["createNamespace", "startWorkload", "startWorkload", "stopWorkload"]);

        const recoveryStates = events.filter((e) => e.event === "recovery-state-changed").map((e) => e.state);
        expect(recoveryStates).toEqual(["building", "recovered"]);
    });

    it("routes a build failure on revert into the recovery machine", async () => {
        const { build, orchestrator } = setup();
        const workspaceId = await orchestrator.provisionWorkspace({ applicationId: APP_ID, ownerId: USER_ID });
        const session = await orchestrator.startSession({ workspaceId, userId: USER_ID });

        build.succeed = false;
        const state = await orchestrator.recover(session.id, "revert");

        expect(state).toBe("build_failed");
        // The reverted revision is recorded as failed.
        expect(orchestrator.listRevisions(workspaceId)[0]?.buildStatus).toBe("failed");
    });

    it("auto-repair is a pure state transition while codegen is deferred", async () => {
        const { build, orchestrator } = setup();
        const workspaceId = await orchestrator.provisionWorkspace({ applicationId: APP_ID, ownerId: USER_ID });
        const session = await orchestrator.startSession({ workspaceId, userId: USER_ID });

        expect(await orchestrator.recover(session.id, "auto_repair")).toBe("recovered");
        // No rebuild happened.
        expect(build.builds).toHaveLength(1);
    });

    it("runs a codegen job: records it, adopts and builds the produced revision, and advances the workspace", async () => {
        const { build, events, codegen, orchestrator } = setup();
        const workspaceId = await orchestrator.provisionWorkspace({ applicationId: APP_ID, ownerId: USER_ID });
        const baselineRevisionId = orchestrator.getWorkspace(workspaceId)?.currentRevisionId;

        const result = await orchestrator.runCodegenJob({
            workspaceId,
            kind: "generate",
            prompt: "Add a button",
            context: [],
        });

        expect(result.succeeded).toBe(true);
        expect(result.producedRevisionId).toBe(codegen.revisionId);

        // The produced revision was adopted, built, and made current.
        const current = orchestrator.getWorkspace(workspaceId)?.currentRevisionId;
        expect(current).toBe(codegen.revisionId);
        expect(current).not.toBe(baselineRevisionId);
        const revisions = orchestrator.listRevisions(workspaceId);
        expect(revisions[0]?.id).toBe(codegen.revisionId);
        expect(revisions[0]?.buildStatus).toBe("succeeded");
        expect(revisions[0]?.parentRevisionId).toBe(baselineRevisionId);
        expect(revisions[0]?.originCodegenJobId).toBeDefined();
        expect(build.builds).toHaveLength(1);

        // The job is recorded as succeeded.
        const jobs = orchestrator.listCodegenJobs(workspaceId);
        expect(jobs).toHaveLength(1);
        expect(jobs[0]?.status).toBe("succeeded");
        expect(jobs[0]?.producedRevisionId).toBe(codegen.revisionId);
        expect(jobs[0]?.branch).toBe(`codegen/${codegen.revisionId}`);

        // Progress events were emitted for every step, including the build.
        const progressSteps = events
            .filter((e) => e.event === "codegen-job-progress")
            .map((e) => `${e.step}:${e.phase}`);
        expect(progressSteps).toContain("planned-diff:started");
        expect(progressSteps).toContain("commit:completed");
        expect(progressSteps).toContain("build:started");
        expect(progressSteps).toContain("build:completed");
        expect(result.steps.map((s) => `${s.step}:${s.phase}`)).toContain("build:completed");
    });

    it("deploys the generated revision on the next session start", async () => {
        const { orchestrator, codegen } = setup();
        const workspaceId = await orchestrator.provisionWorkspace({ applicationId: APP_ID, ownerId: USER_ID });
        await orchestrator.runCodegenJob({ workspaceId, kind: "generate", prompt: "Add a button", context: [] });

        const session = await orchestrator.startSession({ workspaceId, userId: USER_ID });

        expect(session.status).toBe("active");
        const deployments = orchestrator.listDeployments(workspaceId);
        expect(deployments[0]?.status).toBe("healthy");
        expect(deployments[0]?.revisionId).toBe(codegen.revisionId);
    });

    it("records a failed codegen job without advancing the workspace when the agent produces nothing", async () => {
        const { codegen, build, orchestrator } = setup();
        codegen.succeed = false;
        const workspaceId = await orchestrator.provisionWorkspace({ applicationId: APP_ID, ownerId: USER_ID });
        const baselineRevisionId = orchestrator.getWorkspace(workspaceId)?.currentRevisionId;

        const result = await orchestrator.runCodegenJob({
            workspaceId,
            kind: "generate",
            prompt: "Do nothing",
            context: [],
        });

        expect(result.succeeded).toBe(false);
        expect(result.producedRevisionId).toBeUndefined();
        // The workspace stayed on the baseline; no build ran.
        expect(orchestrator.getWorkspace(workspaceId)?.currentRevisionId).toBe(baselineRevisionId);
        expect(orchestrator.listRevisions(workspaceId)).toHaveLength(1);
        expect(build.builds).toHaveLength(0);
        expect(orchestrator.listCodegenJobs(workspaceId)[0]?.status).toBe("failed");
    });
});
