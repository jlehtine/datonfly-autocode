import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";

import { HOOK_CONTRACT_VERSION } from "@datonfly-autocode/core";

import { createBridgeClient, type BridgeClient, type BridgeRuntimeError } from "../bridge/client.js";
import type { OperateRegistry } from "../operate/registry.js";

/**
 * Application bootstrap.
 *
 * Wires a per-user application into the framework Shell: renders the application
 * root, connects the typed Shell bridge, forwards Operate dispatches to the
 * application's {@link OperateRegistry}, reports uncaught runtime failures, and
 * announces readiness with a periodic heartbeat. Returns a disposable handle so
 * tests and hot-reload paths can tear the wiring down cleanly.
 */

/** Default heartbeat interval, in milliseconds. */
const DEFAULT_HEARTBEAT_INTERVAL_MS = 5000;

/** Configuration for {@link bootstrap}. */
export interface BootstrapOptions {
    /** DOM element the application root is rendered into. */
    rootElement: HTMLElement;
    /** The application root node to render. */
    root: ReactNode;
    /** Expected origin of the Shell, used for bridge origin checks. */
    shellOrigin: string;
    /** Hook contract version announced in the `ready` message (defaults to the SDK's). */
    hookContractVersion?: string;
    /** Heartbeat interval in milliseconds (defaults to 5000). */
    heartbeatIntervalMs?: number;
    /** Operate registry dispatched Operate tools are routed to. */
    operate?: OperateRegistry;
    /** Invoked when the Shell requests navigation. */
    onNavigate?: (path: string) => void;
    /** Invoked when the Shell issues a recovery command. */
    onRecoveryCommand?: (command: "auto_repair" | "revert" | "vanilla") => void;
}

/** Disposable handle returned by {@link bootstrap}. */
export interface BootstrapHandle {
    /** The connected bridge client. */
    bridge: BridgeClient;
    /** Tear down the bridge, timers, error handlers, and React root. */
    dispose(): void;
}

/** Render and connect a per-user application to the Shell. */
export function bootstrap(options: BootstrapOptions): BootstrapHandle {
    const {
        rootElement,
        root,
        shellOrigin,
        operate,
        onNavigate,
        onRecoveryCommand,
        hookContractVersion = HOOK_CONTRACT_VERSION,
        heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
    } = options;

    const reactRoot = createRoot(rootElement);
    reactRoot.render(root);

    const bridge = createBridgeClient({
        targetWindow: window.parent,
        shellOrigin,
        ...(onNavigate ? { onNavigate } : {}),
        ...(onRecoveryCommand ? { onRecoveryCommand } : {}),
        onOperateDispatch: ({ correlationId, toolName, parameters }) => {
            if (operate === undefined) {
                bridge.sendOperateResult({ correlationId, ok: false, error: `Unknown Operate tool "${toolName}".` });
                return;
            }
            void operate.dispatch(toolName, parameters).then((outcome) => {
                bridge.sendOperateResult({ correlationId, ...outcome });
            });
        },
    });

    const reportError = (error: BridgeRuntimeError): void => {
        bridge.sendRuntimeError(error);
    };
    const handleError = (event: ErrorEvent): void => {
        reportError({
            name: event.error instanceof Error ? event.error.name : undefined,
            message: event.message,
            stack: event.error instanceof Error ? event.error.stack : undefined,
            source: event.filename,
        });
    };
    const handleRejection = (event: PromiseRejectionEvent): void => {
        const reason: unknown = event.reason;
        reportError({
            name: reason instanceof Error ? reason.name : undefined,
            message: reason instanceof Error ? reason.message : "Unhandled promise rejection.",
            stack: reason instanceof Error ? reason.stack : undefined,
        });
    };
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    bridge.sendReady(hookContractVersion);
    const heartbeat = setInterval(() => {
        bridge.sendHeartbeat();
    }, heartbeatIntervalMs);

    return {
        bridge,
        dispose(): void {
            clearInterval(heartbeat);
            window.removeEventListener("error", handleError);
            window.removeEventListener("unhandledrejection", handleRejection);
            bridge.dispose();
            reactRoot.unmount();
        },
    };
}
