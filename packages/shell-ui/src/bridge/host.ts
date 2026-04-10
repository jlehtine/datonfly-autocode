import type { z } from "zod";

import {
    parseAppToShellMessage,
    type AppToShellMessage,
    type bridgeRuntimeErrorSchema,
    type ShellToAppMessage,
} from "@datonfly-autocode/core";

/**
 * Shell-side host for the Shell ↔ application `postMessage` bridge.
 *
 * The host owns the framework's side of the typed bridge contract defined in
 * `@datonfly-autocode/core`. It is the mirror of the application-side
 * `createBridgeClient` from `@datonfly-autocode/app-sdk`: it validates inbound
 * application messages (with an origin check) and exposes typed senders for
 * every Shell → application message. Both the inbound event source and the
 * outbound target window are injectable so the host can be unit-tested without a
 * DOM.
 */

/** A runtime failure detail reported by the application sub-frame. */
export type BridgeRuntimeError = z.infer<typeof bridgeRuntimeErrorSchema>;

/** Minimal window surface the host posts outbound messages to. */
export interface BridgeTargetWindow {
    postMessage(message: ShellToAppMessage, targetOrigin: string): void;
}

/** Minimal event-target surface the host listens for inbound messages on. */
export interface BridgeMessageSource {
    addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
    removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

/** Result payload echoed back by the application for a dispatched Operate tool. */
export interface OperateResult {
    /** Correlation id of the originating dispatch. */
    correlationId: string;
    /** Whether the tool invocation succeeded. */
    ok: boolean;
    /** Tool result payload on success. */
    result?: unknown;
    /** End-user-safe error message on failure. */
    error?: string;
}

/** A recovery action the Shell can command the application to perform. */
export type RecoveryCommand = "auto_repair" | "revert" | "vanilla";

/** Configuration for {@link createBridgeHost}. */
export interface BridgeHostOptions {
    /** Window the Shell posts messages to (the application sub-frame). */
    targetWindow: BridgeTargetWindow;
    /** Expected origin of the application; inbound messages from other origins are dropped. */
    appOrigin: string;
    /** Event source inbound messages are received on (defaults to `globalThis`). */
    messageSource?: BridgeMessageSource;
    /** Invoked when the application signals it is ready. */
    onReady?: (hookContractVersion: string) => void;
    /** Invoked on each application liveness heartbeat. */
    onHeartbeat?: (sentAt: number) => void;
    /** Invoked when the application reports in-app navigation. */
    onNavigated?: (path: string) => void;
    /** Invoked when the application reports a build failure. */
    onBuildError?: (summary: string) => void;
    /** Invoked when the application reports an uncaught runtime failure. */
    onRuntimeError?: (error: BridgeRuntimeError) => void;
    /** Invoked when the application returns the result of a dispatched Operate tool. */
    onOperateResult?: (result: OperateResult) => void;
}

/** Parameters for an Operate tool dispatch sent to the application. */
export interface OperateDispatch {
    /** Correlation id echoed back in the matching {@link OperateResult}. */
    correlationId: string;
    /** Name of the Operate tool to invoke. */
    toolName: string;
    /** Validated parameters for the tool. */
    parameters: Record<string, unknown>;
}

/** The Shell's typed handle to the application bridge. */
export interface BridgeHost {
    /** Instruct the application to navigate to a path. */
    sendNavigate(path: string): void;
    /** Dispatch an Operate tool invocation to the application. */
    sendOperateDispatch(dispatch: OperateDispatch): void;
    /** Issue a recovery command to the application. */
    sendRecoveryCommand(command: RecoveryCommand): void;
    /** Remove the inbound message listener. */
    dispose(): void;
}

/**
 * Create a {@link BridgeHost} bound to the application sub-frame.
 *
 * Installs an origin-checked `message` listener that validates inbound payloads
 * through {@link parseAppToShellMessage} and routes them to the supplied
 * callbacks. Returns typed senders for the Shell → application messages.
 */
export function createBridgeHost(options: BridgeHostOptions): BridgeHost {
    const {
        targetWindow,
        appOrigin,
        onReady,
        onHeartbeat,
        onNavigated,
        onBuildError,
        onRuntimeError,
        onOperateResult,
    } = options;
    const source: BridgeMessageSource = options.messageSource ?? globalThis;

    const handleMessage = (event: MessageEvent): void => {
        const message: AppToShellMessage | undefined = parseAppToShellMessage(event.data, event.origin, appOrigin);
        if (message === undefined) {
            return;
        }
        switch (message.type) {
            case "ready":
                onReady?.(message.hookContractVersion);
                return;
            case "heartbeat":
                onHeartbeat?.(message.sentAt);
                return;
            case "navigated":
                onNavigated?.(message.path);
                return;
            case "build-error":
                onBuildError?.(message.summary);
                return;
            case "runtime-error":
                onRuntimeError?.(message.error);
                return;
            case "operate-result":
                onOperateResult?.({
                    correlationId: message.correlationId,
                    ok: message.ok,
                    result: message.result,
                    error: message.error,
                });
                return;
        }
    };

    source.addEventListener("message", handleMessage);

    const post = (message: ShellToAppMessage): void => {
        targetWindow.postMessage(message, appOrigin);
    };

    return {
        sendNavigate(path: string): void {
            post({ type: "navigate", path });
        },
        sendOperateDispatch(dispatch: OperateDispatch): void {
            post({
                type: "operate-dispatch",
                correlationId: dispatch.correlationId,
                toolName: dispatch.toolName,
                parameters: dispatch.parameters,
            });
        },
        sendRecoveryCommand(command: RecoveryCommand): void {
            post({ type: "recovery-command", command });
        },
        dispose(): void {
            source.removeEventListener("message", handleMessage);
        },
    };
}
