import type { DynamicModule } from "@nestjs/common";
import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";

import type { UserId } from "@datonfly-autocode/core";
import type { InMemoryOrchestrator } from "@datonfly-autocode/orchestrator";

import { SessionsController, WorkspacesController } from "./control-plane.controller.js";
import { ControlPlaneGateway } from "./control-plane.gateway.js";
import type { ControlPlaneEventBus } from "./event-bus.js";
import { DEMO_USER_ID, EVENT_BUS, ORCHESTRATOR } from "./tokens.js";

/** Wiring for the control-plane REST controllers and Socket.io gateway. */
export interface ControlPlaneModuleOptions {
    /** Orchestrator driving the session lifecycle. */
    orchestrator: InMemoryOrchestrator;
    /** Event bus the orchestrator emits into and the gateway rebroadcasts from. */
    eventBus: ControlPlaneEventBus;
    /** Seeded demo user id used to drive sessions this slice. */
    demoUserId: UserId;
}

/** Root module assembling the control-plane HTTP + WebSocket surface. */
@Module({})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class ControlPlaneModule {
    static forRoot(options: ControlPlaneModuleOptions): DynamicModule {
        return {
            module: ControlPlaneModule,
            imports: [
                LoggerModule.forRoot({
                    pinoHttp: {
                        level: process.env.LOG_LEVEL ?? "info",
                        ...(process.env.LOG_FORMAT === "json"
                            ? {}
                            : { transport: { target: "pino-pretty", options: { singleLine: true } } }),
                    },
                }),
            ],
            controllers: [WorkspacesController, SessionsController],
            providers: [
                ControlPlaneGateway,
                { provide: ORCHESTRATOR, useValue: options.orchestrator },
                { provide: EVENT_BUS, useValue: options.eventBus },
                { provide: DEMO_USER_ID, useValue: options.demoUserId },
            ],
        };
    }
}
