import type { ErrorCode } from "./error-code.js";

/**
 * The framework's canonical error shape, returned by control-plane endpoints
 * and carried over the Shell bridge. Keeps a machine-readable {@link ErrorCode}
 * separate from human-facing text so callers can branch on the code while
 * end-user surfaces show the message.
 */
export interface FrameworkError {
    /** Machine-readable error code for programmatic handling. */
    code: ErrorCode;
    /** Human-readable, end-user-safe summary of the error. */
    message: string;
    /** Optional structured details for debugging (never end-user-only secrets). */
    details?: Record<string, unknown> | undefined;
}
