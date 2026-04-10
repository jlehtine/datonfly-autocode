import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { Logger, LoggerErrorInterceptor } from "nestjs-pino";
import pino from "pino";

import { applicationIdSchema, type ProviderLogger } from "@datonfly-autocode/core";
import { createOrchestrator } from "@datonfly-autocode/orchestrator";
import { DockerSandboxProvider } from "@datonfly-autocode/sandbox-docker";

import { ControlPlaneModule } from "./app.module.js";
import { ControlPlaneEventBus } from "./event-bus.js";

/** Fixed demo application the seeded workspace customizes (no Application registry yet). */
const DEMO_APPLICATION_ID = applicationIdSchema.parse("a0000000-0000-4000-8000-000000000001");

/** Fixed demo user that owns the seeded workspace and drives sessions. */
const DEMO_USER_ID = "demo-user";

async function bootstrap(): Promise<void> {
    const providerLogger: ProviderLogger = pino({
        level: process.env.LOG_LEVEL ?? "info",
        ...(process.env.LOG_FORMAT === "json"
            ? {}
            : { transport: { target: "pino-pretty", options: { singleLine: true } } }),
    }).child({ component: "control-plane" });

    const sandbox = new DockerSandboxProvider({ logger: providerLogger.child({ component: "sandbox-docker" }) });
    const eventBus = new ControlPlaneEventBus();
    const orchestrator = createOrchestrator({
        sandbox,
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
