import { randomUUID } from "node:crypto";

import type { AgentMessage, IAgentProvider, ITool } from "@datonfly-assistant/core";

import {
    formatLoggedError,
    NOOP_PROVIDER_LOGGER,
    revisionIdSchema,
    workspaceIdSchema,
    type CodegenJobRequest,
    type CodegenJobResult,
    type CodegenProvider,
    type CodegenStep,
    type CodegenStepEvent,
    type ProviderLogger,
    type RepoProvider,
    type RevisionId,
    type WorkspaceId,
} from "@datonfly-autocode/core";

import { createFileTools } from "./tools/fs-tools.js";

/** Default system prompt steering the agent toward a UI-only Generate task. */
const DEFAULT_SYSTEM_PROMPT = [
    "You are a code-generation agent for a single user's application workspace.",
    "Use the provided file tools to read the existing application source and write changes.",
    "You may only modify files within the application-owned area (the source tree);",
    "framework-owned configuration and build files are off-limits and writes there will be rejected.",
    "Generate UI code only. When you are done, briefly summarize the changes you made.",
].join(" ");

/** Options for constructing a {@link HostCodegenProvider}. */
export interface HostCodegenProviderOptions {
    /** Agent runtime that drives the generation, invoked with per-job file tools. */
    agent: IAgentProvider;
    /** Repository provider used to branch, commit, integrate, and tag the result. */
    repo: RepoProvider;
    /** Resolve a workspace to the absolute path of its working tree on the host. */
    resolveWorkdir: (workspaceId: WorkspaceId) => string;
    /** Globs the agent may write to; defaults to the application-owned source tree. */
    applicationOwnedGlobs?: readonly string[];
    /** System prompt prepended to the agent call; defaults to a UI-only Generate prompt. */
    systemPrompt?: string;
    /** Structured logger; defaults to a no-op logger. */
    logger?: ProviderLogger;
}

/** Concatenate the prompt and curated context into the agent's user message. */
function buildUserMessage(request: CodegenJobRequest): AgentMessage {
    const text = [request.prompt, ...request.context].join("\n\n");
    return { role: "human", content: [{ type: "text", text }] };
}

/** Extract the plain-text parts of an agent message into a single string. */
function extractText(message: AgentMessage): string {
    return message.content
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("\n")
        .trim();
}

/** The first non-blank line of a block of text, trimmed. */
function firstLine(text: string): string {
    return (
        text
            .split("\n")
            .find((line) => line.trim().length > 0)
            ?.trim() ?? ""
    );
}

/**
 * A {@link CodegenProvider} that runs the agent on the host (not yet inside an
 * in-sandbox codegen container).
 *
 * Implements the Generate flow: it drives the agent over application-scoped file
 * tools to produce a planned diff, then commits the written files on a job
 * branch, integrates them, and tags a new {@link RevisionId} it mints. It owns
 * the planned-diff → commit steps; the orchestrator owns the subsequent build
 * and deploy of the produced revision. Repair jobs and the in-sandbox container
 * are deferred to later slices.
 */
export class HostCodegenProvider implements CodegenProvider {
    private readonly agent: IAgentProvider;
    private readonly repo: RepoProvider;
    private readonly resolveWorkdir: (workspaceId: WorkspaceId) => string;
    private readonly applicationOwnedGlobs: readonly string[] | undefined;
    private readonly systemPrompt: string;
    private readonly logger: ProviderLogger;

    constructor(options: HostCodegenProviderOptions) {
        this.agent = options.agent;
        this.repo = options.repo;
        this.resolveWorkdir = options.resolveWorkdir;
        this.applicationOwnedGlobs = options.applicationOwnedGlobs;
        this.systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
        this.logger = options.logger ?? NOOP_PROVIDER_LOGGER;
    }

    async runJob(request: CodegenJobRequest, onStep?: (event: CodegenStepEvent) => void): Promise<CodegenJobResult> {
        const steps: CodegenStepEvent[] = [];
        const record = (
            step: CodegenStep,
            phase: "started" | "completed",
            result?: { ok: boolean; detail?: string },
        ): void => {
            const event: CodegenStepEvent = {
                step,
                phase,
                at: Date.now(),
                ...(result ? { ok: result.ok } : {}),
                ...(result?.detail !== undefined ? { detail: result.detail } : {}),
            };
            steps.push(event);
            onStep?.(event);
        };

        const workspaceId = workspaceIdSchema.parse(request.workspaceId);
        const revisionId: RevisionId = revisionIdSchema.parse(randomUUID());
        const branch = `codegen/${revisionId}`;
        const workdir = this.resolveWorkdir(workspaceId);

        // Planned diff: drive the agent over application-scoped file tools.
        record("planned-diff", "started");
        const fileTools = createFileTools({
            workdir,
            ...(this.applicationOwnedGlobs !== undefined ? { allowedGlobs: this.applicationOwnedGlobs } : {}),
        });
        let response: AgentMessage;
        try {
            // The file tools are built with this package's own `zod`; cross to
            // the agent runtime's `ITool[]` at this single boundary to avoid
            // reconciling two `zod` copies through a shared generic.
            response = await this.agent.run([buildUserMessage(request)], revisionId, request.workspaceId, undefined, {
                tools: fileTools.tools as unknown as ITool[],
                systemPrompt: this.systemPrompt,
            });
        } catch (error) {
            const detail = formatLoggedError(error);
            this.logger.warn({ workspaceId, error: detail }, "Codegen agent run failed");
            record("planned-diff", "completed", { ok: false, detail });
            return { succeeded: false, summary: `Code generation failed: ${detail}`, steps };
        }

        const writtenFiles = fileTools.writtenFiles();
        const summary = extractText(response);
        record("planned-diff", "completed", { ok: true, detail: writtenFiles.join(", ") });
        if (writtenFiles.length === 0) {
            return { succeeded: false, summary: summary || "The agent produced no file changes.", steps };
        }

        // Commit: branch, commit the written files, integrate, and tag the revision.
        record("commit", "started");
        let commitSha: string;
        try {
            await this.repo.createBranch(workspaceId, branch);
            const message = firstLine(summary) || firstLine(request.prompt) || "Apply generated changes";
            await this.repo.commit({ workspaceId, branch, message, paths: writtenFiles });
            const integrated = await this.repo.integrateBranch(workspaceId, branch);
            commitSha = integrated.sha;
            await this.repo.tag(workspaceId, commitSha, `rev-${revisionId}`);
        } catch (error) {
            const detail = formatLoggedError(error);
            this.logger.warn({ workspaceId, branch, error: detail }, "Codegen commit failed");
            record("commit", "completed", { ok: false, detail });
            return { succeeded: false, summary: summary || "Code generation failed during commit.", steps };
        }
        record("commit", "completed", { ok: true, detail: commitSha });
        this.logger.info({ workspaceId, revisionId, commitSha }, "Codegen produced a revision");

        return {
            succeeded: true,
            producedRevisionId: revisionId,
            summary: summary || "Generated changes.",
            steps,
        };
    }
}

/** The branch name a codegen job uses for the revision it produces. */
export function codegenBranch(revisionId: RevisionId): string {
    return `codegen/${revisionId}`;
}
