import { useCallback, useEffect, useState } from "react";
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

import { listWorkspaces, recoverSession, startSession } from "./client.js";

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
 * back into state.
 */
export function useControlPlaneSession(): {
    state: ControlPlaneSessionState;
    recover: (choice: RecoveryChoice) => Promise<void>;
} {
    const [state, setState] = useState<ControlPlaneSessionState>(INITIAL_STATE);

    useEffect(() => {
        let active = true;
        let currentSessionId: string | undefined;

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
            }
        });

        ensureSession()
            .then(({ session, appRuntimeUrl }) => {
                if (!active) {
                    return;
                }
                currentSessionId = session.id;
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

    return { state, recover };
}
