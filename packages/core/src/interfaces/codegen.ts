import type { CodegenJobRequest, CodegenJobResult, CodegenStepEvent } from "../dto/codegen.js";

/**
 * Runs codegen and repair jobs inside the ephemeral codegen sandbox.
 *
 * Reuses the `datonfly-assistant` agent runtime (extended with tool support and
 * the MCP servers the sandbox needs). A job takes a prompt plus curated context
 * and produces a planned diff → commit(s) → build → deploy result, emitting
 * step events along the way. The repair entry point re-runs the agent with
 * build or runtime diagnostics as additional context.
 */
export interface CodegenProvider {
    /**
     * Run a codegen or repair job to completion, streaming {@link CodegenStepEvent}s
     * as it progresses and resolving with the terminal {@link CodegenJobResult}.
     */
    runJob(request: CodegenJobRequest, onStep?: (event: CodegenStepEvent) => void): Promise<CodegenJobResult>;
}
