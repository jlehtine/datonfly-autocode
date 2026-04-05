/** Machine-readable error code for programmatic error handling. */
export type ErrorCode =
    | "auth_required"
    | "invalid_token"
    | "forbidden"
    | "entitlement_denied"
    | "invalid_request"
    | "internal_error"
    | "tenant_not_found"
    | "application_not_found"
    | "workspace_not_found"
    | "revision_not_found"
    | "deployment_not_found"
    | "session_not_found"
    | "session_expired"
    | "codegen_job_not_found"
    | "codegen_job_failed"
    | "build_failed"
    | "runtime_failed"
    | "deploy_health_gate_failed"
    | "template_upgrade_failed"
    | "framework_area_write_rejected"
    | "registry_policy_violation"
    | "sandbox_unavailable"
    | "repo_operation_failed"
    | "invalid_bridge_message"
    | "origin_not_allowed"
    | "operate_tool_not_found"
    | "unspecified";

/** Runtime constant mapping each {@link ErrorCode} to itself, useful for autocomplete and iteration. */
export const ERROR_CODES = {
    auth_required: "auth_required",
    invalid_token: "invalid_token",
    forbidden: "forbidden",
    entitlement_denied: "entitlement_denied",
    invalid_request: "invalid_request",
    internal_error: "internal_error",
    tenant_not_found: "tenant_not_found",
    application_not_found: "application_not_found",
    workspace_not_found: "workspace_not_found",
    revision_not_found: "revision_not_found",
    deployment_not_found: "deployment_not_found",
    session_not_found: "session_not_found",
    session_expired: "session_expired",
    codegen_job_not_found: "codegen_job_not_found",
    codegen_job_failed: "codegen_job_failed",
    build_failed: "build_failed",
    runtime_failed: "runtime_failed",
    deploy_health_gate_failed: "deploy_health_gate_failed",
    template_upgrade_failed: "template_upgrade_failed",
    framework_area_write_rejected: "framework_area_write_rejected",
    registry_policy_violation: "registry_policy_violation",
    sandbox_unavailable: "sandbox_unavailable",
    repo_operation_failed: "repo_operation_failed",
    invalid_bridge_message: "invalid_bridge_message",
    origin_not_allowed: "origin_not_allowed",
    operate_tool_not_found: "operate_tool_not_found",
    unspecified: "unspecified",
} as const satisfies Record<ErrorCode, ErrorCode>;
