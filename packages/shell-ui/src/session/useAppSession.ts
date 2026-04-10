import { useEffect, useMemo, useReducer } from "react";

import type { BridgeRuntimeError } from "../bridge/host.js";

/**
 * Bridge-derived application session state.
 *
 * In this slice the Shell does not talk to a control plane, so the session view
 * is reconstructed purely from bridge traffic: the application's `ready` and
 * `heartbeat` messages drive a coarse liveness status, while `navigated`,
 * `build-error`, and `runtime-error` messages record the latest location and
 * failure. A periodic tick demotes a live session to `stalled` when heartbeats
 * stop arriving.
 */

/** Coarse liveness of the embedded application, derived from bridge traffic. */
export type AppSessionStatus = "connecting" | "live" | "stalled" | "errored";

/** A snapshot of the bridge-derived session state. */
export interface AppSessionState {
    /** Current liveness status. */
    status: AppSessionStatus;
    /** Hook contract version reported in the application's `ready` message. */
    hookContractVersion: string | undefined;
    /** Wall-clock time (ms) the most recent heartbeat or ready was observed. */
    lastSeenAt: number | undefined;
    /** Most recent in-app path reported by the application. */
    currentPath: string | undefined;
    /** Summary of the most recent build failure, if any. */
    buildError: string | undefined;
    /** Detail of the most recent runtime failure, if any. */
    runtimeError: BridgeRuntimeError | undefined;
}

/** An event folded into {@link AppSessionState} by {@link appSessionReducer}. */
export type AppSessionEvent =
    | { type: "ready"; hookContractVersion: string; at: number }
    | { type: "heartbeat"; at: number }
    | { type: "navigated"; path: string }
    | { type: "build-error"; summary: string }
    | { type: "runtime-error"; error: BridgeRuntimeError }
    | { type: "tick"; at: number };

/** Milliseconds without a heartbeat after which a live session is considered stalled. */
export const HEARTBEAT_STALL_TIMEOUT_MS = 15_000;

/** The initial session state before any bridge traffic is observed. */
export const initialAppSessionState: AppSessionState = {
    status: "connecting",
    hookContractVersion: undefined,
    lastSeenAt: undefined,
    currentPath: undefined,
    buildError: undefined,
    runtimeError: undefined,
};

/**
 * Fold a bridge-derived {@link AppSessionEvent} into the session state.
 *
 * Pure and side-effect-free so it can be unit-tested without a DOM or React.
 */
export function appSessionReducer(state: AppSessionState, event: AppSessionEvent): AppSessionState {
    switch (event.type) {
        case "ready":
            return {
                ...state,
                status: "live",
                hookContractVersion: event.hookContractVersion,
                lastSeenAt: event.at,
                buildError: undefined,
                runtimeError: undefined,
            };
        case "heartbeat":
            return {
                ...state,
                status: state.status === "errored" ? "errored" : "live",
                lastSeenAt: event.at,
            };
        case "navigated":
            return { ...state, currentPath: event.path };
        case "build-error":
            return { ...state, status: "errored", buildError: event.summary };
        case "runtime-error":
            return { ...state, status: "errored", runtimeError: event.error };
        case "tick": {
            if (state.status !== "live" || state.lastSeenAt === undefined) {
                return state;
            }
            if (event.at - state.lastSeenAt > HEARTBEAT_STALL_TIMEOUT_MS) {
                return { ...state, status: "stalled" };
            }
            return state;
        }
    }
}

/** Bridge callbacks that feed {@link useAppSession}; pass these to `createBridgeHost`. */
export interface AppSessionBridgeCallbacks {
    onReady: (hookContractVersion: string) => void;
    onHeartbeat: (sentAt: number) => void;
    onNavigated: (path: string) => void;
    onBuildError: (summary: string) => void;
    onRuntimeError: (error: BridgeRuntimeError) => void;
}

/**
 * Track the embedded application's session state from bridge traffic.
 *
 * Returns the current {@link AppSessionState} together with the bridge callbacks
 * that feed it; pass the callbacks to {@link createBridgeHost}. A timer demotes a
 * live session to `stalled` when heartbeats stop.
 */
export function useAppSession(): { state: AppSessionState; callbacks: AppSessionBridgeCallbacks } {
    const [state, dispatch] = useReducer(appSessionReducer, initialAppSessionState);

    useEffect(() => {
        const interval = setInterval(() => {
            dispatch({ type: "tick", at: Date.now() });
        }, HEARTBEAT_STALL_TIMEOUT_MS);
        return (): void => {
            clearInterval(interval);
        };
    }, []);

    const callbacks = useMemo<AppSessionBridgeCallbacks>(
        () => ({
            onReady: (hookContractVersion): void => {
                dispatch({ type: "ready", hookContractVersion, at: Date.now() });
            },
            onHeartbeat: (): void => {
                dispatch({ type: "heartbeat", at: Date.now() });
            },
            onNavigated: (path): void => {
                dispatch({ type: "navigated", path });
            },
            onBuildError: (summary): void => {
                dispatch({ type: "build-error", summary });
            },
            onRuntimeError: (error): void => {
                dispatch({ type: "runtime-error", error });
            },
        }),
        [],
    );

    return { state, callbacks };
}
