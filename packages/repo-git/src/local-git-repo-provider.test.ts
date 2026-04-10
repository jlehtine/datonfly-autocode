import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { workspaceIdSchema, type TemplateRepoCoordinates } from "@datonfly-autocode/core";

import { LocalGitRepoProvider } from "./local-git-repo-provider.js";

const WORKSPACE_ID = workspaceIdSchema.parse("11111111-1111-4111-8111-111111111111");
const BASELINE_TAG = "rev-baseline";

const TEMPLATE: TemplateRepoCoordinates = {
    owner: "datonfly-autocode",
    name: "reference-empty-app",
    cloneUrl: "file:///seed",
    templateVersion: "0.0.1",
};

describe("LocalGitRepoProvider", () => {
    let root: string;
    let seed: string;
    let provider: LocalGitRepoProvider;

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(tmpdir(), "repo-git-test-"));
        seed = path.join(root, "seed");
        await fs.mkdir(path.join(seed, "src"), { recursive: true });
        await fs.writeFile(
            path.join(seed, "package.json"),
            `${JSON.stringify(
                {
                    name: "@datonfly-autocode/reference-empty-app",
                    dependencies: { "@datonfly-autocode/app-sdk": "workspace:*", react: "^19.0.0" },
                },
                null,
                4,
            )}\n`,
        );
        await fs.writeFile(path.join(seed, "src", "App.tsx"), "export const App = () => null;\n");
        // A directory that must never be copied into the workspace.
        await fs.mkdir(path.join(seed, "node_modules", "junk"), { recursive: true });
        await fs.writeFile(path.join(seed, "node_modules", "junk", "index.js"), "module.exports = {};\n");

        provider = new LocalGitRepoProvider({
            workspacesRoot: path.join(root, "workspaces"),
            templateSeedPath: seed,
            linkDependencies: { "@datonfly-autocode/app-sdk": "/abs/app-sdk" },
        });
    });

    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    it("clones the template, tags the baseline, and rewrites link dependencies", async () => {
        const coordinates = await provider.createWorkspaceFromTemplate({
            workspaceId: WORKSPACE_ID,
            template: TEMPLATE,
            baselineTag: BASELINE_TAG,
        });

        expect(coordinates.name).toBe(`workspace-${WORKSPACE_ID}`);
        const repoDir = coordinates.cloneUrl;

        // node_modules was excluded.
        await expect(fs.access(path.join(repoDir, "node_modules"))).rejects.toThrow();

        // The workspace:* dependency was rewritten to a link: path; others are untouched.
        const pkg = JSON.parse(await fs.readFile(path.join(repoDir, "package.json"), "utf8")) as {
            dependencies: Record<string, string>;
        };
        expect(pkg.dependencies["@datonfly-autocode/app-sdk"]).toBe("link:/abs/app-sdk");
        expect(pkg.dependencies.react).toBe("^19.0.0");

        // The baseline tag exists in the history.
        const history = await provider.history(WORKSPACE_ID);
        expect(history).toHaveLength(1);
        expect(history[0]?.message).toBe("Vanilla baseline");
    });

    it("reverts to a prior tag by committing the baseline tree forward", async () => {
        const repo = await provider.createWorkspaceFromTemplate({
            workspaceId: WORKSPACE_ID,
            template: TEMPLATE,
            baselineTag: BASELINE_TAG,
        });
        const repoDir = repo.cloneUrl;

        // Make a change on main and commit it as a new revision.
        await fs.writeFile(path.join(repoDir, "src", "App.tsx"), "export const App = () => 'changed';\n");
        const changed = await provider.commit({
            workspaceId: WORKSPACE_ID,
            branch: "main",
            message: "Customize the app",
            paths: ["."],
        });
        await provider.tag(WORKSPACE_ID, changed.sha, "rev-1");

        const diff = await provider.diff(WORKSPACE_ID, BASELINE_TAG, "rev-1");
        expect(diff).toContain("changed");

        // Revert restores the baseline content as a new forward commit.
        const revert = await provider.revertToTag(WORKSPACE_ID, BASELINE_TAG);
        expect(revert.message).toBe(`Revert to ${BASELINE_TAG}`);
        const restored = await fs.readFile(path.join(repoDir, "src", "App.tsx"), "utf8");
        expect(restored).toBe("export const App = () => null;\n");

        // History keeps all three commits (baseline, change, revert) — no data loss.
        const history = await provider.history(WORKSPACE_ID);
        expect(history.map((c) => c.message)).toEqual([
            `Revert to ${BASELINE_TAG}`,
            "Customize the app",
            "Vanilla baseline",
        ]);
    });
});
