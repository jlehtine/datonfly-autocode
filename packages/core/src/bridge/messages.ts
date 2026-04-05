import { z } from "zod";

/**
 * Shell ↔ application bridge contracts.
 *
 * A strict, Zod-validated `postMessage` protocol between the framework Shell
 * (top frame) and the per-user application (sandboxed sub-frame), with origin
 * checks in both directions. Every message is a discriminated union member keyed
 * by `type`; parsing an untrusted `postMessage` payload through these schemas is
 * the only supported way to accept a bridge message.
 */

/** Schema for a runtime failure entry reported from the application sub-frame. */
export const bridgeRuntimeErrorSchema = z.object({
    name: z.string().optional(),
    message: z.string(),
    stack: z.string().optional(),
    source: z.string().optional(),
});

// ─── Application → Shell ───

/** The application has loaded and is ready to receive commands. */
export const appReadyMessageSchema = z.object({
    type: z.literal("ready"),
    /** Hook contract version the application was built against. */
    hookContractVersion: z.string(),
});

/** Periodic liveness signal from the application. */
export const appHeartbeatMessageSchema = z.object({
    type: z.literal("heartbeat"),
    /** Monotonic timestamp (ms since epoch) the heartbeat was sent. */
    sentAt: z.number().int().nonnegative(),
});

/** The application navigated to a new in-app location. */
export const appNavigatedMessageSchema = z.object({
    type: z.literal("navigated"),
    /** New in-app path. */
    path: z.string(),
});

/** The application reports a build failure surfaced at load time. */
export const appBuildErrorMessageSchema = z.object({
    type: z.literal("build-error"),
    /** End-user-safe summary of the build failure. */
    summary: z.string(),
});

/** The application reports an uncaught runtime failure. */
export const appRuntimeErrorMessageSchema = z.object({
    type: z.literal("runtime-error"),
    /** The runtime failure detail. */
    error: bridgeRuntimeErrorSchema,
});

/** The application returns the result of a dispatched Operate tool. */
export const appOperateResultMessageSchema = z.object({
    type: z.literal("operate-result"),
    /** Correlation id matching the originating {@link shellOperateDispatchMessageSchema}. */
    correlationId: z.string(),
    /** Whether the tool invocation succeeded. */
    ok: z.boolean(),
    /** Tool result payload on success. */
    result: z.unknown().optional(),
    /** End-user-safe error message on failure. */
    error: z.string().optional(),
});

/** Discriminated union of all application → Shell messages. */
export const appToShellMessageSchema = z.discriminatedUnion("type", [
    appReadyMessageSchema,
    appHeartbeatMessageSchema,
    appNavigatedMessageSchema,
    appBuildErrorMessageSchema,
    appRuntimeErrorMessageSchema,
    appOperateResultMessageSchema,
]);

/** Any message sent from the application sub-frame to the Shell. */
export type AppToShellMessage = z.infer<typeof appToShellMessageSchema>;

// ─── Shell → Application ───

/** The Shell instructs the application to navigate to a path. */
export const shellNavigateMessageSchema = z.object({
    type: z.literal("navigate"),
    /** Target in-app path. */
    path: z.string(),
});

/** The Shell dispatches an Operate tool invocation to the application. */
export const shellOperateDispatchMessageSchema = z.object({
    type: z.literal("operate-dispatch"),
    /** Correlation id echoed back in {@link appOperateResultMessageSchema}. */
    correlationId: z.string(),
    /** Name of the Operate tool to invoke. */
    toolName: z.string(),
    /** Validated parameters for the tool. */
    parameters: z.record(z.string(), z.unknown()),
});

/** The Shell issues a recovery command to the application. */
export const shellRecoveryCommandMessageSchema = z.object({
    type: z.literal("recovery-command"),
    /** Which recovery action to perform. */
    command: z.enum(["auto_repair", "revert", "vanilla"]),
});

/** Discriminated union of all Shell → application messages. */
export const shellToAppMessageSchema = z.discriminatedUnion("type", [
    shellNavigateMessageSchema,
    shellOperateDispatchMessageSchema,
    shellRecoveryCommandMessageSchema,
]);

/** Any message sent from the Shell to the application sub-frame. */
export type ShellToAppMessage = z.infer<typeof shellToAppMessageSchema>;

// ─── Origin checking ───

/**
 * Parse and validate a message received from the application sub-frame.
 *
 * Enforces the expected origin before validating the payload, returning the
 * typed message on success or `undefined` when the origin is not allowed or the
 * payload is invalid. Callers must never trust an unvalidated `postMessage`.
 */
export function parseAppToShellMessage(
    data: unknown,
    origin: string,
    expectedOrigin: string,
): AppToShellMessage | undefined {
    if (origin !== expectedOrigin) {
        return undefined;
    }
    const parsed = appToShellMessageSchema.safeParse(data);
    return parsed.success ? parsed.data : undefined;
}

/**
 * Parse and validate a message received from the Shell.
 *
 * Enforces the expected origin before validating the payload, returning the
 * typed message on success or `undefined` when the origin is not allowed or the
 * payload is invalid.
 */
export function parseShellToAppMessage(
    data: unknown,
    origin: string,
    expectedOrigin: string,
): ShellToAppMessage | undefined {
    if (origin !== expectedOrigin) {
        return undefined;
    }
    const parsed = shellToAppMessageSchema.safeParse(data);
    return parsed.success ? parsed.data : undefined;
}
