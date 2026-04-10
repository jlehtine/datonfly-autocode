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

    afterAll(async () => {
        await provider.destroyNamespace(workspaceId).catch(() => undefined);
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
});
