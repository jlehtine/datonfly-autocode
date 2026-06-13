import { useCallback, useEffect, useReducer, useState } from "react";
import { io } from "socket.io-client";

import {
    CONTROL_PLANE_EVENT_CHANNEL,
    controlPlaneEventSchema,
    WS_PATH,
    type RecoveryChoice,
    type RecoveryState,
    type SessionStatus,
    type StartSessionResponse,
} from "@datonfly-autocode/core";

import { listWorkspaces, recoverSession, startCodegenJob, startSession } from "./client.js";

/** Coarse status of the control-plane session, including pre-start/error phases. */
export type ControlPlaneStatus = "initializing" | SessionStatus | "error";

/** Snapshot of the control-plane session driving the Shell. */
export interface ControlPlaneSessionState {
    /** Current session status (or `initializing` / `error`). */
    status: ControlPlaneStatus;
    /** Current recovery state, once a session exists. */
    recoveryState: RecoveryState | undefined;
    /** Reachable App Runtime URL the `<iframe>` is pointed at. */
    appRuntimeUrl: string | undefined;
    /** Active session id, once started. */
    sessionId: string | undefined;
    /** Workspace the session operates on. */
    workspaceId: string | undefined;
    /** Failure detail when {@link status} is `error`. */
    error: string | undefined;
}

const INITIAL_STATE: ControlPlaneSessionState = {
    status: "initializing",
    recoveryState: undefined,
    appRuntimeUrl: undefined,
    sessionId: undefined,
    workspaceId: undefined,
    error: undefined,
};

/** A discrete codegen step rendered in the Generate panel. */
export interface CodegenStepView {
    /** Which step the agent / orchestrator reported. */
    step: "planned-diff" | "commit" | "build" | "deploy";
    /** Whether the step started or completed. */
    phase: "started" | "completed";
    /** Success flag carried on completed steps that can fail (e.g. build). */
    ok?: boolean;
}

/** Coarse status of a Generate run. */
export type CodegenRunStatus = "idle" | "running" | "succeeded" | "failed";

/** Live state of the most recent Generate run. */
export interface CodegenState {
    /** Current run status. */
    status: CodegenRunStatus;
    /** Recorded job id, known once the run settles. */
    jobId: string | undefined;
    /** Ordered steps streamed over the lifetime of the active run. */
    steps: CodegenStepView[];
    /** Failure detail when {@link status} is `failed`. */
    error: string | undefined;
}

/** Initial (idle) Generate state. */
export const initialCodegenState: CodegenState = {
    status: "idle",
    jobId: undefined,
    steps: [],
    error: undefined,
};

/** Actions folded into {@link CodegenState} by {@link codegenReducer}. */
export type CodegenAction =
    | { type: "submit" }
    | { type: "progress"; step: CodegenStepView["step"]; phase: CodegenStepView["phase"]; ok?: boolean }
    | { type: "settled"; status: "succeeded" | "failed"; jobId?: string; error?: string };

/**
 * Fold codegen progress and lifecycle actions into the Generate state.
 *
 * Progress events are accepted only while a run is in flight (a single active
 * Generate at a time this slice), so they need no job-id filtering before the
 * POST resolves with the recorded job.
 */
export function codegenReducer(state: CodegenState, action: CodegenAction): CodegenState {
    switch (action.type) {
        case "submit":
            return { status: "running", jobId: undefined, steps: [], error: undefined };
        case "progress":
            if (state.status !== "running") {
                return state;
            }
            return {
                ...state,
                steps: [
                    ...state.steps,
                    { step: action.step, phase: action.phase, ...(action.ok !== undefined ? { ok: action.ok } : {}) },
                ],
            };
        case "settled":
            return {
                ...state,
                status: action.status,
                ...(action.jobId !== undefined ? { jobId: action.jobId } : {}),
                ...(action.error !== undefined ? { error: action.error } : {}),
            };
    }
}

/**
 * Single-flight start of the demo session.
 *
 * Module-scoped so React StrictMode's double-mount (and any remount) reuses the
 * same in-flight start instead of provisioning a second App Runtime container.
 */
let sessionStartPromise: Promise<StartSessionResponse> | null = null;

function ensureSession(): Promise<StartSessionResponse> {
    sessionStartPromise ??= (async (): Promise<StartSessionResponse> => {
        const workspaces = await listWorkspaces();
        const workspace = workspaces[0];
        if (!workspace) {
            throw new Error("No workspace available to start a session");
        }
        return startSession(workspace.id);
    })();
    return sessionStartPromise;
}

/**
 * Start a control-plane session for the seeded demo workspace and track its
 * live state.
 *
 * On mount the hook opens a Socket.io connection for `controlPlaneEvent`
 * updates and starts a session against the first workspace, exposing the
 * resulting status, recovery state, and App Runtime URL. The returned
 * {@link recover} action POSTs a recovery choice and folds the updated session
 * back into state; {@link generate} POSTs a Generate prompt and tracks its live
 * progress (streamed as `codegen-job-progress`).
 */
export function useControlPlaneSession(): {
    state: ControlPlaneSessionState;
    codegen: CodegenState;
    recover: (choice: RecoveryChoice) => Promise<void>;
    generate: (prompt: string) => Promise<void>;
} {
    const [state, setState] = useState<ControlPlaneSessionState>(INITIAL_STATE);
    const [codegen, dispatchCodegen] = useReducer(codegenReducer, initialCodegenState);

    useEffect(() => {
        let active = true;
        let currentSessionId: string | undefined;
        let currentWorkspaceId: string | undefined;

        const socket = io({ path: WS_PATH, transports: ["websocket", "polling"] });
        socket.on(CONTROL_PLANE_EVENT_CHANNEL, (raw: unknown) => {
            const parsed = controlPlaneEventSchema.safeParse(raw);
            if (!parsed.success) {
                return;
            }
            const event = parsed.data;
            if (event.event === "session-state-changed" && event.sessionId === currentSessionId) {
                setState((prev) => ({ ...prev, status: event.status }));
            } else if (event.event === "recovery-state-changed" && event.sessionId === currentSessionId) {
                setState((prev) => ({ ...prev, recoveryState: event.state }));
            } else if (event.event === "codegen-job-progress") {
                dispatchCodegen({
                    type: "progress",
                    step: event.step,
                    phase: event.phase,
                    ...(event.ok !== undefined ? { ok: event.ok } : {}),
                });
            } else if (
                event.event === "deployment-state-changed" &&
                event.workspaceId === currentWorkspaceId &&
                event.appRuntimeUrl !== undefined
            ) {
                // A new deployment became healthy (initial deploy, supersede, or
                // revert): repoint the iframe at the freshly served revision.
                const { appRuntimeUrl } = event;
                setState((prev) => ({ ...prev, appRuntimeUrl }));
            }
        });

        ensureSession()
            .then(({ session, appRuntimeUrl }) => {
                if (!active) {
                    return;
                }
                currentSessionId = session.id;
                currentWorkspaceId = session.workspaceId;
                setState({
                    status: session.status,
                    recoveryState: session.recoveryState,
                    appRuntimeUrl,
                    sessionId: session.id,
                    workspaceId: session.workspaceId,
                    error: undefined,
                });
            })
            .catch((error: unknown) => {
                if (!active) {
                    return;
                }
                setState((prev) => ({
                    ...prev,
                    status: "error",
                    error: error instanceof Error ? error.message : String(error),
                }));
            });

        return (): void => {
            active = false;
            socket.disconnect();
        };
    }, []);

    const recover = useCallback(
        async (choice: RecoveryChoice): Promise<void> => {
            if (!state.sessionId) {
                return;
            }
            const session = await recoverSession(state.sessionId, choice);
            setState((prev) => ({ ...prev, status: session.status, recoveryState: session.recoveryState }));
        },
        [state.sessionId],
    );

    const generate = useCallback(
        async (prompt: string): Promise<void> => {
            if (!state.workspaceId) {
                return;
            }
            dispatchCodegen({ type: "submit" });
            try {
                const job = await startCodegenJob(prompt, state.workspaceId);
                dispatchCodegen({
                    type: "settled",
                    status: job.status === "succeeded" ? "succeeded" : "failed",
                    jobId: job.id,
                });
            } catch (error) {
                dispatchCodegen({
                    type: "settled",
                    status: "failed",
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        },
        [state.workspaceId],
    );

    return { state, codegen, recover, generate };
}
