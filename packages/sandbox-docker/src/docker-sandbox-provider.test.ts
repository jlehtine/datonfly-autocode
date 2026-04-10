import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { workspaceIdSchema } from "@datonfly-autocode/core";

import { DockerSandboxProvider, isDockerAvailable } from "./docker-sandbox-provider.js";

/**
 * Integration smoke test for {@link DockerSandboxProvider}. Requires a reachable
 * Docker daemon and is skipped automatically when one is unavailable (e.g. CI
 * without Docker), so it never fails the suite spuriously.
 */

const dockerAvailable = await isDockerAvailable();

/** Stub web server proving lifecycle / health / routing without real app code. */
const STUB_IMAGE = "traefik/whoami";

/** Static server image and document root used by the bind-mount smoke test. */
const STATIC_IMAGE = "nginx:alpine";
const STATIC_ROOT = "/usr/share/nginx/html";

/** Poll the workload's health until healthy or the attempt budget is exhausted. */
async function waitForHealthy(
    provider: DockerSandboxProvider,
    handle: Awaited<ReturnType<DockerSandboxProvider["startWorkload"]>>,
): Promise<boolean> {
    for (let attempt = 0; attempt < 30; attempt++) {
        const health = await provider.checkHealth(handle);
        if (health.healthy) {
            return true;
        }
        await new Promise((resolve) => {
            setTimeout(resolve, 500);
        });
    }
    return false;
}

/** Read the first log line from the workload, or time out. */
async function firstLogLine(
    provider: DockerSandboxProvider,
    handle: Awaited<ReturnType<DockerSandboxProvider["startWorkload"]>>,
    timeoutMs: number,
): Promise<string | undefined> {
    return Promise.race([
        (async (): Promise<string | undefined> => {
            for await (const line of provider.streamLogs(handle)) {
                return line;
            }
            return undefined;
        })(),
        new Promise<undefined>((resolve) =>
            setTimeout(() => {
                resolve(undefined);
            }, timeoutMs),
        ),
    ]);
}

describe.skipIf(!dockerAvailable)("DockerSandboxProvider (integration, requires Docker)", () => {
    const provider = new DockerSandboxProvider();
    const workspaceId = workspaceIdSchema.parse("11111111-1111-4111-8111-111111111111");
    const staticWorkspaceId = workspaceIdSchema.parse("22222222-2222-4222-8222-222222222222");
    const supersedeWorkspaceId = workspaceIdSchema.parse("33333333-3333-4333-8333-333333333333");

    afterAll(async () => {
        await provider.destroyNamespace(workspaceId).catch(() => undefined);
        await provider.destroyNamespace(staticWorkspaceId).catch(() => undefined);
        await provider.destroyNamespace(supersedeWorkspaceId).catch(() => undefined);
    });

    it("starts the stub, reports healthy, yields logs, and cleans up", async () => {
        await provider.createNamespace({
            workspaceId,
            namespace: "smoke-test",
            resourceLimits: { cpu: "500m", memory: "256Mi" },
            egressAllowList: [],
        });

        const handle = await provider.startWorkload({
            workspaceId,
            kind: "app-runtime",
            image: STUB_IMAGE,
        });
        expect(handle.endpoint).toMatch(/^http:\/\//);

        const healthy = await waitForHealthy(provider, handle);
        expect(healthy).toBe(true);

        const line = await firstLogLine(provider, handle, 10_000);
        expect(typeof line).toBe("string");

        await provider.stopWorkload(handle);
        const afterStop = await provider.checkHealth(handle);
        expect(afterStop.healthy).toBe(false);
    }, 60_000);

    it("serves a read-only bind-mounted static directory over HTTP", async () => {
        const dir = await fs.mkdtemp(path.join(tmpdir(), "df-static-"));
        await fs.writeFile(path.join(dir, "index.html"), "<!doctype html><h1>bind mount ok</h1>\n");
        // The static server's worker runs as an unprivileged user; make the
        // mounted directory and file readable/traversable by it.
        await fs.chmod(dir, 0o755);
        await fs.chmod(path.join(dir, "index.html"), 0o644);

        const handle = await provider.startWorkload({
            workspaceId: staticWorkspaceId,
            kind: "app-runtime",
            image: STATIC_IMAGE,
            mounts: [{ hostPath: dir, containerPath: STATIC_ROOT, readOnly: true }],
        });

        const healthy = await waitForHealthy(provider, handle);
        expect(healthy).toBe(true);

        const response = await fetch(handle.endpoint);
        const body = await response.text();
        expect(body).toContain("bind mount ok");

        await provider.stopWorkload(handle);
        await fs.rm(dir, { recursive: true, force: true });
    }, 60_000);

    it("runs two instances concurrently and supersedes the old one without disrupting the new", async () => {
        // Two distinct App Runtime instances of the same workspace must coexist
        // so a new health-gated deployment can come up before the one it
        // supersedes is stopped (instance-scoped naming, label-based teardown).
        const oldHandle = await provider.startWorkload({
            workspaceId: supersedeWorkspaceId,
            kind: "app-runtime",
            image: STUB_IMAGE,
            instanceId: "deployment-old",
        });
        const newHandle = await provider.startWorkload({
            workspaceId: supersedeWorkspaceId,
            kind: "app-runtime",
            image: STUB_IMAGE,
            instanceId: "deployment-new",
        });
        expect(newHandle.name).not.toBe(oldHandle.name);
        expect(newHandle.endpoint).not.toBe(oldHandle.endpoint);

        // Both are reachable at the same time.
        expect(await waitForHealthy(provider, oldHandle)).toBe(true);
        expect(await waitForHealthy(provider, newHandle)).toBe(true);

        // Superseding the old instance leaves the new one serving.
        await provider.stopWorkload(oldHandle);
        expect((await provider.checkHealth(oldHandle)).healthy).toBe(false);
        expect((await provider.checkHealth(newHandle)).healthy).toBe(true);

        // scaleToZero clears all remaining instances by label.
        await provider.scaleToZero(supersedeWorkspaceId);
        expect((await provider.checkHealth(newHandle)).healthy).toBe(false);
    }, 60_000);
});
