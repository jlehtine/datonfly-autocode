import type { ExtensionHook } from "@datonfly-autocode/core";

/**
 * In-memory registry of {@link ExtensionHook} descriptors an application exposes.
 *
 * Generated code registers menus, routes, panels, widgets, and data sources
 * here; the Shell and codegen tooling read the registered descriptors back.
 * Registrations are keyed by their stable `id`.
 */
export interface HookRegistry {
    /**
     * Register an extension hook descriptor.
     *
     * @throws If a hook with the same `id` is already registered.
     */
    register(hook: ExtensionHook): void;
    /** Return the hook registered under `id`, or `undefined` if none. */
    get(id: string): ExtensionHook | undefined;
    /** Return all registered hooks in registration order. */
    list(): ExtensionHook[];
}

/** Create an empty {@link HookRegistry}. */
export function createHookRegistry(): HookRegistry {
    const hooks = new Map<string, ExtensionHook>();

    return {
        register(hook: ExtensionHook): void {
            if (hooks.has(hook.id)) {
                throw new Error(`Extension hook "${hook.id}" is already registered.`);
            }
            hooks.set(hook.id, hook);
        },
        get(id: string): ExtensionHook | undefined {
            return hooks.get(id);
        },
        list(): ExtensionHook[] {
            return [...hooks.values()];
        },
    };
}
