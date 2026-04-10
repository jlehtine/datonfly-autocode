import type { z } from "zod";

import {
    parseShellToAppMessage,
    type AppToShellMessage,
    type bridgeRuntimeErrorSchema,
    type ShellToAppMessage,
} from "@datonfly-autocode/core";

/**
 * Application-side client for the Shell ↔ application `postMessage` bridge.
 *
 * The client owns the application's side of the typed bridge contract defined in
 * `@datonfly-autocode/core`: it validates inbound Shell messages (with an origin
 * check) and exposes typed senders for every application → Shell message. Both
 * the inbound event source and the outbound target window are injectable so the
 * client can be unit-tested without a DOM.
 */

/** A runtime failure detail reported to the Shell. */
export type BridgeRuntimeError = z.infer<typeof bridgeRuntimeErrorSchema>;

/** Minimal window surface the client posts outbound messages to. */
export interface BridgeTargetWindow {
    postMessage(message: AppToShellMessage, targetOrigin: string): void;
}

/** Minimal event-target surface the client listens for inbound messages on. */
export interface BridgeMessageSource {
    addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
    removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

/** Configuration for {@link createBridgeClient}. */
export interface BridgeClientOptions {
    /** Window the application posts messages to (typically the Shell frame). */
    targetWindow: BridgeTargetWindow;
    /** Expected origin of the Shell; inbound messages from other origins are dropped. */
    shellOrigin: string;
    /** Event source inbound messages are received on (defaults to `globalThis`). */
    messageSource?: BridgeMessageSource;
    /** Invoked when the Shell requests navigation to a path. */
    onNavigate?: (path: string) => void;
    /** Invoked when the Shell dispatches an Operate tool. */
    onOperateDispatch?: (dispatch: {
        correlationId: string;
        toolName: string;
        parameters: Record<string, unknown>;
    }) => void;
    /** Invoked when the Shell issues a recovery command. */
    onRecoveryCommand?: (command: "auto_repair" | "revert" | "vanilla") => void;
}

/** Result payload echoed back for a dispatched Operate tool. */
export interface OperateResultPayload {
    /** Correlation id of the originating dispatch. */
    correlationId: string;
    /** Whether the tool invocation succeeded. */
    ok: boolean;
    /** Tool result payload on success. */
    result?: unknown;
    /** End-user-safe error message on failure. */
    error?: string;
}

/** The application's typed handle to the Shell bridge. */
export interface BridgeClient {
    /** Signal the application has loaded and is ready for commands. */
    sendReady(hookContractVersion: string): void;
    /** Send a periodic liveness heartbeat. */
    sendHeartbeat(): void;
    /** Report in-app navigation to a new path. */
    sendNavigated(path: string): void;
    /** Report a build failure surfaced at load time. */
    sendBuildError(summary: string): void;
    /** Report an uncaught runtime failure. */
    sendRuntimeError(error: BridgeRuntimeError): void;
    /** Return the result of a dispatched Operate tool. */
    sendOperateResult(payload: OperateResultPayload): void;
    /** Remove the inbound message listener. */
    dispose(): void;
}

/**
 * Create a {@link BridgeClient} bound to the Shell frame.
 *
 * Installs an origin-checked `message` listener that validates inbound payloads
 * through {@link parseShellToAppMessage} and routes them to the supplied
 * callbacks. Returns typed senders for the application → Shell messages.
 */
export function createBridgeClient(options: BridgeClientOptions): BridgeClient {
    const { targetWindow, shellOrigin, onNavigate, onOperateDispatch, onRecoveryCommand } = options;
    const source: BridgeMessageSource = options.messageSource ?? globalThis;

    const handleMessage = (event: MessageEvent): void => {
        const message: ShellToAppMessage | undefined = parseShellToAppMessage(event.data, event.origin, shellOrigin);
        if (message === undefined) {
            return;
        }
        switch (message.type) {
            case "navigate":
                onNavigate?.(message.path);
                return;
            case "operate-dispatch":
                onOperateDispatch?.({
                    correlationId: message.correlationId,
                    toolName: message.toolName,
                    parameters: message.parameters,
                });
                return;
            case "recovery-command":
                onRecoveryCommand?.(message.command);
                return;
        }
    };

    source.addEventListener("message", handleMessage);

    const post = (message: AppToShellMessage): void => {
        targetWindow.postMessage(message, shellOrigin);
    };

    return {
        sendReady(hookContractVersion: string): void {
            post({ type: "ready", hookContractVersion });
        },
        sendHeartbeat(): void {
            post({ type: "heartbeat", sentAt: Date.now() });
        },
        sendNavigated(path: string): void {
            post({ type: "navigated", path });
        },
        sendBuildError(summary: string): void {
            post({ type: "build-error", summary });
        },
        sendRuntimeError(error: BridgeRuntimeError): void {
            post({ type: "runtime-error", error });
        },
        sendOperateResult(payload: OperateResultPayload): void {
            post({
                type: "operate-result",
                correlationId: payload.correlationId,
                ok: payload.ok,
                result: payload.result,
                error: payload.error,
            });
        },
        dispose(): void {
            source.removeEventListener("message", handleMessage);
        },
    };
}
