import { z } from "zod";

import {
    recoveryRequestSchema,
    sessionPath,
    sessionRecoveryPath,
    SESSIONS_PATH,
    sessionWireSchema,
    startSessionResponseSchema,
    WORKSPACES_PATH,
    workspaceWireSchema,
    type RecoveryChoice,
    type SessionWire,
    type StartSessionResponse,
    type WorkspaceWire,
} from "@datonfly-autocode/core";

/**
 * Browser-side REST client for the control-plane API.
 *
 * The Shell is served same-origin with the control plane through the Vite dev
 * proxy (`/datonfly-autocode` → the backend), so the `core` endpoint paths are
 * used as-is with no base URL. Responses are validated with the shared `core`
 * wire schemas.
 */

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(path, {
        ...init,
        headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
        throw new Error(`Control plane request to ${path} failed: ${String(response.status)}`);
    }
    if (response.status === 204) {
        return undefined;
    }
    return response.json();
}

/** List all provisioned workspaces. */
export async function listWorkspaces(): Promise<WorkspaceWire[]> {
    const data = await requestJson(WORKSPACES_PATH);
    return z.array(workspaceWireSchema).parse(data);
}

/** Start a session for a workspace and return it with its App Runtime URL. */
export async function startSession(workspaceId: string): Promise<StartSessionResponse> {
    const data = await requestJson(SESSIONS_PATH, {
        method: "POST",
        body: JSON.stringify({ workspaceId }),
    });
    return startSessionResponseSchema.parse(data);
}

/** End a session, scaling its App Runtime to zero. */
export async function endSession(sessionId: string): Promise<void> {
    await requestJson(sessionPath(sessionId), { method: "DELETE" });
}

/** Apply a recovery action and return the updated session. */
export async function recoverSession(
    sessionId: string,
    choice: RecoveryChoice,
    targetRevisionId?: string,
): Promise<SessionWire> {
    const body = recoveryRequestSchema.parse({ choice, targetRevisionId });
    const data = await requestJson(sessionRecoveryPath(sessionId), {
        method: "POST",
        body: JSON.stringify(body),
    });
    return sessionWireSchema.parse(data);
}
