# Architecture

This document describes the implementation architecture of the **Datonfly
Autocode framework itself** — its execution environment, services, isolation
model, and the contracts between them. It does not prescribe the architecture of
applications running inside the framework; those are defined by each vendor
application and its stack template.

## 1. Overview

Autocode is organized into three planes:

- **Control plane (shared, multi-tenant).** The always-on framework services:
  session orchestration, sandbox management, per-user Git, build/deploy, the
  package registry, authentication, and the assistant gateway. The control plane
  **never executes user-generated code**.

- **Runtime plane (per-user, isolated).** On-demand Kubernetes workloads that
  run a single user's application variant and, when needed, an ephemeral codegen
  sandbox. Every per-user workload is confined by network policy to vendor
  services and the minimal control-plane endpoints it is explicitly allowed to
  use.

- **Vendor plane (authoritative).** The vendor's own backend services
  (authenticating requests via OAuth2/JWT) and the published vendor UI base
  library. This plane owns application domain data and is shared by all users;
  it is extended, never forked, by generated code.

```
                          ┌──────────────────────────────────────────┐
                          │            Control plane (shared)          │
                          │                                            │
  Browser (end user)      │  Session Orchestrator ── Sandbox Manager   │
  ┌───────────────────┐   │        │                     │  (K8s API)  │
  │  Shell (top frame)│◄──┼────────┘                     ▼             │
  │  ├ Assistant chat │   │  Git Service          Kubernetes cluster   │
  │  ├ Session control│   │  Build/Deploy Service       │              │
  │  └ Recovery panel │   │  Package Registry           │              │
  │                   │   │  Auth (OIDC/JWT)            │               │
  │  ┌──────────────┐ │   └─────────────────────────────┼─────────────┘
  │  │  App sub-    │ │                                  │
  │  │  frame       │◄┼────────────┐                     ▼
  │  │ (per-user    │ │   ┌──────────────────────────────────────────┐
  │  │  variant)    │ │   │   Per-user namespace (runtime plane)       │
  │  └──────────────┘ │   │  ┌─────────────┐   ┌────────────────────┐ │
  └───────────────────┘   │  │ App Runtime │   │ Codegen Sandbox    │ │
                          │  │ pod         │   │ pod (ephemeral)    │ │
                          │  └──────┬──────┘   └─────────┬──────────┘ │
                          │  NetworkPolicy: egress only to vendor APIs │
                          └─────────┼──────────────────────┼──────────┘
                                    ▼                       ▼
                          ┌──────────────────────────────────────────┐
                          │      Vendor plane (authoritative)          │
                          │  Vendor backend services (OAuth2/JWT)      │
                          │  Vendor UI base library (registry)         │
                          └──────────────────────────────────────────┘
```

## 2. Execution environment: Kubernetes

The runtime plane runs on **Kubernetes**. The control plane uses the Kubernetes
API to create and tear down per-user workloads on demand.

- **Per-user namespace.** Each user is allocated a namespace that scopes their
  workloads, secrets, network policies, and resource quotas. This provides a
  clear tenancy boundary and simple, complete teardown.
- **Resource governance.** `ResourceQuota` and `LimitRange` cap CPU, memory, and
  object counts per user. Pods run non-root with dropped capabilities, a
  read-only root filesystem where feasible, and a restrictive seccomp profile.
- **On-demand lifecycle.** The orchestrator starts a user's App Runtime when a
  session begins and scales it down (to zero) when the session expires or goes
  idle. Codegen sandboxes are created only for the duration of a codegen job.
- **Local first.** The first deployable target is a local cluster (kind/k3d) for
  development and end-to-end testing; managed clusters are a later concern. The
  sandbox provider is pluggable so a plain Docker provider can back local
  development without Kubernetes.

## 3. Per-user pods

Two kinds of per-user workloads run in the runtime plane.

### 3.1 App Runtime pod

Serves the user's current application variant (a specific Revision) into the
Shell sub-frame.

- Hosts the built UI bundle and, where the application stack supports it, any
  per-user backend service extensions.
- Reaches vendor backend services using short-lived, audience-scoped tokens
  minted by the control plane; it never holds long-lived vendor credentials.
- Reports lifecycle and error events to the Shell over the typed bridge.
- Is replaced only by a _healthy_ new deployment; an unhealthy deploy never
  displaces a working one (see Recovery).

### 3.2 Codegen sandbox pod

An **ephemeral** environment created on demand to perform a Generate or repair
job.

- Contains the **cloned per-user Git repository**, the **vendor-supplied agent
  instructions** for the application's stack, and the tools required to commit
  changes and publish a new application version.
- Runs the AI agent (provided by the `datonfly-assistant` agent runtime) to
  produce repository changes from the user's prompt and curated context.
- Has write access only to its cloned repository and to the package registry; it
  cannot reach vendor production data unless explicitly granted a scoped token
  for the job.
- Is destroyed when the job completes; all durable output is captured as commits
  in the per-user repository.

## 4. Control-plane services

- **Session Orchestrator.** Owns session lifecycle, drives sandbox start/stop,
  routes the Shell to the correct App Runtime, enforces entitlements, and runs
  the recovery state machine.
- **Sandbox Manager.** Translates orchestrator intent into Kubernetes resources:
  namespaces, pods, network policies, quotas, health checks, and log/stream
  access. Pluggable (Kubernetes provider for real deployments, Docker provider
  for local development).
- **Git Service.** Hosts per-user repositories; supports create/clone, commit,
  branch, tag, revert, history, and diff. Backed by a self-hosted Git host or
  bare repositories for development.
- **Build/Deploy Service.** Builds a Revision into a deployable artifact (UI
  bundle and/or backend image), emits structured build diagnostics, publishes
  artifacts, and coordinates health-gated deployment with the Sandbox Manager.
- **Package Registry.** The controlled dependency source for generated code: an
  allow-list of vetted packages and, optionally, a curated mirror of selected
  public packages with provenance. Generalizes across ecosystems (e.g. npm for
  TypeScript applications, PyPI for Python applications).
- **Auth.** OIDC-based end-user authentication with JWT sessions, reusing the
  `datonfly-assistant` model. Mints short-lived, audience-scoped tokens for
  sandboxes to call vendor APIs via OAuth2 token exchange.
- **Assistant Gateway.** Embeds the `datonfly-assistant` chat/agent platform
  that backs both the Operate surface and the repair conversation in the Shell.

## 5. Frontend Shell

The framework provides a **Shell** that is the user's entry point and the
container for the per-user application.

- **Top frame (framework-owned).** Hosts the assistant chat, session control
  (sandbox status, resource state), and the recovery panel. Built with React and
  Material UI, consistent with the framework stack.
- **Application sub-frame.** The per-user application variant is loaded into a
  sandboxed `<iframe sandbox>`. Isolating the application in a sub-frame keeps
  the framework top frame alive even when the application fails, which is
  essential for recovery.
- **Typed bridge.** The Shell and the application communicate over a strict,
  schema-validated `postMessage` bridge with origin checks in both directions:
  lifecycle (ready/heartbeat), navigation, error reporting (distinguishing build
  vs. runtime failures), Operate dispatch, and recovery commands.

## 6. Application contracts

The framework defines stack-neutral contracts that applications and their
templates implement. (Concrete TypeScript definitions live in the framework's
`core` contract package; other stacks bind to the same wire contracts.)

- **Extension hooks** — typed registration points the vendor base application
  exposes (menus, routes/views, panels, widgets, data sources) that generated
  code extends. This is the surface the agent generates against.
- **Operate tools** — discoverable, typed action descriptors the assistant can
  invoke against the running application, with parameter schemas and side-effect
  classification.
- **Shell ↔ application bridge** — the `postMessage` protocol described above.
- **Vendor application manifest** — declares the base library coordinates,
  vendor backend endpoints, hook contract version, registry/library policy,
  resource limits, recovery options, and a reference to the stack template and
  agent instructions.
- **Codegen job protocol** — prompt and curated context in, planned diff →
  commit(s) → build result → deploy result out, with every step recorded and
  revertible.

## 7. Security and isolation

- **Default-deny networking.** Each per-user namespace applies a default-deny
  `NetworkPolicy`. Egress is allowed only to (a) declared vendor service
  endpoints and (b) the minimal control-plane endpoints a workload needs (for
  example, repository push during codegen). There is no arbitrary internet
  egress; dependency installation flows exclusively through the Package
  Registry.
- **Scoped, short-lived credentials.** The control plane performs OAuth2 token
  exchange to issue audience-scoped JWTs that sandboxes present to vendor APIs.
  Long-lived vendor credentials never reside in a sandbox.
- **Tenancy isolation.** One user's pods, repository, and secret material are
  never reachable by another user. Secrets are Kubernetes Secrets scoped to the
  user's namespace.
- **Supply-chain control.** The Package Registry enforces the allow-list or
  curated mirror, pins versions, and records provenance; generated dependencies
  are captured in the repository lockfile.
- **Least privilege.** Pods are non-root with minimal capabilities; the codegen
  sandbox is ephemeral and constrained to its repository and the registry.

## 8. Versioning and per-user Git workflow

- A user workspace repository is seeded from the application's **stack
  template**, which imports the vendor base library and the application SDK with
  empty hook registrations.
- Each codegen job runs on a branch. On success, commits are integrated into the
  workspace's main line and tagged with a Revision id and the build artifact
  digest.
- **Revert** restores a prior Revision tag, then rebuilds and redeploys it —
  fully reversible with no data loss, because durable _user data_ lives in
  vendor services rather than in the repository.
- History and diffs are exposed through the session/recovery UI for transparency
  and rollback.

## 9. Error handling and recovery

Recovery is a first-class state machine owned by the orchestrator and surfaced
in the Shell recovery panel.

- **States.** `vanilla` → `building` → `deployed` / `build_failed`, with
  `runtime_failed` reachable from `deployed`, and `recovered` as the resolution
  of a failure.
- **Build failure.** The Build/Deploy Service captures structured diagnostics.
  The Shell presents the error and offers: auto-repair (the codegen repair loop
  re-runs the agent with the diagnostics as context), revert to the last good
  Revision, or drop to the vanilla vendor application.
- **Runtime failure (browser).** The application SDK installs global error and
  unhandled-rejection hooks; failures are reported to the Shell over the bridge.
  Because the application lives in a sub-frame, the failure is isolated and the
  top frame remains responsive, offering the same auto-repair / revert / vanilla
  options.
- **Health-gated deploys.** On deployment, the last good App Runtime is retained
  until the new one passes a health gate; a failed deploy never replaces a
  healthy one.
- **Always-available escape hatch.** "Switch to the vanilla vendor application"
  is reachable from every failure state, because the vendor base library and
  services are independent of any user-generated code.

## 10. Stack templates

A **stack template** packages everything needed to run a class of applications:

- a base application skeleton importing the vendor UI base library and the
  application SDK,
- the extension-hook registrations and Operate-tool wiring for the stack,
- the **vendor-supplied agent instructions and prompts** that teach the codegen
  agent how to build idiomatic code on that stack,
- build and deployment recipes consumed by the Build/Deploy Service, and
- the registry/library policy defaults for the stack.

The **initial template targets the framework's own stack** (TypeScript / React +
MUI / NestJS). Because the framework's contracts are stack-neutral, additional
templates (for example, a Python stack) can be added without changing the
control plane.
