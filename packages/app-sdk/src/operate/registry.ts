import type { OperateTool, OperateToolParams } from "@datonfly-autocode/core";

/**
 * Operate tool registration and dispatch.
 *
 * Applications register their typed Operate tools together with a handler; the
 * Shell dispatches invocations by tool name with raw (untrusted) parameters. The
 * registry validates the parameters against the tool's Zod schema before calling
 * the handler and normalizes the outcome into an `operate-result`-shaped value.
 */

/** Handler invoked for a registered {@link OperateTool} with validated parameters. */
export type OperateHandler<TTool extends OperateTool> = (parameters: OperateToolParams<TTool>) => unknown;

/** Normalized outcome of an Operate dispatch. */
export interface OperateDispatchResult {
    /** Whether the tool invocation succeeded. */
    ok: boolean;
    /** Tool result payload on success. */
    result?: unknown;
    /** End-user-safe error message on failure. */
    error?: string;
}

/** Registry of an application's Operate tools and their handlers. */
export interface OperateRegistry {
    /** Register a tool together with the handler that performs it. */
    register<TTool extends OperateTool>(tool: TTool, handler: OperateHandler<TTool>): void;
    /** Whether a tool with the given name is registered. */
    has(name: string): boolean;
    /** Return all registered tool descriptors in registration order. */
    list(): OperateTool[];
    /**
     * Validate `rawParameters` against the named tool's schema and invoke its
     * handler. Returns a normalized result; never throws.
     */
    dispatch(name: string, rawParameters: unknown): Promise<OperateDispatchResult>;
}

interface RegisteredTool {
    tool: OperateTool;
    handler: OperateHandler<OperateTool>;
}

/** Create an empty {@link OperateRegistry}. */
export function createOperateRegistry(): OperateRegistry {
    const tools = new Map<string, RegisteredTool>();

    return {
        register<TTool extends OperateTool>(tool: TTool, handler: OperateHandler<TTool>): void {
            if (tools.has(tool.name)) {
                throw new Error(`Operate tool "${tool.name}" is already registered.`);
            }
            tools.set(tool.name, { tool, handler });
        },
        has(name: string): boolean {
            return tools.has(name);
        },
        list(): OperateTool[] {
            return [...tools.values()].map((entry) => entry.tool);
        },
        async dispatch(name: string, rawParameters: unknown): Promise<OperateDispatchResult> {
            const entry = tools.get(name);
            if (entry === undefined) {
                return { ok: false, error: `Unknown Operate tool "${name}".` };
            }
            const parsed = entry.tool.parameters.safeParse(rawParameters);
            if (!parsed.success) {
                return { ok: false, error: `Invalid parameters for Operate tool "${name}".` };
            }
            try {
                const result: unknown = await entry.handler(parsed.data);
                return { ok: true, result };
            } catch (error) {
                return { ok: false, error: error instanceof Error ? error.message : "Operate tool failed." };
            }
        },
    };
}
