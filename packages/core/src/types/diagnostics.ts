import type { RevisionId, WorkspaceId } from "../domain/ids.js";

/**
 * Severity of a single diagnostic entry.
 */
export type DiagnosticSeverity = "error" | "warning" | "info";

/** Runtime constant mapping each {@link DiagnosticSeverity} to itself. */
export const DIAGNOSTIC_SEVERITIES = {
    error: "error",
    warning: "warning",
    info: "info",
} as const satisfies Record<DiagnosticSeverity, DiagnosticSeverity>;

/**
 * A single structured diagnostic message produced while building a revision.
 * Build diagnostics are fully logged and, separately, summarized for the end
 * user in the recovery panel.
 */
export interface BuildDiagnostic {
    /** Severity of the diagnostic. */
    severity: DiagnosticSeverity;
    /** Human-readable diagnostic message. */
    message: string;
    /** Source file the diagnostic refers to, relative to the repository root. */
    file?: string | undefined;
    /** 1-based line number within {@link BuildDiagnostic.file}. */
    line?: number | undefined;
    /** 1-based column number within {@link BuildDiagnostic.file}. */
    column?: number | undefined;
    /** Tool that emitted the diagnostic (e.g. `"tsc"`, `"eslint"`). */
    tool?: string | undefined;
}

/**
 * Structured build diagnostics captured by the Build/Deploy service when a
 * revision build completes. Drives the build-failure branch of recovery and is
 * fed back to the codegen agent as repair context.
 */
export interface BuildDiagnostics {
    /** Workspace whose revision was built. */
    workspaceId: WorkspaceId;
    /** Revision that was built. */
    revisionId: RevisionId;
    /** Individual diagnostic entries. */
    entries: BuildDiagnostic[];
    /** Raw build log, retained in full for logging and audit. */
    rawLog: string;
    /** Timestamp when the build completed. */
    capturedAt: Date;
}

/**
 * A single runtime failure reported from the application sub-frame over the
 * Shell bridge (an uncaught error or unhandled promise rejection).
 */
export interface RuntimeDiagnostic {
    /** Error name / type, when available. */
    name?: string | undefined;
    /** Error message. */
    message: string;
    /** Captured stack trace, when available. */
    stack?: string | undefined;
    /** Source URL the error originated from, when available. */
    source?: string | undefined;
}

/**
 * Structured runtime diagnostics for a running deployment, collected from the
 * application SDK's global error hooks. Drives the runtime-failure branch of
 * recovery; fully logged and summarized for the end user.
 */
export interface RuntimeDiagnostics {
    /** Workspace whose deployment failed. */
    workspaceId: WorkspaceId;
    /** Revision that was running when the failure occurred. */
    revisionId: RevisionId;
    /** Individual runtime failure entries. */
    entries: RuntimeDiagnostic[];
    /** Timestamp when the diagnostics were captured. */
    capturedAt: Date;
}
