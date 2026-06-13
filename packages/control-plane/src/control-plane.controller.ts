import { Body, Controller, Delete, Get, Inject, Param, Post, Query, ServiceUnavailableException } from "@nestjs/common";

import type {
    CodegenJob,
    Deployment,
    Revision,
    Session,
    StartSessionResponse,
    UserId,
    UserWorkspace,
} from "@datonfly-autocode/core";
import {
    applicationIdSchema,
    codegenJobIdSchema,
    codegenJobRequestSchema,
    CODEGEN_JOBS_PATH,
    recoveryRequestSchema,
    revisionIdSchema,
    sessionIdSchema,
    SESSIONS_PATH,
    startSessionRequestSchema,
    provisionWorkspaceRequestSchema,
    workspaceIdSchema,
    WORKSPACES_PATH,
} from "@datonfly-autocode/core";
import { NoCodegenProviderError, type InMemoryOrchestrator } from "@datonfly-autocode/orchestrator";

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

/**
 * REST surface for the Generate (codegen) flow.
 *
 * `POST` runs a generation cycle to completion and returns the recorded job;
 * live progress is streamed separately as `codegen-job-progress` over the
 * Socket.io gateway. When no codegen provider is configured, the orchestrator's
 * {@link NoCodegenProviderError} is surfaced as a 503 rather than an internal
 * error.
 */
@Controller(CODEGEN_JOBS_PATH)
export class CodegenJobsController {
    constructor(@Inject(ORCHESTRATOR) private readonly orchestrator: InMemoryOrchestrator) {}

    /** Run a Generate job against a workspace and return the recorded job. */
    @Post()
    async generate(@Body() body: unknown): Promise<CodegenJob> {
        const request = codegenJobRequestSchema.parse(body);
        const workspaceId = workspaceIdSchema.parse(request.workspaceId);
        const before = new Set(this.orchestrator.listCodegenJobs(workspaceId).map((job) => job.id));
        try {
            await this.orchestrator.runCodegenJob(request);
        } catch (error) {
            if (error instanceof NoCodegenProviderError) {
                throw new ServiceUnavailableException("Codegen is not configured");
            }
            throw error;
        }
        const job = this.orchestrator.listCodegenJobs(workspaceId).find((candidate) => !before.has(candidate.id));
        if (!job) {
            throw new Error("Codegen job was not recorded");
        }
        return job;
    }

    /** List a workspace's codegen jobs, newest first. */
    @Get()
    list(@Query("workspaceId") workspaceId: string): CodegenJob[] {
        return this.orchestrator.listCodegenJobs(workspaceIdSchema.parse(workspaceId));
    }

    /** Fetch a single codegen job by id. */
    @Get(":id")
    get(@Param("id") id: string): CodegenJob {
        const job = this.orchestrator.getCodegenJob(codegenJobIdSchema.parse(id));
        if (!job) {
            throw new Error(`Codegen job ${id} not found`);
        }
        return job;
    }
}
