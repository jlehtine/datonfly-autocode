import type { WorkspaceId } from "../domain/ids.js";
import type { RepoCoordinates, TemplateRepoCoordinates } from "../domain/values.js";

/** A single commit in a repository's history. */
export interface CommitInfo {
    /** Commit SHA. */
    sha: string;
    /** Commit message. */
    message: string;
    /** Author display name. */
    author: string;
    /** Timestamp the commit was authored. */
    authoredAt: Date;
}

/** Options for creating a workspace repository from an application template. */
export interface CreateFromTemplateOptions {
    /** Workspace the repository belongs to. */
    workspaceId: WorkspaceId;
    /** Application template repository to clone. */
    template: TemplateRepoCoordinates;
    /** Git tag to apply to the initial commit as the vanilla baseline. */
    baselineTag: string;
}

/** Options for committing staged changes on a branch. */
export interface CommitOptions {
    /** Workspace whose repository is committed to. */
    workspaceId: WorkspaceId;
    /** Branch to commit on. */
    branch: string;
    /** Commit message. */
    message: string;
    /** Paths to include in the commit, relative to the repository root. */
    paths: string[];
}

/** Result of upgrading a workspace to a newer application template version. */
export interface TemplateUpgradeResult {
    /** Template version the workspace was on before the upgrade. */
    fromVersion: string;
    /** Template version the workspace is on after the upgrade. */
    toVersion: string;
    /** Migration script identifiers that were applied, in order. */
    appliedMigrations: string[];
    /** Whether the framework-owned files merged cleanly without conflicts. */
    clean: boolean;
}

/**
 * Hosts per-user repositories.
 *
 * Pluggable: the initial implementation targets a self-hosted Forgejo instance
 * (Gitea-API compatible). Supports provisioning workspaces from application
 * templates and the framework-owned/application-owned partition workflow.
 */
export interface RepoProvider {
    /**
     * Provision a workspace repository by cloning the application template,
     * setting it as `upstream`, tagging the vanilla baseline, and installing
     * the pre-commit hook that rejects commits to the framework-owned area.
     */
    createWorkspaceFromTemplate(options: CreateFromTemplateOptions): Promise<RepoCoordinates>;
    /** Create a branch from the current main line. */
    createBranch(workspaceId: WorkspaceId, branch: string): Promise<void>;
    /** Commit staged changes on a branch. */
    commit(options: CommitOptions): Promise<CommitInfo>;
    /** Integrate a branch into the workspace main line. */
    integrateBranch(workspaceId: WorkspaceId, branch: string): Promise<CommitInfo>;
    /** Tag a commit (e.g. with a revision id) on the main line. */
    tag(workspaceId: WorkspaceId, sha: string, tag: string): Promise<void>;
    /** Restore the working tree to a prior tag (revert). */
    revertToTag(workspaceId: WorkspaceId, tag: string): Promise<CommitInfo>;
    /** Return the commit history of the workspace main line. */
    history(workspaceId: WorkspaceId, limit?: number): Promise<CommitInfo[]>;
    /** Return the unified diff between two refs. */
    diff(workspaceId: WorkspaceId, fromRef: string, toRef: string): Promise<string>;
    /**
     * Upgrade the workspace to a newer template version: pull/merge the
     * framework-owned files and run the versioned migration scripts in sequence
     * from the recorded template version.
     */
    upgradeTemplate(workspaceId: WorkspaceId, toVersion: string): Promise<TemplateUpgradeResult>;
}
