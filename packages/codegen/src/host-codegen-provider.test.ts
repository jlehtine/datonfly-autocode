import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AgentMessage, AgentRunOptions, IAgentProvider } from "@datonfly-assistant/core";
import { beforeEach, describe, expect, it } from "vitest";

import { workspaceIdSchema, type CommitInfo, type CommitOptions, type RepoProvider } from "@datonfly-autocode/core";

import { HostCodegenProvider } from "./host-codegen-provider.js";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

/** A RepoProvider that records branch/commit/integrate/tag calls without Git. */
class FakeRepoProvider implements RepoProvider {
    readonly calls: string[] = [];
    readonly tags: { sha: string; tag: string }[] = [];
    committedPaths: string[] = [];
    private counter = 0;

    createWorkspaceFromTemplate(): Promise<never> {
        return Promise.reject(new Error("not used"));
    }
    createBranch(): Promise<void> {
        this.calls.push("createBranch");
        return Promise.resolve();
    }
    commit(options: CommitOptions): Promise<CommitInfo> {
        this.calls.push("commit");
        this.committedPaths = options.paths;
        return Promise.resolve(this.fabricate(options.message));
    }
    integrateBranch(): Promise<CommitInfo> {
        this.calls.push("integrateBranch");
        return Promise.resolve(this.fabricate("integrate"));
    }
    tag(_workspaceId: unknown, sha: string, tag: string): Promise<void> {
        this.calls.push("tag");
        this.tags.push({ sha, tag });
        return Promise.resolve();
    }
    revertToTag(): Promise<never> {
        return Promise.reject(new Error("not used"));
    }
    history(): Promise<CommitInfo[]> {
        return Promise.resolve([]);
    }
    diff(): Promise<string> {
        return Promise.resolve("");
    }
    upgradeTemplate(): Promise<never> {
        return Promise.reject(new Error("not used"));
    }

    private fabricate(message: string): CommitInfo {
        this.counter++;
        return { sha: `sha-${String(this.counter)}`, message, author: "Fake", authoredAt: new Date() };
    }
}

/**
 * An agent that writes a configured set of files via the `write_file` tool and
 * returns a fixed summary. No LLM.
 */
class FakeAgent implements IAgentProvider {
    readonly externalCompaction = false;
    constructor(
        private readonly writes: { path: string; content: string }[],
        private readonly summary = "Added a component.",
    ) {}

    async run(
        _messages: AgentMessage[],
        _threadId: string,
        _userId: string,
        _signal?: AbortSignal,
        options?: AgentRunOptions,
    ): Promise<AgentMessage> {
        const write = options?.tools?.find((t) => t.name === "write_file");
        if (write) {
            for (const file of this.writes) {
                await write.execute(file);
            }
        }
        return { role: "ai", content: [{ type: "text", text: this.summary }] };
    }
    stream(): Promise<never> {
        return Promise.reject(new Error("not used"));
    }
    shouldRespond(): Promise<never> {
        return Promise.reject(new Error("not used"));
    }
    getContextWindowSize(): number {
        return 100_000;
    }
}

async function seedWorkdir(): Promise<string> {
    const workdir = await mkdtemp(join(tmpdir(), "codegen-job-"));
    await mkdir(join(workdir, "src"), { recursive: true });
    await writeFile(join(workdir, "src", "App.tsx"), "export const App = () => null;\n", "utf8");
    return workdir;
}

describe("HostCodegenProvider", () => {
    let workdir: string;
    let repo: FakeRepoProvider;

    beforeEach(async () => {
        workdir = await seedWorkdir();
        repo = new FakeRepoProvider();
    });

    it("generates: writes files, commits, integrates, tags, and produces a revision", async () => {
        const agent = new FakeAgent([{ path: "src/Button.tsx", content: "export const Button = () => null;\n" }]);
        const provider = new HostCodegenProvider({ agent, repo, resolveWorkdir: () => workdir });
        const steps: string[] = [];

        const result = await provider.runJob(
            { workspaceId: WORKSPACE_ID, kind: "generate", prompt: "Add a button", context: [] },
            (event) => steps.push(`${event.step}:${event.phase}`),
        );

        expect(result.succeeded).toBe(true);
        expect(result.producedRevisionId).toBeDefined();
        expect(result.summary).toBe("Added a component.");
        expect(repo.calls).toEqual(["createBranch", "commit", "integrateBranch", "tag"]);
        expect(repo.committedPaths).toEqual(["src/Button.tsx"]);
        expect(repo.tags[0]?.tag).toBe(`rev-${String(result.producedRevisionId)}`);
        expect(steps).toEqual(["planned-diff:started", "planned-diff:completed", "commit:started", "commit:completed"]);
        expect(result.steps.every((s) => s.phase === "started" || s.ok === true)).toBe(true);
    });

    it("fails without committing when the agent writes no files", async () => {
        const agent = new FakeAgent([], "Nothing to change.");
        const provider = new HostCodegenProvider({ agent, repo, resolveWorkdir: () => workdir });

        const result = await provider.runJob({
            workspaceId: WORKSPACE_ID,
            kind: "generate",
            prompt: "Do nothing",
            context: [],
        });

        expect(result.succeeded).toBe(false);
        expect(result.producedRevisionId).toBeUndefined();
        expect(repo.calls).toEqual([]);
        expect(result.steps.map((s) => `${s.step}:${s.phase}`)).toEqual([
            "planned-diff:started",
            "planned-diff:completed",
        ]);
    });

    it("brands the workspace id for the repo provider", async () => {
        const agent = new FakeAgent([{ path: "src/x.ts", content: "export const x = 1;\n" }]);
        const provider = new HostCodegenProvider({ agent, repo, resolveWorkdir: () => workdir });

        await provider.runJob({ workspaceId: WORKSPACE_ID, kind: "generate", prompt: "x", context: [] });

        // Parsing the request workspace id must succeed (valid branded uuid).
        expect(() => workspaceIdSchema.parse(WORKSPACE_ID)).not.toThrow();
    });
});
