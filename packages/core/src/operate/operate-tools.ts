import type { z } from "zod";

/**
 * Operate tool contracts.
 *
 * Discoverable, typed action descriptors the assistant can invoke against the
 * running application to drive its existing functionality (no code generated).
 * Each descriptor declares a Zod parameter schema and a side-effect
 * classification the Shell uses to decide whether confirmation is required.
 */

/**
 * Side-effect classification of an Operate tool.
 *
 * - `read`: no state change (queries, navigation).
 * - `write`: creates or updates state, reversibly.
 * - `destructive`: deletes or irreversibly alters state; warrants confirmation.
 */
export type SideEffectClass = "read" | "write" | "destructive";

/** Runtime constant mapping each {@link SideEffectClass} to itself. */
export const SIDE_EFFECT_CLASSES = {
    read: "read",
    write: "write",
    destructive: "destructive",
} as const satisfies Record<SideEffectClass, SideEffectClass>;

/**
 * A typed, discoverable Operate tool descriptor.
 *
 * @typeParam TParams - The Zod schema type validating the tool's parameters.
 */
export interface OperateTool<TParams extends z.ZodType = z.ZodType> {
    /** Unique tool name the assistant invokes. */
    name: string;
    /** Human-readable description of what the tool does, used for tool selection. */
    description: string;
    /** Zod schema validating the tool's parameters. */
    parameters: TParams;
    /** Side-effect classification of invoking the tool. */
    sideEffect: SideEffectClass;
}

/** The parameter type accepted by an {@link OperateTool}, inferred from its schema. */
export type OperateToolParams<T extends OperateTool> = z.infer<T["parameters"]>;
