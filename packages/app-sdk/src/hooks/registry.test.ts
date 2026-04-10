import { describe, expect, it } from "vitest";

import type { ExtensionHook } from "@datonfly-autocode/core";

import { createHookRegistry } from "./registry.js";

const menuHook: ExtensionHook = {
    kind: "menu",
    id: "reports-menu",
    componentRef: "ReportsMenuItem",
    label: "Reports",
    parentMenuId: "root",
};

describe("createHookRegistry", () => {
    it("registers and lists hooks in registration order", () => {
        const registry = createHookRegistry();
        const routeHook: ExtensionHook = {
            kind: "route",
            id: "reports-route",
            componentRef: "ReportsView",
            path: "/reports",
            title: "Reports",
        };

        registry.register(menuHook);
        registry.register(routeHook);

        expect(registry.list()).toEqual([menuHook, routeHook]);
        expect(registry.get("reports-route")).toBe(routeHook);
    });

    it("rejects duplicate ids", () => {
        const registry = createHookRegistry();
        registry.register(menuHook);

        expect(() => {
            registry.register(menuHook);
        }).toThrow(/already registered/);
    });
});
