# Implementation TODO

Concrete, sequenced implementation steps derived from
[ARCHITECTURE.md](ARCHITECTURE.md) and [CONVENTIONS.md](CONVENTIONS.md). This
file covers the **first phases** in actionable detail: Phase 0 (repo
scaffolding) and Phase 1 (the `core` contracts), plus the entry point into
Phase 2. Later phases are tracked at a coarser granularity and will be expanded
as each predecessor lands.

Conventions reminder: packages are scoped `@datonfly-autocode/*`; strict
TypeScript; Prettier (printWidth 120, tabWidth 4); ESLint 10 `strictTypeChecked`

- `stylisticTypeChecked`; commit messages in sentence case ending with a period.
  Mirror the sibling `datonfly-assistant` tooling versions unless there is a
  reason to diverge.

---

## Phase 0 — Repo scaffolding

Goal: an installable, lintable, buildable empty monorepo with the `core` package
skeleton and tooling parity with `datonfly-assistant`. Exit criteria:
`pnpm install`, `pnpm build`, `pnpm lint`, and `pnpm format:check` all succeed.

### 0.1 Monorepo root tooling

- [x] Add root `package.json` (`"name": "datonfly-autocode"`, `"private": true`,
      `"packageManager": "pnpm@10.x"`). Scripts: `clean`, `build`, `lint`,
      `lint:fix`, `format`, `format:check`, `dev`, `prepare` (husky),
      `lint-staged`. Mirror the assistant's devDependencies (`@eslint/js`,
      `typescript-eslint`, `eslint`, `prettier`,
      `@ianvs/prettier-plugin-sort-imports`, `turbo`, `@types/node`, `husky`,
      `lint-staged`, React ESLint plugins, `globals`).
- [x] Add `pnpm-workspace.yaml` with `packages: [packages/*]` (add `e2e` later
      in Phase 9). Carry over `ignoredBuiltDependencies` for `@nestjs/core` and
      `esbuild`.
- [x] Add `turbo.json` with `clean`, `build` (`dependsOn: ["^build"]`,
      `outputs: ["dist/**"]`), `lint`, `lint:fix`, `test`, and `dev`
      (`persistent`, `cache: false`) tasks — copy from the assistant.
- [x] Add `tsconfig.base.json` with the strict flag set from CONVENTIONS.md
      (`strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`,
      `noUnusedParameters`, `exactOptionalPropertyTypes`, `noImplicitReturns`,
      `noImplicitOverride`, `noFallthroughCasesInSwitch`,
      `forceConsistentCasingInFileNames`, `isolatedModules`,
      `verbatimModuleSyntax`; `target` ES2022, `module`/`moduleResolution`
      Node16; `declaration`/`declarationMap`/`sourceMap` on).
- [x] Add root `tsconfig.json` (solution file referencing packages; start with
      an empty `references` array and grow it as packages are added).
- [x] Add `eslint.config.mjs` mirroring the assistant: flat config, `eslint.js`
      recommended, `tseslint` `strictTypeChecked` + `stylisticTypeChecked`,
      `projectService: true`, the `consistent-type-imports/exports`,
      `explicit-module-boundary-types`, and `no-unused-vars` (`^_` ignore)
      rules, plus the React/`tsx` blocks for the future Shell.
- [x] Add `.prettierrc.json` (printWidth 120, tabWidth 4, import-sort plugin
      with `importOrder` updated to `^@datonfly-autocode/(.*)$`, and the
      Markdown override: printWidth 80, proseWrap always, tabWidth 2).
- [x] Add `.editorconfig` mirroring the assistant (2-space indent for
      config/markup, LF, UTF-8, final newline, preserve trailing whitespace in
      Markdown).
- [x] Add `.gitignore` (`node_modules/`, `dist/`, `.turbo/`, `*.log`,
      coverage/test output, local env files).
- [x] Configure husky + lint-staged: `prepare` runs `husky`; pre-commit runs
      `lint-staged` (`*.{ts,tsx,js,jsx,mjs}` → `eslint --fix`; `*` →
      `prettier --write --ignore-unknown`).

### 0.2 `core` package skeleton

- [x] Create `packages/core/` with `package.json`
      (`"name": "@datonfly-autocode/core"`, `"version": "0.0.1"`,
      `"private": true`, `"type": "module"`, `main`/`types`/`exports` →
      `./dist`). Scripts: `clean`, `build` (`tsc -p tsconfig.json`), `dev`
      (`tsc --watch`), `lint`, `lint:fix`. Dependency: `zod` (v4). Dev
      dependency: `typescript`.
- [x] Add `packages/core/tsconfig.json` extending `../../tsconfig.base.json`
      (`outDir: dist`, `rootDir: src`, `include: ["src"]`).
- [x] Add `packages/core/src/index.ts` as the single public barrel (empty for
      now; populated in Phase 1).
- [x] Add the `core` reference to the root `tsconfig.json`.

### 0.3 Agent workflow + repo hygiene

- [x] Verify `.github/copilot-instructions.md` references README/ARCHITECTURE/
      CONVENTIONS only (already present — no convention duplication).
- [x] Add `INSTALL.md` stub describing prerequisites (Node 22+, pnpm 10+,
      Docker, local Kubernetes via kind/k3d) and the `pnpm install` /
      `pnpm build` bootstrap. Expand in Phase 9.
- [x] Run `pnpm install`, then confirm `pnpm build`, `pnpm lint`, and
      `pnpm format:check` succeed on the empty skeleton.
- [x] Commit: "Scaffold the Autocode monorepo and core package skeleton."

---

## Phase 1 — Contracts in `core`

Goal: the stack-neutral source of truth — domain model, provider interfaces,
wire schemas (Zod), and the three application-facing contracts (extension hooks,
Operate tools, Shell ↔ app bridge). Everything is types + Zod schemas only; no
runtime behavior. Exit criteria: `core` builds and lints; every exported type
and schema is re-exported from `src/index.ts` and documented with JSDoc.

Suggested `core/src` layout (mirrors the assistant's `core`): `types/`, `dto/`,
`endpoints/`, `events/`, `interfaces/`, plus new `domain/`, `bridge/`, and
`manifest/` folders.

### 1.1 Domain model (`src/domain/`)

- [ ] Define core entity types from the domain model (ARCHITECTURE §4):
      `Tenant`/`Application`, `UserWorkspace`, `Revision`, `Deployment`,
      `Session`, `CodegenJob`, `OperateAction`. Use branded id types (e.g.
      `WorkspaceId`, `RevisionId`, `SessionId`, `DeploymentId`, `CodegenJobId`).

  Planned role of each domain type:
  - **`Tenant` / `Application`** — the authoritative vendor application a
    workspace is derived from. Identifies the base UI library coordinates,
    vendor backend endpoints, hook contract version, registry/library policy,
    and the **application template repository** coordinates (the manifest
    target). Shared by all users of that app; owns no user data (that lives in
    vendor services). The unit that scopes which base library, agent
    instructions, stack template, and template repo a workspace clones.
  - **`UserWorkspace`** — the per-user customization of an `Application`: the
    tenancy boundary that ties a user to their Git repository, Kubernetes
    namespace, current `Revision`, and active `Deployment`. Created by cloning
    the application template repository (unmodified clone = vanilla baseline)
    with the template kept as `upstream`; records the **template version** it
    was created from. The root aggregate for one user's variant; complete
    teardown maps to deleting a workspace. Keyed by `WorkspaceId`.
  - **`Revision`** — an immutable, versioned snapshot of a workspace's generated
    code, corresponding to a Git tag plus the build artifact digest. The unit of
    rollback: revert restores a prior `Revision`, rebuilds, and redeploys it.
    Carries `BuildStatus` and provenance (originating `CodegenJob`, parent
    revision). Keyed by `RevisionId`.
  - **`Deployment`** — a running instance of a specific `Revision` in the user's
    App Runtime pod. Tracks `DeploymentStatus` and the health-gate outcome; a
    new `Deployment` replaces the previous one only after passing the health
    gate, so an unhealthy deploy never displaces a working one. Keyed by
    `DeploymentId`.
  - **`Session`** — an active end-user interaction with their workspace, what
    drives the on-demand lifecycle (start the App Runtime on begin, scale to
    zero on expiry/idle). Tracks `SessionStatus` and the current
    `RecoveryState`, and links the Shell to the correct `Deployment`. Keyed by
    `SessionId`.
  - **`CodegenJob`** — one Generate or repair run: prompt and curated context
    in; planned diff → commit(s) → build → deploy out. Executes in an ephemeral
    codegen sandbox, tracks `CodegenJobStatus`, and on success produces the
    `Revision` it is the provenance for. Repair jobs additionally carry build or
    runtime diagnostics as input. Keyed by `CodegenJobId`.
  - **`OperateAction`** — a record of an Operate invocation: the assistant
    driving _existing_ application functionality via a typed Operate tool (no
    code generated). Captures the tool invoked, its validated parameters, and
    the side-effect classification — distinct from `CodegenJob`, which produces
    new code.

- [ ] Define enums/unions as `const` objects + literal unions (match the
      assistant's `STATUS_CODES`/`ERROR_CODES` style): `BuildStatus`,
      `DeploymentStatus`, `SessionStatus`, `CodegenJobStatus`, and the recovery
      `RecoveryState` (`vanilla` | `building` | `deployed` | `build_failed` |
      `runtime_failed` | `recovered`).

### 1.2 Error taxonomy (`src/types/`)

- [ ] Define `ErrorCode`/`StatusCode` const maps and the framework error shape.
- [ ] Port/define the shared `formatLoggedError()` helper (walks `Error.cause`)
      referenced by CONVENTIONS.md, with JSDoc and unit-testable signature.
- [ ] Distinguish build diagnostics vs. runtime diagnostics types for the
      recovery flow (both fully logged; summarizable for end users).

### 1.3 Provider interfaces (`src/interfaces/`)

Each interface is narrow and typed so reference and alternative implementations
are swappable (ARCHITECTURE §4, CONVENTIONS "Pluggable providers").

- [ ] `Orchestrator` — session lifecycle, sandbox start/stop, deployment
      routing, recovery transitions, entitlement checks.
- [ ] `SandboxProvider` — create/destroy per-user namespace/pods, apply network
      policy + quotas, lifecycle (start/stop/scale-to-zero), health, log/stream
      access.
- [ ] `RepoProvider` — per-user repo create/clone, commit, branch, tag, revert,
      history, diff.
- [ ] `BuildProvider` — build a Revision into an artifact, emit structured build
      diagnostics, publish artifacts.
- [ ] `RegistryProvider` — allow-list/curated-mirror policy queries, provenance,
      version pinning.
- [ ] `CodegenProvider` — run a codegen/repair job (prompt + context → diff →
      commit(s) → build/deploy result), expose the repair loop entry point.

### 1.4 Application contracts

- [ ] **Extension hooks** (`src/domain/` or `src/hooks/`): typed registration
      descriptors for menus, routes/views, panels, widgets, and data sources;
      include a contract version constant.
- [ ] **Operate tools**: typed, discoverable action descriptors (name, Zod
      params schema, side-effect classification) the assistant can invoke.
- [ ] **Shell ↔ app bridge** (`src/bridge/`): Zod-validated `postMessage`
      message union — lifecycle (`ready`, `heartbeat`), navigation, error
      reporting (build vs. runtime), Operate dispatch, recovery commands — with
      strict origin-check helpers/typing for both directions.
- [ ] **Vendor app manifest** (`src/manifest/`): Zod schema for base library
      coordinates, vendor backend endpoints, hook contract version, registry/
      library policy, resource limits, recovery options, template repository
      coordinates + template version, and stack-template + agent-instructions
      references.
- [ ] **Codegen job protocol** (`src/dto/`, `src/endpoints/`, `src/events/`):
      request/result DTOs and the step events (planned diff → commit → build →
      deploy), each step recorded and revertible.

### 1.5 Wire contracts & barrel

- [ ] Define REST/WS endpoint path constants + request/response Zod schemas in
      `src/endpoints/` for the control-plane API the Shell and sandboxes call.
- [ ] Define WS/event payload schemas in `src/events/` (session/sandbox/job/
      recovery state changes).
- [ ] Re-export every public type, schema, and constant from
      `packages/core/src/index.ts`; ensure JSDoc on all public surfaces.
- [ ] Run `pnpm build` + `pnpm lint:fix`; commit: "Define core contracts: domain
      model, providers, and application contracts."

---

## Phase 2 — Reference vendor app + app-sdk (entry point)

First slice only; full work expanded once Phase 1 lands.

- [ ] Scaffold `packages/app-sdk/` (`@datonfly-autocode/app-sdk`): implements
      the bridge client, hook registries, and Operate-tool registration against
      the `core` contracts. React/MUI peer.
- [ ] Scaffold `packages/reference-vendor-app/`: minimal UI base library + small
      backend exercising at least one extension hook and one Operate tool.
- [ ] Provide the reference app's **application template repository** layout:
      the framework-owned area (agent instructions, build/deploy recipes,
      migration scripts, base scaffolding) plus the application-owned area (hook
      registrations, generated extensions, dependency manifest), and a
      pre-commit hook rejecting commits to the framework-owned area. The initial
      commit is the tagged vanilla baseline.
- [ ] Wire both into `pnpm-workspace.yaml`, root `tsconfig.json` references, and
      Turbo build graph.

---

## Later phases (coarse — expand when reached)

- [ ] **Phase 3 — Shell** (`packages/shell-ui`): top-frame Shell, sandboxed
      sub-frame host, embedded assistant chat, session control, recovery panel,
      typed `postMessage` bridge.
- [ ] **Phase 4 — Orchestrator + sandbox provider** (`packages/orchestrator`,
      `packages/sandbox-k8s`): local Docker provider first, then Kubernetes with
      NetworkPolicies/quotas; session-driven start/stop. Dev/e2e cluster is
      **Kind** with a policy-enforcing CNI (**Cilium** preferred, Calico
      acceptable) so `NetworkPolicy` and isolation are actually enforced; the
      same manifests target any full-featured managed or local cluster in
      production. **Tenancy is namespace-per-user.**
- [ ] **Phase 5 — Repo + build/deploy** (`packages/repo-git`,
      `packages/build-deploy`): deployment routing, health-gated deploys,
      revert. `RepoProvider` is pluggable; the initial implementation targets a
      **self-hosted Forgejo** instance running in-cluster (Gitea-API compatible,
      so a Gitea backend remains a drop-in alternative). `RepoProvider` gains a
      **create-workspace-from-template** operation (clone the application
      template repo, set it as `upstream`, tag the vanilla baseline, install the
      framework-area pre-commit hook) and a **template-upgrade** operation
      (pull/merge framework-owned files + run versioned migration scripts from
      the recorded template version).
- [ ] **Phase 6 — Codegen** (`packages/codegen`): codegen sandbox, agent
      integration, Generate flow producing commits → build → deploy. Reuse the
      **`datonfly-assistant` agent runtime**, extended with **tool support** and
      the **MCP servers** the sandbox needs for application control and
      customization (codegen runs inside the sandboxed dev environment). The
      agent writes only the application-owned area; the stack toolchain is baked
      into the sandbox image while build/deploy recipes come from the repo's
      framework-owned area. Failed template upgrades route through the recovery
      loop for agent-assisted repair.
- [ ] **Phase 7 — Recovery loop**: build/runtime error capture, auto-repair,
      vanilla/revert escape hatches, full recovery state machine.
- [ ] **Phase 8 — Registry & security hardening** (`packages/registry`):
      controlled registry (Mode A then B), OAuth2 token exchange to vendor APIs,
      supply-chain provenance, isolation tests.
- [ ] **Phase 9 — E2E & docs**: Playwright E2E (Operate, Generate, each recovery
      path) on the reference vendor app; `INSTALL.md`; deployment manifests; add
      `e2e` to the workspace.

---

## Resolved decisions

Resolutions to previously open design questions (recorded here):

- **Kubernetes target.** Production targets **any full-featured Kubernetes
  cluster** (managed or local). Dev and e2e run on **Kind** with a
  policy-enforcing CNI (**Cilium** preferred; Calico acceptable). A real
  multi-node cluster is not simulated — single-node is fine — but the CNI must
  enforce `NetworkPolicy` and the other sandbox isolation controls so they are
  exercised in tests.
- **Git hosting.** **Pluggable `RepoProvider`.** Initial provider is a
  **self-hosted Forgejo** instance in-cluster, chosen for independent FOSS
  governance and Gitea-API compatibility (a Gitea backend stays a drop-in
  alternative).
- **AI agent provider.** **Reuse `datonfly-assistant` agent components**,
  extended with **tool support** and the **MCP servers** required for
  application control and customization, run within the sandboxed dev
  environment. No separate codegen runtime.
- **Multi-tenancy granularity.** **Per-user** (namespace-per-user). Future
  extension: allow **admin-level users** to publish changes as **shareable
  components/services** consumed by other users.

  _Rationale for namespace-per-user._ The control plane gets its own
  namespace(s); only the runtime plane is split per user. A namespace is
  Kubernetes' natural unit of isolation, scoping, and lifecycle, which matches
  the core requirement of running untrusted, AI-generated per-user code safely:
  - **Network isolation (primary driver).** Default-deny `NetworkPolicy` + the
    egress allow-list are enforced at namespace granularity, so "users cannot
    reach each other" is the default instead of N² per-pod rules to author
    correctly.
  - **Resource governance.** `ResourceQuota`/`LimitRange` are namespace-scoped,
    giving a clean per-user CPU/memory/object cap for free.
  - **Secret isolation.** Scoped vendor tokens live as namespace-scoped
    `Secret`s, not shared across all users' pods.
  - **Clean teardown.** `delete namespace` atomically removes the user's pods,
    secrets, policies, and quotas — matching the on-demand/scale-to-zero
    lifecycle.

  Per-user backend services are a beneficiary, not the driver — the isolation
  guarantees apply whether a variant is UI-only or includes a generated backend.
  Local Docker dev (no K8s isolation primitives) fakes the boundary via the
  pluggable provider; the K8s provider keeps namespace-per-user.

- **Workspace provisioning & template updates.** A user workspace is a **clone
  of a per-`Application` template repository** (Forgejo), kept as `upstream`; an
  **unmodified clone is the vanilla baseline** (tagged as the first Revision).
  The workspace is partitioned into a **framework-owned area** (agent
  instructions, build/deploy recipes, migration scripts, scaffolding — never
  edited downstream) and an **application-owned area** (hook registrations,
  generated extensions, dependency manifest — the only area the codegen agent
  writes). The partition is enforced by a **Git pre-commit hook** rejecting
  commits to the framework-owned area (server-side enforcement is a later
  hardening option). Existing workspaces are upgraded by recording a **template
  version** in the manifest and: replacing framework-owned files for simple
  updates, running **versioned migration scripts** for structural changes, and
  routing any non-mechanical breakage through the **recovery loop** for
  agent-assisted repair. Submodules were considered and rejected: they tidy only
  the easy (never-edited) files, cannot override user-customized files, and add
  agent-tooling friction — the directory partition + migration scripts + agent
  repair handle both halves more simply.

## Open questions still to resolve

- Registry default mode (allow-list-only Mode A first vs. curated mirror Mode B)
  — before Phase 8.
- Backend-extension scope (UI-only generation first vs. per-user backend service
  generation from the start) — before Phase 6.
