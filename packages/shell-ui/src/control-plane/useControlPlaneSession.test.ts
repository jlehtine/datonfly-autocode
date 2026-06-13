import { describe, expect, it } from "vitest";

import { codegenReducer, initialCodegenState } from "./useControlPlaneSession.js";

describe("codegenReducer", () => {
    it("starts idle", () => {
        expect(initialCodegenState.status).toBe("idle");
        expect(initialCodegenState.steps).toEqual([]);
    });

    it("resets and enters running on submit", () => {
        const dirty = {
            status: "failed" as const,
            jobId: "j1",
            steps: [{ step: "build" as const, phase: "completed" as const }],
            error: "boom",
        };

        const state = codegenReducer(dirty, { type: "submit" });

        expect(state.status).toBe("running");
        expect(state.steps).toEqual([]);
        expect(state.jobId).toBeUndefined();
        expect(state.error).toBeUndefined();
    });

    it("appends progress steps while running", () => {
        const running = codegenReducer(initialCodegenState, { type: "submit" });

        const afterPlan = codegenReducer(running, { type: "progress", step: "planned-diff", phase: "started" });
        const afterBuild = codegenReducer(afterPlan, { type: "progress", step: "build", phase: "completed", ok: true });

        expect(afterBuild.steps).toEqual([
            { step: "planned-diff", phase: "started" },
            { step: "build", phase: "completed", ok: true },
        ]);
    });

    it("ignores progress when not running", () => {
        const state = codegenReducer(initialCodegenState, { type: "progress", step: "commit", phase: "started" });

        expect(state).toBe(initialCodegenState);
    });

    it("records the job id and terminal status on settle", () => {
        const running = codegenReducer(initialCodegenState, { type: "submit" });

        const settled = codegenReducer(running, { type: "settled", status: "succeeded", jobId: "job-1" });

        expect(settled.status).toBe("succeeded");
        expect(settled.jobId).toBe("job-1");
    });

    it("captures the error on a failed settle", () => {
        const running = codegenReducer(initialCodegenState, { type: "submit" });

        const settled = codegenReducer(running, { type: "settled", status: "failed", error: "nope" });

        expect(settled.status).toBe("failed");
        expect(settled.error).toBe("nope");
    });
});
