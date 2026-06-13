import "reflect-metadata";

import path from "node:path";
import { fileURLToPath } from "node:url";

import { NestFactory } from "@nestjs/core";
import { Logger, LoggerErrorInterceptor } from "nestjs-pino";
import pino from "pino";

import { HostBuildProvider } from "@datonfly-autocode/build-deploy";
import { applicationIdSchema, type CodegenProvider, type ProviderLogger } from "@datonfly-autocode/core";
import { createOrchestrator } from "@datonfly-autocode/orchestrator";
import { LocalGitRepoProvider } from "@datonfly-autocode/repo-git";
import { DockerSandboxProvider } from "@datonfly-autocode/sandbox-docker";

import { ControlPlaneModule } from "./app.module.js";
import { ControlPlaneEventBus } from "./event-bus.js";

/** Fixed demo application the seeded workspace customizes (no Application registry yet). */
const DEMO_APPLICATION_ID = applicationIdSchema.parse("a0000000-0000-4000-8000-000000000001");

/** Fixed demo user that owns the seeded workspace and drives sessions. */
const DEMO_USER_ID = "demo-user";

/** Monorepo root, resolved from this module's compiled location (`packages/control-plane/dist/main.js`). */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * Resolve the codegen provider that backs the Generate flow.
 *
 * Codegen is wired only when an agent is configured. The concrete
 * `AnthropicAgent` and the `HostCodegenProvider` it drives land in §6.7; until
 * then this returns `undefined`, leaving `codegen` unset on the orchestrator so
 * the Generate endpoint surfaces a clean "codegen not configured" (503).
 */
function resolveCodegenProvider(): CodegenProvider | undefined {
    return undefined;
}

async function bootstrap(): Promise<void> {
    const providerLogger: ProviderLogger = pino({
        level: process.env.LOG_LEVEL ?? "info",
        ...(process.env.LOG_FORMAT === "json"
            ? {}
            : { transport: { target: "pino-pretty", options: { singleLine: true } } }),
    }).child({ component: "control-plane" });

    // Real build + deploy: each workspace is a local Git repo cloned from the
    // reference template, built with host pnpm, and served via nginx over a
    // read-only bind mount. The workspaces root must be shared between the repo
    // provider (where it creates repos) and the build provider (where it clones
    // from). Linked dependencies point the standalone workspace at the
    // monorepo's built packages.
    const workspacesRoot = process.env.DF_WORKSPACES_ROOT ?? path.join(REPO_ROOT, ".workspaces");
    const repo = new LocalGitRepoProvider({
        workspacesRoot,
        templateSeedPath: path.join(REPO_ROOT, "reference-app", "empty"),
        linkDependencies: {
            "@datonfly-autocode/app-sdk": path.join(REPO_ROOT, "packages", "app-sdk"),
            "@datonfly-autocode/core": path.join(REPO_ROOT, "packages", "core"),
        },
        logger: providerLogger.child({ component: "repo-git" }),
    });
    const build = new HostBuildProvider({
        workspacesRoot,
        logger: providerLogger.child({ component: "build-deploy" }),
    });

    const sandbox = new DockerSandboxProvider({ logger: providerLogger.child({ component: "sandbox-docker" }) });
    const eventBus = new ControlPlaneEventBus();
    const codegen = resolveCodegenProvider();
    const orchestrator = createOrchestrator({
        repo,
        build,
        sandbox,
        ...(codegen ? { codegen } : {}),
        emit: (event) => {
            eventBus.emit(event);
        },
        logger: providerLogger.child({ component: "orchestrator" }),
    });

    // Seed one demo workspace so the Shell has a workspace to start a session
    // against. A real Application registry and provisioning UI land later.
    const workspaceId = await orchestrator.provisionWorkspace({
        applicationId: DEMO_APPLICATION_ID,
        ownerId: DEMO_USER_ID,
    });
    providerLogger.info({ workspaceId }, "Seeded demo workspace");

    const app = await NestFactory.create(
        ControlPlaneModule.forRoot({ orchestrator, eventBus, demoUserId: DEMO_USER_ID }),
        { bufferLogs: true },
    );
    app.useLogger(app.get(Logger));
    app.useGlobalInterceptors(new LoggerErrorInterceptor());
    app.enableCors({ origin: true });

    const port = Number(process.env.PORT ?? "3100");
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`PORT must be an integer between 1 and 65535, got "${String(process.env.PORT)}"`);
    }
    await app.listen(port);

    const logger = app.get(Logger);
    logger.log(`Control plane listening on port ${String(port)}`);

    process.on("unhandledRejection", (reason: unknown) => {
        logger.error(reason, "Unhandled promise rejection");
    });
    process.on("uncaughtException", (err: Error) => {
        logger.error(err, "Uncaught exception");
    });

    const shutdown = async (): Promise<void> => {
        logger.log("Shutting down...");
        await app.close();
        process.exit(0);
    };
    process.on("SIGTERM", () => void shutdown());
    process.on("SIGINT", () => void shutdown());
}

void bootstrap();
