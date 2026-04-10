import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
    formatLoggedError,
    NOOP_PROVIDER_LOGGER,
    type BuildOptions,
    type BuildProvider,
    type BuildResult,
    type ProviderLogger,
} from "@datonfly-autocode/core";

import { computeDistDigest } from "./digest.js";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 32 * 1024 * 1024;

/** Options for constructing a {@link HostBuildProvider}. */
export interface HostBuildProviderOptions {
    /** Directory containing per-workspace Git repos (`<root>/<workspaceId>`). */
    workspacesRoot: string;
    /** Directory under which clean build checkouts are created. Defaults to the OS temp dir. */
    buildTempRoot?: string | undefined;
    /** Logger; defaults to a no-op. */
    logger?: ProviderLogger | undefined;
}

interface CommandResult {
    stdout: string;
    stderr: string;
    failed: boolean;
    message: string;
}

async function runCommand(command: string, args: string[], cwd: string): Promise<CommandResult> {
    try {
        const { stdout, stderr } = await execFileAsync(command, args, { cwd, maxBuffer: MAX_BUFFER });
        return { stdout, stderr, failed: false, message: "" };
    } catch (error) {
        const partial = error as Partial<{ stdout: string; stderr: string }>;
        const message = formatLoggedError(error);
        return { stdout: partial.stdout ?? "", stderr: partial.stderr ?? message, failed: true, message };
    }
}

function appendLog(log: string[], label: string, result: CommandResult): void {
    log.push(`$ ${label}`);
    if (result.stdout.trim().length > 0) {
        log.push(result.stdout);
    }
    if (result.stderr.trim().length > 0) {
        log.push(result.stderr);
    }
}

/**
 * Builds a workspace revision on the host: it checks out the workspace repo at
 * `ref` into a clean temp directory, runs `pnpm install` + `pnpm build`, and on
 * success computes a content digest over the produced `dist/` directory. The
 * artifact's `reference` is the absolute `dist/` path, ready to be bind-mounted
 * by {@link deployArtifact}.
 */
export class HostBuildProvider implements BuildProvider {
    private readonly workspacesRoot: string;
    private readonly buildTempRoot: string;
    private readonly logger: ProviderLogger;

    public constructor(options: HostBuildProviderOptions) {
        this.workspacesRoot = options.workspacesRoot;
        this.buildTempRoot = options.buildTempRoot ?? tmpdir();
        this.logger = options.logger ?? NOOP_PROVIDER_LOGGER;
    }

    public async build(options: BuildOptions): Promise<BuildResult> {
        const { workspaceId, revisionId, ref } = options;
        const repoPath = path.join(this.workspacesRoot, workspaceId);
        await fs.mkdir(this.buildTempRoot, { recursive: true });
        const workDir = await fs.mkdtemp(path.join(this.buildTempRoot, "df-build-"));
        const log: string[] = [];

        const fail = (message: string): BuildResult => {
            this.logger.warn({ workspaceId, revisionId, ref }, message);
            return {
                succeeded: false,
                diagnostics: {
                    workspaceId,
                    revisionId,
                    entries: [{ severity: "error", message, tool: "build" }],
                    rawLog: log.join("\n"),
                    capturedAt: new Date(),
                },
            };
        };

        const clone = await runCommand("git", ["clone", "--quiet", repoPath, workDir], this.buildTempRoot);
        appendLog(log, "git clone", clone);
        if (clone.failed) {
            return fail(`Failed to clone workspace ${workspaceId}: ${clone.message}`);
        }

        const checkout = await runCommand("git", ["-C", workDir, "checkout", "--quiet", ref], workDir);
        appendLog(log, `git checkout ${ref}`, checkout);
        if (checkout.failed) {
            return fail(`Failed to check out ref ${ref}: ${checkout.message}`);
        }

        const install = await runCommand("pnpm", ["install", "--prefer-offline"], workDir);
        appendLog(log, "pnpm install", install);
        if (install.failed) {
            return fail(`Dependency install failed: ${install.message}`);
        }

        const build = await runCommand("pnpm", ["build"], workDir);
        appendLog(log, "pnpm build", build);
        if (build.failed) {
            return fail(`Build failed: ${build.message}`);
        }

        const distPath = path.join(workDir, "dist");
        try {
            await fs.access(distPath);
        } catch {
            return fail("Build succeeded but produced no dist/ directory.");
        }

        const digest = await computeDistDigest(distPath);
        this.logger.info({ workspaceId, revisionId, ref, distPath, digest }, "Built revision artifact");
        return {
            succeeded: true,
            artifact: { revisionId, digest, reference: distPath },
            diagnostics: {
                workspaceId,
                revisionId,
                entries: [],
                rawLog: log.join("\n"),
                capturedAt: new Date(),
            },
        };
    }
}
