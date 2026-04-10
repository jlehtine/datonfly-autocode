import type { ControlPlaneEvent } from "@datonfly-autocode/core";

/** A subscriber notified of each control-plane event. */
export type ControlPlaneEventListener = (event: ControlPlaneEvent) => void;

/**
 * In-process fan-out for {@link ControlPlaneEvent}s.
 *
 * The {@link Orchestrator} pushes lifecycle events into {@link emit}; the
 * Socket.io gateway subscribes and rebroadcasts them to connected Shell
 * clients. Decoupling the two lets the orchestrator be constructed before the
 * Nest application (and its gateway) exists.
 */
export class ControlPlaneEventBus {
    private readonly listeners = new Set<ControlPlaneEventListener>();

    /** Broadcast an event to all current subscribers. */
    emit(event: ControlPlaneEvent): void {
        for (const listener of this.listeners) {
            listener(event);
        }
    }

    /** Subscribe to events; returns an unsubscribe function. */
    subscribe(listener: ControlPlaneEventListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
}
