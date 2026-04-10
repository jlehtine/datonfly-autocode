import { Inject, Injectable } from "@nestjs/common";
import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { OnGatewayInit } from "@nestjs/websockets";
import type { Server } from "socket.io";

import { CONTROL_PLANE_EVENT_CHANNEL, WS_PATH } from "@datonfly-autocode/core";

import type { ControlPlaneEventBus } from "./event-bus.js";
import { EVENT_BUS } from "./tokens.js";

/**
 * Socket.io gateway that rebroadcasts every {@link ControlPlaneEvent} from the
 * {@link ControlPlaneEventBus} to all connected Shell clients on the
 * {@link CONTROL_PLANE_EVENT_CHANNEL} channel.
 */
@Injectable()
@WebSocketGateway({ path: WS_PATH, cors: { origin: true } })
export class ControlPlaneGateway implements OnGatewayInit {
    @WebSocketServer()
    private server!: Server;

    constructor(@Inject(EVENT_BUS) private readonly eventBus: ControlPlaneEventBus) {}

    /** Wire the event bus to the live Socket.io server once it is initialized. */
    afterInit(): void {
        this.eventBus.subscribe((event) => {
            this.server.emit(CONTROL_PLANE_EVENT_CHANNEL, event);
        });
    }
}
