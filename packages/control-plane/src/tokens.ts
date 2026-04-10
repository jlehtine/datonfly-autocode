/** DI token for the in-memory {@link InMemoryOrchestrator} instance. */
export const ORCHESTRATOR = Symbol("ORCHESTRATOR");

/** DI token for the {@link ControlPlaneEventBus} instance. */
export const EVENT_BUS = Symbol("EVENT_BUS");

/** DI token for the seeded demo user id used to drive sessions this slice. */
export const DEMO_USER_ID = Symbol("DEMO_USER_ID");
