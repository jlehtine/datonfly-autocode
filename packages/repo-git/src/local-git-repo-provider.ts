import { promises as fs } from "node:fs";
import path from "node:path";

import { simpleGit, type SimpleGit } from "simple-git";

import {
    formatLoggedError,
    NOOP_PROVIDER_LOGGER,
    type CommitInfo,
    type CommitOptions,
    type CreateFromTemplateOptions,
    type ProviderLogger,
    type RepoCoordinates,
    type RepoProvider,
    type TemplateUpgradeResult,
    type WorkspaceId,
} from "@datonfly-autocode/core";

/** Branch every workspace repository's main line lives on. */
const MAIN_BRANCH = "main";

/** Default Git owner recorded on provisioned workspace repositories. */
const DEFAULT_OWNER = "datonfly-autocode";

/** Default commit author name for framework-driven commits. */
const DEFAULT_AUTHOR_NAME = "Datonfly Autocode";

/** Default commit author email for framework-driven commits. */
const DEFAULT_AUTHOR_EMAIL = "autocode@datonfly.invalid";

/** Directory names never copied from the template seed into a new workspace. */
const SEED_SKIP = new Set(["node_modules", "dist", ".git", ".turbo"]);

/** Options for constructing a {@link LocalGitRepoProvider}. */
export interface LocalGitRepoProviderOptions {
    /** Directory under which each workspace's repository is created (`<root>/<workspaceId>`). */
    workspacesRoot: string;
    /** Absolute path to the application template seed directory to clone from. */
    templateSeedPath: string;
    /**
     * Map of dependency name → absolute path. Any matching dependency in the
     * cloned `package.json` is rewritten to a `link:<absolutePath>` so the
     * standalone workspace resolves the monorepo packages it builds against.
     */
    linkDependencies?: Record<string, string> | undefined;
    /** Commit author name. Defaults to `Datonfly Autocode`. */
    authorName?: string | undefined;
    /** Commit author email. Defaults to `autocode@datonfly.invalid`. */
    authorEmail?: string | undefined;
    /** Structured logger; defaults to a no-op logger. */
    logger?: ProviderLogger | undefined;
}

/** Minimal shape of the fields a `package.json` rewrite touches. */
interface PackageJsonDeps {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    [key: string]: unknown;
}

/**
 * {@link RepoProvider} backed by local on-disk Git repositories.
 *
 * Each workspace is a real Git repository under a configurable root directory,
 * cloned from the in-monorepo application template seed. This is the local
 * development / proof-of-concept provider; the framework-owned/application-owned
 * pre-commit hook and template upgrades are not implemented here and land with
 * the Forgejo provider in a later slice.
 */
export class LocalGitRepoProvider implements RepoProvider {
    private readonly workspacesRoot: string;
    private readonly templateSeedPath: string;
    private readonly linkDependencies: Record<string, string>;
    private readonly authorName: string;
    private readonly authorEmail: string;
    private readonly logger: ProviderLogger;

    constructor(options: LocalGitRepoProviderOptions) {
        this.workspacesRoot = options.workspacesRoot;
        this.templateSeedPath = options.templateSeedPath;
        this.linkDependencies = options.linkDependencies ?? {};
        this.authorName = options.authorName ?? DEFAULT_AUTHOR_NAME;
        this.authorEmail = options.authorEmail ?? DEFAULT_AUTHOR_EMAIL;
        this.logger = options.logger ?? NOOP_PROVIDER_LOGGER;
    }

    async createWorkspaceFromTemplate(options: CreateFromTemplateOptions): Promise<RepoCoordinates> {
        const dest = this.repoPath(options.workspaceId);
        try {
            await fs.mkdir(this.workspacesRoot, { recursive: true });
            await fs.cp(this.templateSeedPath, dest, {
                recursive: true,
                filter: (source) => !SEED_SKIP.has(path.basename(source)),
            });
            await this.rewriteLinkDependencies(dest);

            const git = simpleGit(dest);
            await git.init();
            await git.addConfig("user.name", this.authorName);
            await git.addConfig("user.email", this.authorEmail);
            await git.addConfig("commit.gpgsign", "false");
            await git.add(".");
            await git.commit("Vanilla baseline");
            await git.raw(["branch", "-M", MAIN_BRANCH]);
            await git.tag([options.baselineTag]);

            const coordinates: RepoCoordinates = {
                owner: options.template.owner || DEFAULT_OWNER,
                name: `workspace-${options.workspaceId}`,
                cloneUrl: dest,
            };
            this.logger.info(
                { workspaceId: options.workspaceId, baselineTag: options.baselineTag, path: dest },
                "Created workspace repository from template",
            );
            return coordinates;
        } catch (error) {
            this.logger.error(
                { workspaceId: options.workspaceId, error: formatLoggedError(error) },
                "Failed to create workspace repository from template",
            );
            throw error;
        }
    }

    async createBranch(workspaceId: WorkspaceId, branch: string): Promise<void> {
        const git = this.git(workspaceId);
        await git.checkout(MAIN_BRANCH);
        await git.checkoutLocalBranch(branch);
    }

    async commit(options: CommitOptions): Promise<CommitInfo> {
        const git = this.git(options.workspaceId);
        await git.checkout(options.branch);
        await git.add(options.paths);
        await git.commit(options.message);
        return this.headCommit(git);
    }

    async integrateBranch(workspaceId: WorkspaceId, branch: string): Promise<CommitInfo> {
        const git = this.git(workspaceId);
        await git.checkout(MAIN_BRANCH);
        await git.merge([branch]);
        return this.headCommit(git);
    }

    async tag(workspaceId: WorkspaceId, sha: string, tag: string): Promise<void> {
        const git = this.git(workspaceId);
        await git.tag(sha ? [tag, sha] : [tag]);
    }

    async revertToTag(workspaceId: WorkspaceId, tag: string): Promise<CommitInfo> {
        const git = this.git(workspaceId);
        await git.checkout(MAIN_BRANCH);
        // Make the index and working tree exactly match the tag's tree
        // (including deletions), then commit that state forward on the main line
        // so the revert is itself a new, reversible revision with no history loss.
        await git.raw(["read-tree", "-u", "--reset", tag]);
        await git.raw(["commit", "--allow-empty", "-m", `Revert to ${tag}`]);
        return this.headCommit(git);
    }

    async history(workspaceId: WorkspaceId, limit?: number): Promise<CommitInfo[]> {
        const git = this.git(workspaceId);
        const log = await git.log(limit === undefined ? {} : { maxCount: limit });
        return log.all.map((entry) => ({
            sha: entry.hash,
            message: entry.message,
            author: entry.author_name,
            authoredAt: new Date(entry.date),
        }));
    }

    async diff(workspaceId: WorkspaceId, fromRef: string, toRef: string): Promise<string> {
        const git = this.git(workspaceId);
        return git.diff([fromRef, toRef]);
    }

    upgradeTemplate(workspaceId: WorkspaceId, toVersion: string): Promise<TemplateUpgradeResult> {
        void workspaceId;
        void toVersion;
        return Promise.reject(new Error("Template upgrade is not implemented by the local-git repo provider."));
    }

    /** Absolute path to a workspace's repository directory. */
    private repoPath(workspaceId: WorkspaceId): string {
        return path.join(this.workspacesRoot, workspaceId);
    }

    /** A `simple-git` client bound to a workspace's repository. */
    private git(workspaceId: WorkspaceId): SimpleGit {
        return simpleGit(this.repoPath(workspaceId));
    }

    /** Read the most recent commit on the current branch as a {@link CommitInfo}. */
    private async headCommit(git: SimpleGit): Promise<CommitInfo> {
        const log = await git.log({ maxCount: 1 });
        const latest = log.latest;
        if (!latest) {
            throw new Error("Repository has no commits.");
        }
        return {
            sha: latest.hash,
            message: latest.message,
            author: latest.author_name,
            authoredAt: new Date(latest.date),
        };
    }

    /** Rewrite configured `workspace:*` dependencies to `link:` absolute paths. */
    private async rewriteLinkDependencies(dest: string): Promise<void> {
        const entries = Object.entries(this.linkDependencies);
        if (entries.length === 0) {
            return;
        }
        const pkgPath = path.join(dest, "package.json");
        const raw = await fs.readFile(pkgPath, "utf8");
        const pkg = JSON.parse(raw) as PackageJsonDeps;
        let changed = false;
        for (const section of [pkg.dependencies, pkg.devDependencies]) {
            if (!section) {
                continue;
            }
            for (const [name, absolutePath] of entries) {
                if (name in section) {
                    section[name] = `link:${absolutePath}`;
                    changed = true;
                }
            }
        }
        if (changed) {
            await fs.writeFile(pkgPath, `${JSON.stringify(pkg, null, 4)}\n`);
        }
    }
}
