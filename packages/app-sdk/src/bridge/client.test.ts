import { describe, expect, it, vi } from "vitest";

import type { AppToShellMessage } from "@datonfly-autocode/core";

import { createBridgeClient, type BridgeMessageSource, type BridgeTargetWindow } from "./client.js";

class FakeMessageSource implements BridgeMessageSource {
    private listener: ((event: MessageEvent) => void) | undefined;

    addEventListener(_type: "message", listener: (event: MessageEvent) => void): void {
        this.listener = listener;
    }

    removeEventListener(_type: "message", listener: (event: MessageEvent) => void): void {
        if (this.listener === listener) {
            this.listener = undefined;
        }
    }

    emit(data: unknown, origin: string): void {
        this.listener?.({ data, origin } as MessageEvent);
    }

    get hasListener(): boolean {
        return this.listener !== undefined;
    }
}

const SHELL_ORIGIN = "https://shell.example";

function createHarness(): {
    source: FakeMessageSource;
    sent: AppToShellMessage[];
    targetWindow: BridgeTargetWindow;
} {
    const source = new FakeMessageSource();
    const sent: AppToShellMessage[] = [];
    const targetWindow: BridgeTargetWindow = {
        postMessage(message, targetOrigin): void {
            expect(targetOrigin).toBe(SHELL_ORIGIN);
            sent.push(message);
        },
    };
    return { source, sent, targetWindow };
}

describe("createBridgeClient", () => {
    it("routes a valid navigate message from the expected origin", () => {
        const { source, targetWindow } = createHarness();
        const onNavigate = vi.fn();
        createBridgeClient({ targetWindow, shellOrigin: SHELL_ORIGIN, messageSource: source, onNavigate });

        source.emit({ type: "navigate", path: "/reports" }, SHELL_ORIGIN);

        expect(onNavigate).toHaveBeenCalledExactlyOnceWith("/reports");
    });

    it("drops messages from an unexpected origin", () => {
        const { source, targetWindow } = createHarness();
        const onNavigate = vi.fn();
        createBridgeClient({ targetWindow, shellOrigin: SHELL_ORIGIN, messageSource: source, onNavigate });

        source.emit({ type: "navigate", path: "/reports" }, "https://evil.example");

        expect(onNavigate).not.toHaveBeenCalled();
    });

    it("drops structurally invalid messages", () => {
        const { source, targetWindow } = createHarness();
        const onOperateDispatch = vi.fn();
        createBridgeClient({ targetWindow, shellOrigin: SHELL_ORIGIN, messageSource: source, onOperateDispatch });

        source.emit({ type: "operate-dispatch", toolName: "x" }, SHELL_ORIGIN);

        expect(onOperateDispatch).not.toHaveBeenCalled();
    });

    it("sends a well-formed ready message", () => {
        const { source, sent, targetWindow } = createHarness();
        const client = createBridgeClient({ targetWindow, shellOrigin: SHELL_ORIGIN, messageSource: source });

        client.sendReady("1.0.0");

        expect(sent).toEqual([{ type: "ready", hookContractVersion: "1.0.0" }]);
    });

    it("stops routing after dispose", () => {
        const { source, targetWindow } = createHarness();
        const onNavigate = vi.fn();
        const client = createBridgeClient({
            targetWindow,
            shellOrigin: SHELL_ORIGIN,
            messageSource: source,
            onNavigate,
        });

        client.dispose();
        source.emit({ type: "navigate", path: "/reports" }, SHELL_ORIGIN);

        expect(source.hasListener).toBe(false);
        expect(onNavigate).not.toHaveBeenCalled();
    });
});
