import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { revisionIdSchema, workspaceIdSchema } from "@datonfly-autocode/core";

import { HostBuildProvider } from "./host-build-provider.js";

const WORKSPACE_ID = workspaceIdSchema.parse("11111111-1111-4111-8111-111111111111");
const REVISION_ID = revisionIdSchema.parse("22222222-2222-4222-8222-222222222222");

const toolsAvailable = ((): boolean => {
    try {
        execFileSync("git", ["--version"], { stdio: "ignore" });
        execFileSync("pnpm", ["--version"], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
})();

const FIXTURE_PACKAGE_JSON = `${JSON.stringify(
    {
        name: "fixture-app",
        version: "0.0.0",
        private: true,
        type: "module",
        scripts: { build: "node ./build.mjs" },
    },
    null,
    4,
)}\n`;

const FIXTURE_BUILD_SCRIPT = [
    'import { mkdirSync, writeFileSync } from "node:fs";',
    'mkdirSync("dist", { recursive: true });',
    'writeFileSync("dist/index.html", "<!doctype html><h1>fixture ok</h1>\\n");',
    "",
].join("\n");

describe.skipIf(!toolsAvailable)("HostBuildProvider (real build smoke test)", () => {
    let root: string;
    let workspacesRoot: string;

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(tmpdir(), "build-deploy-test-"));
        workspacesRoot = path.join(root, "workspaces");
        const repoDir = path.join(workspacesRoot, WORKSPACE_ID);
        await fs.mkdir(repoDir, { recursive: true });
        await fs.writeFile(path.join(repoDir, "package.json"), FIXTURE_PACKAGE_JSON);
        await fs.writeFile(path.join(repoDir, "build.mjs"), FIXTURE_BUILD_SCRIPT);

        const git = (...args: string[]): void => {
            execFileSync("git", args, { cwd: repoDir, stdio: "ignore" });
        };
        git("init");
        git("config", "user.name", "Test");
        git("config", "user.email", "test@example.com");
        git("config", "commit.gpgsign", "false");
        git("add", ".");
        git("commit", "-m", "Baseline");
        git("branch", "-M", "main");
        git("tag", "rev-baseline");
    });

    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    it("checks out the ref, runs the build, and digests the dist output", async () => {
        const provider = new HostBuildProvider({ workspacesRoot, buildTempRoot: path.join(root, "builds") });
        const result = await provider.build({
            workspaceId: WORKSPACE_ID,
            revisionId: REVISION_ID,
            ref: "rev-baseline",
        });

        expect(result.succeeded).toBe(true);
        expect(result.artifact?.digest).toMatch(/^[0-9a-f]{64}$/);
        const reference = result.artifact?.reference ?? "";
        const html = await fs.readFile(path.join(reference, "index.html"), "utf8");
        expect(html).toContain("fixture ok");
    }, 120_000);
});
