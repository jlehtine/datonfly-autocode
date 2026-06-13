import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
    codegenJobIdSchema,
    workspaceIdSchema,
    type CodegenJob,
    type CodegenJobRequest,
    type CodegenJobResult,
} from "@datonfly-autocode/core";
import { NoCodegenProviderError, type InMemoryOrchestrator } from "@datonfly-autocode/orchestrator";

import { CodegenJobsController } from "./control-plane.controller.js";

const WORKSPACE_ID = workspaceIdSchema.parse("11111111-1111-4111-8111-111111111111");
const JOB_ID = codegenJobIdSchema.parse("22222222-2222-4222-8222-222222222222");

function generateRequest(): CodegenJobRequest {
    return { workspaceId: WORKSPACE_ID, kind: "generate", prompt: "Add a button", context: [] };
}

/**
 * Minimal orchestrator stub exposing only the codegen accessors the controller
 * uses. `runCodegenJob` appends a recorded job (or throws), so the controller's
 * before/after diff resolves the new job.
 */
class FakeOrchestrator {
    readonly jobs: CodegenJob[] = [];
    constructor(private readonly behavior: "succeed" | "no-provider") {}

    listCodegenJobs(): CodegenJob[] {
        return [...this.jobs];
    }

    getCodegenJob(): CodegenJob | undefined {
        return this.jobs[0];
    }

    runCodegenJob(): Promise<CodegenJobResult> {
        if (this.behavior === "no-provider") {
            throw new NoCodegenProviderError();
        }
        this.jobs.push({
            id: JOB_ID,
            workspaceId: WORKSPACE_ID,
            kind: "generate",
            prompt: "Add a button",
            branch: "codegen/rev-1",
            status: "succeeded",
            createdAt: new Date(),
            completedAt: new Date(),
        });
        return Promise.resolve({ succeeded: true, summary: "Added a button", steps: [] });
    }
}

function controllerFor(behavior: "succeed" | "no-provider"): {
    controller: CodegenJobsController;
    orchestrator: FakeOrchestrator;
} {
    const orchestrator = new FakeOrchestrator(behavior);
    const controller = new CodegenJobsController(orchestrator as unknown as InMemoryOrchestrator);
    return { controller, orchestrator };
}

describe("CodegenJobsController", () => {
    it("runs a generate job and returns the newly recorded job", async () => {
        const { controller } = controllerFor("succeed");

        const job = await controller.generate(generateRequest());

        expect(job.id).toBe(JOB_ID);
        expect(job.kind).toBe("generate");
        expect(job.status).toBe("succeeded");
    });

    it("fetches a recorded job by id", () => {
        const { controller, orchestrator } = controllerFor("succeed");
        orchestrator.jobs.push({
            id: JOB_ID,
            workspaceId: WORKSPACE_ID,
            kind: "generate",
            prompt: "Add a button",
            branch: "codegen/rev-1",
            status: "succeeded",
            createdAt: new Date(),
        });

        const job = controller.get(JOB_ID);

        expect(job.id).toBe(JOB_ID);
    });

    it("surfaces a 503 when no codegen provider is configured", async () => {
        const { controller } = controllerFor("no-provider");

        await expect(controller.generate(generateRequest())).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
});
