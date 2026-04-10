import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { OperateTool } from "@datonfly-autocode/core";

import { createOperateRegistry } from "./registry.js";

const renameTool = {
    name: "renameItem",
    description: "Rename an item by id.",
    parameters: z.object({ id: z.string(), name: z.string() }),
    sideEffect: "write",
} satisfies OperateTool;

describe("createOperateRegistry", () => {
    it("validates parameters and invokes the handler on success", async () => {
        const registry = createOperateRegistry();
        registry.register(renameTool, (params) => `renamed ${params.id} to ${params.name}`);

        const outcome = await registry.dispatch("renameItem", { id: "42", name: "Q3" });

        expect(outcome).toEqual({ ok: true, result: "renamed 42 to Q3" });
    });

    it("rejects invalid parameters without invoking the handler", async () => {
        const registry = createOperateRegistry();
        let called = false;
        registry.register(renameTool, () => {
            called = true;
        });

        const outcome = await registry.dispatch("renameItem", { id: "42" });

        expect(outcome.ok).toBe(false);
        expect(called).toBe(false);
    });

    it("reports an unknown tool", async () => {
        const registry = createOperateRegistry();

        const outcome = await registry.dispatch("missing", {});

        expect(outcome).toEqual({ ok: false, error: 'Unknown Operate tool "missing".' });
    });

    it("captures a handler failure as an error result", async () => {
        const registry = createOperateRegistry();
        registry.register(renameTool, () => {
            throw new Error("boom");
        });

        const outcome = await registry.dispatch("renameItem", { id: "42", name: "Q3" });

        expect(outcome).toEqual({ ok: false, error: "boom" });
    });

    it("rejects duplicate tool names", () => {
        const registry = createOperateRegistry();
        registry.register(renameTool, () => undefined);

        expect(() => {
            registry.register(renameTool, () => undefined);
        }).toThrow(/already registered/);
    });
});
