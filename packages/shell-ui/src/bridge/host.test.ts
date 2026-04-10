import { describe, expect, it, vi } from "vitest";

import type { ShellToAppMessage } from "@datonfly-autocode/core";

import { createBridgeHost, type BridgeMessageSource, type BridgeTargetWindow } from "./host.js";

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

const APP_ORIGIN = "https://app.example";

function createHarness(): {
    source: FakeMessageSource;
    sent: ShellToAppMessage[];
    targetWindow: BridgeTargetWindow;
} {
    const source = new FakeMessageSource();
    const sent: ShellToAppMessage[] = [];
    const targetWindow: BridgeTargetWindow = {
        postMessage(message, targetOrigin): void {
            expect(targetOrigin).toBe(APP_ORIGIN);
            sent.push(message);
        },
    };
    return { source, sent, targetWindow };
}

describe("createBridgeHost", () => {
    it("routes a valid ready message from the expected origin", () => {
        const { source, targetWindow } = createHarness();
        const onReady = vi.fn();
        createBridgeHost({ targetWindow, appOrigin: APP_ORIGIN, messageSource: source, onReady });

        source.emit({ type: "ready", hookContractVersion: "1.0.0" }, APP_ORIGIN);

        expect(onReady).toHaveBeenCalledExactlyOnceWith("1.0.0");
    });

    it("routes an operate-result message back to the caller", () => {
        const { source, targetWindow } = createHarness();
        const onOperateResult = vi.fn();
        createBridgeHost({ targetWindow, appOrigin: APP_ORIGIN, messageSource: source, onOperateResult });

        source.emit({ type: "operate-result", correlationId: "c1", ok: true, result: { count: 2 } }, APP_ORIGIN);

        expect(onOperateResult).toHaveBeenCalledExactlyOnceWith({
            correlationId: "c1",
            ok: true,
            result: { count: 2 },
            error: undefined,
        });
    });

    it("drops messages from an unexpected origin", () => {
        const { source, targetWindow } = createHarness();
        const onReady = vi.fn();
        createBridgeHost({ targetWindow, appOrigin: APP_ORIGIN, messageSource: source, onReady });

        source.emit({ type: "ready", hookContractVersion: "1.0.0" }, "https://evil.example");

        expect(onReady).not.toHaveBeenCalled();
    });

    it("drops structurally invalid messages", () => {
        const { source, targetWindow } = createHarness();
        const onHeartbeat = vi.fn();
        createBridgeHost({ targetWindow, appOrigin: APP_ORIGIN, messageSource: source, onHeartbeat });

        source.emit({ type: "heartbeat", sentAt: -1 }, APP_ORIGIN);

        expect(onHeartbeat).not.toHaveBeenCalled();
    });

    it("sends a well-formed recovery command", () => {
        const { source, sent, targetWindow } = createHarness();
        const host = createBridgeHost({ targetWindow, appOrigin: APP_ORIGIN, messageSource: source });

        host.sendRecoveryCommand("auto_repair");

        expect(sent).toEqual([{ type: "recovery-command", command: "auto_repair" }]);
    });

    it("sends a well-formed operate dispatch", () => {
        const { source, sent, targetWindow } = createHarness();
        const host = createBridgeHost({ targetWindow, appOrigin: APP_ORIGIN, messageSource: source });

        host.sendOperateDispatch({ correlationId: "c2", toolName: "rename", parameters: { id: "1" } });

        expect(sent).toEqual([
            { type: "operate-dispatch", correlationId: "c2", toolName: "rename", parameters: { id: "1" } },
        ]);
    });

    it("stops routing after dispose", () => {
        const { source, targetWindow } = createHarness();
        const onReady = vi.fn();
        const host = createBridgeHost({ targetWindow, appOrigin: APP_ORIGIN, messageSource: source, onReady });

        host.dispose();
        source.emit({ type: "ready", hookContractVersion: "1.0.0" }, APP_ORIGIN);

        expect(source.hasListener).toBe(false);
        expect(onReady).not.toHaveBeenCalled();
    });
});
