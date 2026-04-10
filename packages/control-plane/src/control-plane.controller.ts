import { Body, Controller, Delete, Get, Inject, Param, Post } from "@nestjs/common";

import type {
    Deployment,
    Revision,
    Session,
    StartSessionResponse,
    UserId,
    UserWorkspace,
} from "@datonfly-autocode/core";
import {
    applicationIdSchema,
    recoveryRequestSchema,
    revisionIdSchema,
    sessionIdSchema,
    SESSIONS_PATH,
    startSessionRequestSchema,
    provisionWorkspaceRequestSchema,
    workspaceIdSchema,
    WORKSPACES_PATH,
} from "@datonfly-autocode/core";
import type { InMemoryOrchestrator } from "@datonfly-autocode/orchestrator";

import { DEMO_USER_ID, ORCHESTRATOR } from "./tokens.js";

/** REST surface for provisioning and listing per-user workspaces. */
@Controller(WORKSPACES_PATH)
export class WorkspacesController {
    constructor(@Inject(ORCHESTRATOR) private readonly orchestrator: InMemoryOrchestrator) {}

    /** Provision a new per-user workspace and return the created entity. */
    @Post()
    async provision(@Body() body: unknown): Promise<UserWorkspace> {
        const { applicationId, ownerId } = provisionWorkspaceRequestSchema.parse(body);
        const workspaceId = await this.orchestrator.provisionWorkspace({
            applicationId: applicationIdSchema.parse(applicationId),
            ownerId,
        });
        const workspace = this.orchestrator.getWorkspace(workspaceId);
        if (!workspace) {
            throw new Error(`Provisioned workspace ${workspaceId} not found`);
        }
        return workspace;
    }

    /** List all provisioned workspaces. */
    @Get()
    list(): UserWorkspace[] {
        return this.orchestrator.listWorkspaces();
    }

    /** List a workspace's revisions, newest first. */
    @Get(":id/revisions")
    listRevisions(@Param("id") id: string): Revision[] {
        return this.orchestrator.listRevisions(workspaceIdSchema.parse(id));
    }

    /** List a workspace's deployments, newest first. */
    @Get(":id/deployments")
    listDeployments(@Param("id") id: string): Deployment[] {
        return this.orchestrator.listDeployments(workspaceIdSchema.parse(id));
    }
}

/** REST surface for the session lifecycle and recovery actions. */
@Controller(SESSIONS_PATH)
export class SessionsController {
    constructor(
        @Inject(ORCHESTRATOR) private readonly orchestrator: InMemoryOrchestrator,
        @Inject(DEMO_USER_ID) private readonly demoUserId: UserId,
    ) {}

    /** Start a session for a workspace and return it with its App Runtime URL. */
    @Post()
    async start(@Body() body: unknown): Promise<StartSessionResponse> {
        const { workspaceId } = startSessionRequestSchema.parse(body);
        const session = await this.orchestrator.startSession({
            workspaceId: workspaceIdSchema.parse(workspaceId),
            userId: this.demoUserId,
        });
        const appRuntimeUrl = this.orchestrator.getAppRuntimeUrl(session.id) ?? "";
        return { session, appRuntimeUrl };
    }

    /** Fetch a single session by id. */
    @Get(":id")
    get(@Param("id") id: string): Session {
        const session = this.orchestrator.getSession(sessionIdSchema.parse(id));
        if (!session) {
            throw new Error(`Session ${id} not found`);
        }
        return session;
    }

    /** End a session, scaling its App Runtime to zero. */
    @Delete(":id")
    async end(@Param("id") id: string): Promise<{ ok: true }> {
        await this.orchestrator.endSession(sessionIdSchema.parse(id));
        return { ok: true };
    }

    /** Apply a recovery action and return the updated session. */
    @Post(":id/recovery")
    async recover(@Param("id") id: string, @Body() body: unknown): Promise<Session> {
        const sessionId = sessionIdSchema.parse(id);
        const { choice, targetRevisionId } = recoveryRequestSchema.parse(body);
        await this.orchestrator.recover(
            sessionId,
            choice,
            targetRevisionId ? revisionIdSchema.parse(targetRevisionId) : undefined,
        );
        const session = this.orchestrator.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${id} not found`);
        }
        return session;
    }
}
