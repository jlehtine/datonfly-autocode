import { z } from "zod";

/**
 * Codegen job protocol.
 *
 * Request/result DTOs and the step events a codegen or repair job emits as it
 * progresses through planned diff → commit → build → deploy. Every step is
 * recorded and revertible. Defined as Zod schemas because these payloads cross
 * the control-plane API and the codegen sandbox boundary.
 */

/** Whether a codegen job is a fresh Generate or a repair of a prior failure. */
export const codegenJobKindSchema = z.enum(["generate", "repair"]);

/** A request to run a codegen or repair job. */
export const codegenJobRequestSchema = z.object({
    /** Workspace the job runs against. */
    workspaceId: z.uuid(),
    /** Session that initiated the job, if any. */
    sessionId: z.uuid().optional(),
    /** Whether this is a Generate or a repair job. */
    kind: codegenJobKindSchema,
    /** Natural-language prompt that initiated the job. */
    prompt: z.string(),
    /** Curated context passed to the agent (file excerpts, summaries, etc.). */
    context: z.array(z.string()),
    /** For repair jobs, the revision whose failure is being repaired. */
    repairTargetRevisionId: z.uuid().optional(),
    /** For repair jobs, the diagnostics summary to repair against. */
    diagnosticsSummary: z.string().optional(),
});

/** A request to run a codegen or repair job. */
export type CodegenJobRequest = z.infer<typeof codegenJobRequestSchema>;

/** The discrete steps a codegen job moves through, in order. */
export const codegenStepSchema = z.enum(["planned-diff", "commit", "build", "deploy"]);

/** A discrete step in a codegen job's lifecycle. */
export type CodegenStep = z.infer<typeof codegenStepSchema>;

/** An event emitted when a codegen job reaches or completes a step. */
export const codegenStepEventSchema = z.object({
    /** The step this event concerns. */
    step: codegenStepSchema,
    /** Whether the step has started or finished. */
    phase: z.enum(["started", "completed"]),
    /** Whether a completed step succeeded. Absent while `started`. */
    ok: z.boolean().optional(),
    /** Human-readable detail (e.g. commit SHA, artifact digest, diagnostics summary). */
    detail: z.string().optional(),
    /** Monotonic timestamp (ms since epoch) the event was emitted. */
    at: z.number().int().nonnegative(),
});

/** An event emitted as a codegen job progresses through its steps. */
export type CodegenStepEvent = z.infer<typeof codegenStepEventSchema>;

/** The terminal result of a codegen job. */
export const codegenJobResultSchema = z.object({
    /** Whether the job succeeded end-to-end (committed, built, and deployed). */
    succeeded: z.boolean(),
    /** Revision produced on success. */
    producedRevisionId: z.uuid().optional(),
    /** End-user-safe summary of the outcome. */
    summary: z.string(),
    /** Ordered step events recorded over the job's lifetime. */
    steps: z.array(codegenStepEventSchema),
});

/** The terminal result of a codegen job. */
export type CodegenJobResult = z.infer<typeof codegenJobResultSchema>;
