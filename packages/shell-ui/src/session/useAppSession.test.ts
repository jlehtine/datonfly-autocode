import { describe, expect, it } from "vitest";

import { appSessionReducer, HEARTBEAT_STALL_TIMEOUT_MS, initialAppSessionState } from "./useAppSession.js";

describe("appSessionReducer", () => {
    it("starts in the connecting status", () => {
        expect(initialAppSessionState.status).toBe("connecting");
    });

    it("moves to live and records the hook contract version on ready", () => {
        const state = appSessionReducer(initialAppSessionState, {
            type: "ready",
            hookContractVersion: "1.0.0",
            at: 1_000,
        });

        expect(state.status).toBe("live");
        expect(state.hookContractVersion).toBe("1.0.0");
        expect(state.lastSeenAt).toBe(1_000);
    });

    it("clears prior errors when the application reloads (ready)", () => {
        const errored = appSessionReducer(initialAppSessionState, { type: "build-error", summary: "boom" });
        const recovered = appSessionReducer(errored, { type: "ready", hookContractVersion: "1.0.0", at: 2_000 });

        expect(recovered.status).toBe("live");
        expect(recovered.buildError).toBeUndefined();
    });

    it("records the latest navigated path", () => {
        const state = appSessionReducer(initialAppSessionState, { type: "navigated", path: "/reports" });

        expect(state.currentPath).toBe("/reports");
    });

    it("enters errored on a runtime error and keeps it through heartbeats", () => {
        const errored = appSessionReducer(initialAppSessionState, {
            type: "runtime-error",
            error: { message: "kaboom" },
        });
        expect(errored.status).toBe("errored");

        const afterBeat = appSessionReducer(errored, { type: "heartbeat", at: 5_000 });
        expect(afterBeat.status).toBe("errored");
    });

    it("demotes a live session to stalled when heartbeats stop", () => {
        const live = appSessionReducer(initialAppSessionState, {
            type: "ready",
            hookContractVersion: "1.0.0",
            at: 1_000,
        });

        const fresh = appSessionReducer(live, { type: "tick", at: 1_000 + HEARTBEAT_STALL_TIMEOUT_MS });
        expect(fresh.status).toBe("live");

        const stale = appSessionReducer(live, { type: "tick", at: 1_000 + HEARTBEAT_STALL_TIMEOUT_MS + 1 });
        expect(stale.status).toBe("stalled");
    });

    it("revives a stalled session on the next heartbeat", () => {
        const stalled = { ...initialAppSessionState, status: "stalled" as const, lastSeenAt: 1_000 };
        const revived = appSessionReducer(stalled, { type: "heartbeat", at: 30_000 });

        expect(revived.status).toBe("live");
        expect(revived.lastSeenAt).toBe(30_000);
    });
});
