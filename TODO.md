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

- [x] Define core entity types from the domain model (ARCHITECTURE §4):
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

- [x] Define enums/unions as `const` objects + literal unions (match the
      assistant's `STATUS_CODES`/`ERROR_CODES` style): `BuildStatus`,
      `DeploymentStatus`, `SessionStatus`, `CodegenJobStatus`, and the recovery
      `RecoveryState` (`vanilla` | `building` | `deployed` | `build_failed` |
      `runtime_failed` | `recovered`).

### 1.2 Error taxonomy (`src/types/`)

- [x] Define `ErrorCode`/`StatusCode` const maps and the framework error shape.
- [x] Port/define the shared `formatLoggedError()` helper (walks `Error.cause`)
      referenced by CONVENTIONS.md, with JSDoc and unit-testable signature.
- [x] Distinguish build diagnostics vs. runtime diagnostics types for the
      recovery flow (both fully logged; summarizable for end users).

### 1.3 Provider interfaces (`src/interfaces/`)

Each interface is narrow and typed so reference and alternative implementations
are swappable (ARCHITECTURE §4, CONVENTIONS "Pluggable providers").

- [x] `Orchestrator` — session lifecycle, sandbox start/stop, deployment
      routing, recovery transitions, entitlement checks.
- [x] `SandboxProvider` — create/destroy per-user namespace/pods, apply network
      policy + quotas, lifecycle (start/stop/scale-to-zero), health, log/stream
      access.
- [x] `RepoProvider` — per-user repo create/clone, commit, branch, tag, revert,
      history, diff.
- [x] `BuildProvider` — build a Revision into an artifact, emit structured build
      diagnostics, publish artifacts.
- [x] `RegistryProvider` — allow-list/curated-mirror policy queries, provenance,
      version pinning.
- [x] `CodegenProvider` — run a codegen/repair job (prompt + context → diff →
      commit(s) → build/deploy result), expose the repair loop entry point.

### 1.4 Application contracts

- [x] **Extension hooks** (`src/domain/` or `src/hooks/`): typed registration
      descriptors for menus, routes/views, panels, widgets, and data sources;
      include a contract version constant.
- [x] **Operate tools**: typed, discoverable action descriptors (name, Zod
      params schema, side-effect classification) the assistant can invoke.
- [x] **Shell ↔ app bridge** (`src/bridge/`): Zod-validated `postMessage`
      message union — lifecycle (`ready`, `heartbeat`), navigation, error
      reporting (build vs. runtime), Operate dispatch, recovery commands — with
      strict origin-check helpers/typing for both directions.
- [x] **Vendor app manifest** (`src/manifest/`): Zod schema for base library
      coordinates, vendor backend endpoints, hook contract version, registry/
      library policy, resource limits, recovery options, template repository
      coordinates + template version, and stack-template + agent-instructions
      references.
- [x] **Codegen job protocol** (`src/dto/`, `src/endpoints/`, `src/events/`):
      request/result DTOs and the step events (planned diff → commit → build →
      deploy), each step recorded and revertible.

### 1.5 Wire contracts & barrel

- [x] Define REST/WS endpoint path constants + request/response Zod schemas in
      `src/endpoints/` for the control-plane API the Shell and sandboxes call.
- [x] Define WS/event payload schemas in `src/events/` (session/sandbox/job/
      recovery state changes).
- [x] Re-export every public type, schema, and constant from
      `packages/core/src/index.ts`; ensure JSDoc on all public surfaces.
- [x] Run `pnpm build` + `pnpm lint:fix`; commit: "Define core contracts: domain
      model, providers, and application contracts."

---

## Phase 2 — `app-sdk` + empty reference app

First slice: the framework `app-sdk` and a minimal **empty** reference
application used to test codegen **from scratch**. A content-ful reference
vendor app (existing hooks, Operate tools, a backend) is deferred to a later
slice once this one lands.

Decisions for this slice (resolved with the user):

- **Placement.** The reference app lives in a top-level `reference-app/` tree
  (not under `packages/`), with the empty app at `reference-app/empty/`. It is a
  pnpm workspace member so it can link `app-sdk` via `workspace:*` during
  development. Conceptually it is an _application_ (it follows its own stack's
  conventions, not the framework's), and its directory is the literal content of
  a future application template repository.
- **Template repo model.** The `reference-app/empty/` directory is the
  **in-monorepo seed** for the application template repository. The Forgejo
  template repo is a _derived artifact_: a Phase 5 seeding step pushes this
  directory's content, tags the vanilla baseline, and installs the pre-commit
  hook. The monorepo directory stays the single source of truth; no separate Git
  repo and no Forgejo work in this phase.
- **Single package.** The empty app is a single application package with no
  separate vendor base library (there is no vendor content yet). Codegen fills
  the application-owned area later.
- **Root render.** Modeled as an `app-sdk` bootstrap/registration concern, not a
  new `core` hook kind — no change to the `core` `ExtensionHook` union.
- **Partition deferred.** The framework-owned vs. application-owned directory
  partition and the pre-commit hook are deferred to Phase 5/6 (when workspace
  provisioning and codegen are wired). The `app-sdk` dependency is authored as
  `workspace:*`; the Phase 5 seeding step rewrites it to a pinned controlled-
  registry version when materializing the template repo.

### 2.1 `app-sdk` (`packages/app-sdk`, `@datonfly-autocode/app-sdk`)

- [x] Scaffold the package mirroring `core`'s library setup (`package.json`,
      `tsconfig.json` extending the base with `jsx: react-jsx` + DOM libs, a
      `tsconfig.build.json` that excludes tests, `tsc` build). Deps: `core`
      (`workspace:*`), `zod`. Peers: `react`, `react-dom`. Dev: `typescript`,
      `vitest`, `@types/react`, `@types/react-dom`.
- [x] **Bridge client** (`src/bridge/client.ts`): `createBridgeClient` that
      installs an origin-checked `message` listener (via
      `parseShellToAppMessage`) routing `navigate` / `operate-dispatch` /
      `recovery-command` to callbacks, and exposes typed senders (`sendReady`,
      `sendHeartbeat`, `sendNavigated`, `sendBuildError`, `sendRuntimeError`,
      `sendOperateResult`) plus `dispose`. The event source and target window
      are injectable for testing.
- [x] **Hook registry** (`src/hooks/registry.ts`): `createHookRegistry` with
      `register` / `list` / `get`, deduplicating by hook `id`.
- [x] **Operate registry** (`src/operate/registry.ts`): `createOperateRegistry`
      with `register(tool, handler)` / `list` / `has` / `dispatch`, validating
      raw parameters through the tool's Zod schema and returning an
      `operate-result`-shaped outcome.
- [x] **Root bootstrap** (`src/root/bootstrap.ts`): `bootstrap` that renders the
      application root with `react-dom/client`, wires the bridge (operate
      dispatch → registry → `sendOperateResult`; navigation/recovery callbacks),
      installs global `error` / `unhandledrejection` handlers reporting via
      `sendRuntimeError`, sends `ready` with the hook contract version after
      mount, and starts the heartbeat. Returns a disposable handle.
- [x] **Barrel** (`src/index.ts`): re-export the public API with JSDoc.
- [x] **Unit tests** (Vitest): bridge origin rejection + send payload shape,
      hook-registry dedupe, and Operate `dispatch` parameter validation.

### 2.2 Empty reference app (`reference-app/empty/`)

- [x] Scaffold the Vite app: `package.json`
      (`@datonfly-autocode/reference-empty-app`, private), `index.html`,
      `vite.config.ts`, `tsconfig.json`, `vite-env.d.ts`. Deps: `app-sdk`
      (`workspace:*`), `react`, `react-dom`, `@mui/material`, `@emotion/react`,
      `@emotion/styled`. Dev: `vite`, `@vitejs/plugin-react`, `typescript`,
      `@types/react`, `@types/react-dom`.
- [x] `src/App.tsx`: an **empty placeholder** root (MUI `ThemeProvider` +
      `CssBaseline`, no content) — the application-owned root the codegen agent
      fills in later.
- [x] `src/main.tsx`: mount via the `app-sdk` `bootstrap`, deriving the Shell
      origin from a Vite env var.
- [x] `src/manifest.ts`: a minimal, schema-validated `VendorAppManifest` sample
      for the empty app (exercises the manifest contract).

### 2.3 Wiring

- [x] Add `reference-app/*` to `pnpm-workspace.yaml`; add `app-sdk` and
      `reference-app/empty` to the root `tsconfig.json` references. (Turbo tasks
      are generic; no `turbo.json` change needed.)
- [x] Run `pnpm install`, then confirm `pnpm build`, `pnpm lint`,
      `pnpm format:check`, and the `app-sdk` tests pass.
- [x] Commit: "Add the app-sdk and an empty reference application."

### Deferred to a later slice

- [ ] Content-ful **reference vendor app**: minimal UI base library + small
      backend exercising at least one extension hook and one Operate tool.
- [ ] Application **template repository** partition (framework-owned vs.
      application-owned areas) + the pre-commit hook rejecting commits to the
      framework-owned area, plus the tagged vanilla baseline — landed alongside
      Forgejo/`RepoProvider` (Phase 5) and codegen (Phase 6).

---

## Phase 3 — Frontend Shell

First slice of the framework **Shell**: a Vite/React/MUI top frame that hosts
the per-user application in a sandboxed `<iframe>`, drives it over the typed
Shell-side bridge, derives session status and a recovery panel from bridge
traffic, and embeds a working assistant chat. The chat is functional end-to-end
but **not yet bound** to the application or a control plane.

Decisions for this slice (resolved with the user):

- **Bridge-only (no control plane).** This slice does not call the Orchestrator
  or any control-plane REST/WS API, and does not subscribe to `core` events.
  Session status is derived purely from bridge traffic (`ready` + `heartbeat`
  timing, last `navigated`, last build/runtime error). The recovery panel sends
  `recovery-command` over the bridge. Control-plane wiring lands in Phase 4.
- **Bridge host in `shell-ui` (not `app-sdk`).** The Shell-side host is the
  mirror of `app-sdk`'s `createBridgeClient` and lives in `shell-ui`, keeping
  `app-sdk` strictly application-side. The wire contract stays single-sourced in
  `core` (both sides import `parseAppToShellMessage` / `parseShellToAppMessage`
  and the message schemas); only the thin transport wrapper differs.
- **Real assistant chat, unbound.** The chat embeds the actual
  `@datonfly-assistant` chat components against the actual assistant backend,
  but is not wired to control the application or orchestrator yet.
- **Consume assistant packages via local link.** `@datonfly-assistant/core`,
  `chat-client`, and `chat-ui-mui` are consumed as `link:` dependencies on the
  sibling `../datonfly-assistant` workspace (which must be built first). This is
  a temporary dev-only arrangement; a published/registry approach comes later.
  _Update:_ those packages are now published to `npm.jlehtinen.net` at 0.0.1, so
  the registry approach is unblocked — see §3.7.
- **Assistant runs from its own stack.** The assistant backend runs from the
  sibling repo with its normal dev setup (`docker compose up -d` + `pnpm dev`);
  the Shell proxies the assistant API to it. No autocode-side Postgres or extra
  backend configuration is needed for this slice.
- **Single hard-coded dev session.** No workspace provisioning or selection UI —
  the Shell embeds the Phase 2 `reference-app/empty` as the one dev session.

### 3.1 `shell-ui` scaffold (`packages/shell-ui`, `@datonfly-autocode/shell-ui`)

- [x] Scaffold the Vite app: `package.json` (`@datonfly-autocode/shell-ui`,
      private), `index.html`, `vite.config.ts`, `tsconfig.json`,
      `vite-env.d.ts`, `src/main.tsx`. Deps: `@datonfly-autocode/core`
      (`workspace:*`), `react`, `react-dom`, `@mui/material`, `@emotion/react`,
      `@emotion/styled`, and `link:`-linked `@datonfly-assistant/core`,
      `@datonfly-assistant/chat-client`, `@datonfly-assistant/chat-ui-mui`. Dev:
      `vite`, `@vitejs/plugin-react`, `vitest`, `typescript`, `@types/react`,
      `@types/react-dom`.
- [x] Add `shell-ui` to the root `tsconfig.json` references (the `packages/*`
      workspace glob already covers it).

### 3.2 Shell-side bridge host (`src/bridge/host.ts`)

- [x] `createBridgeHost` — the mirror of `app-sdk`'s `createBridgeClient`:
      installs an origin-checked `message` listener (via
      `parseAppToShellMessage`) routing `ready` / `heartbeat` / `navigated` /
      `build-error` / `runtime-error` / `operate-result` to callbacks, and
      exposes typed senders (`sendNavigate`, `sendOperateDispatch`,
      `sendRecoveryCommand`) plus `dispose`. The event source and target window
      are injectable for testing.
- [x] **Unit tests** (Vitest): wrong-origin rejection, inbound routing, sender
      payload shape, and `dispose` stops listening.

### 3.3 Session state + sub-frame host

- [x] `src/session/useAppSession.ts`: a reducer/hook deriving a session status
      (`connecting` → `live` → `stalled` / `errored`) from `ready` + heartbeat
      timing, tracking the last navigated path and the last build/runtime error.
      Unit-tested with Vitest (pure reducer).
- [x] `src/components/AppFrame.tsx`: a sandboxed `<iframe>` loading
      `reference-app/empty`, wiring the bridge host to the frame window and the
      expected application origin.
- [x] `src/components/SessionPanel.tsx`: shows the derived status, last
      navigated path, and last error summary.
- [x] `src/components/RecoveryPanel.tsx`: `auto_repair` / `revert` / `vanilla`
      actions dispatched via `host.sendRecoveryCommand` (bridge-only; does not
      yet trigger a real rebuild).

### 3.4 Assistant chat + layout

- [x] `src/components/ChatPanel.tsx`: embed the assistant `ChatHistoryEmbed`
      (config `url = window.location.origin`, proxied to the assistant backend).
      Working chat, not wired to the application.
- [x] `src/App.tsx`: compose the chat region, `AppFrame`, and the session and
      recovery panels under a MUI `ThemeProvider` + `CssBaseline`.

### 3.5 Dev wiring (temporary)

- [x] `shell-ui` `vite.config.ts`: dev port 5274; proxy `/datonfly-assistant`
      (with `ws: true`) and `/auth` to `http://localhost:3000`; derive the
      application-frame origin from `VITE_APP_FRAME_ORIGIN` (default
      `http://localhost:5273`).
- [x] Set `VITE_SHELL_ORIGIN=http://localhost:5274` for the
      `reference-app/empty` dev server so its bootstrap accepts the Shell
      origin.
- [x] Document the temporary chat dev setup in `INSTALL.md`: build the sibling
      `datonfly-assistant` first, run the assistant from the sibling repo with
      its normal dev setup (`docker compose up -d` + `pnpm dev`), then run the
      `reference-app/empty` and the Shell.

### 3.6 Wiring & verification

- [x] Run `pnpm install`, then confirm `pnpm build`, `pnpm lint`,
      `pnpm format:check`, and the `shell-ui` tests pass.
- [x] Manual smoke check: the empty app loads in the iframe; `ready` /
      `heartbeat` move `SessionPanel` to "live"; recovery buttons post commands;
      the chat round-trips against the assistant backend.
- [x] Commit: "Add the Shell with a sandboxed application frame and assistant
      chat."

### 3.7 Consume the assistant packages from the private registry (now unblocked)

The sibling assistant packages are now published to `npm.jlehtinen.net` at
0.0.1, so the temporary cross-repo `link:` arrangement can be replaced with a
registry dependency. This removes the "build the sibling repo first" step for
the chat UI (the assistant _backend_ still runs from the sibling repo until it
is folded into the orchestrated dev/deploy setup — deferred below).

- [ ] Add a scoped-registry `.npmrc` mapping
      `@datonfly-assistant:registry=https://npm.jlehtinen.net` (provide the auth
      token via an env var; never commit credentials).
- [ ] Replace the three `@datonfly-assistant/*` `link:` deps in
      `packages/shell-ui/package.json` with `^0.0.1` registry ranges; run
      `pnpm install` and confirm `pnpm build` + the `shell-ui` tests still pass.
- [ ] Update `INSTALL.md`: the chat UI packages now resolve from the registry,
      so building the sibling `datonfly-assistant` packages first is no longer
      required (only the assistant backend dev setup remains).
- [ ] Commit: "Consume the assistant chat packages from the private registry."

### Deferred to a later slice

- [ ] Bind the chat/assistant to the application: Operate dispatch and the
      repair conversation driving the sub-frame over the bridge (lands with
      codegen / recovery, Phase 6–7).
- Replace the bridge-derived session view with real control-plane session
  lifecycle, deployment routing, and event subscriptions — now planned in Phase
  4 (§4.5).
- [ ] Workspace provisioning / selection UI (Phase 5; Phase 4 still uses a
      hard-coded seeded workspace).
- [ ] Fold the assistant backend into the real orchestrated dev/deploy setup
      (the `link:` → registry chat-dependency migration is now §3.7).

---

## Phase 4 — Orchestrator + Docker sandbox (vertical slice)

First slice of the **control plane**: a working `Orchestrator` driving a
**Docker** sandbox provider, fronted by a NestJS control-plane backend, and
wired into the Shell. The goal is to prove the lifecycle end-to-end — the Shell
starts a real session → the Orchestrator provisions and starts a per-workspace
container → the Shell routes the application `<iframe>` to that running
container and reflects control-plane session/sandbox state from live events.
This is a **proof-of-concept**: Kubernetes, real build/deploy, and codegen come
later, so the container runs a **stub web server**, not generated application
code.

Decisions for this slice (resolved with the user):

- **Docker first (not Kubernetes).** The sandbox provider targets the local
  Docker daemon via the **default socket**. The Kubernetes provider
  (`sandbox-k8s`, NetworkPolicies/quotas, Kind + CNI) is a later slice.
- **Full vertical slice.** Provider + Orchestrator + a NestJS control-plane
  backend + Shell wiring, so the lifecycle is exercised end-to-end through the
  real wire contracts — not just a library with unit tests.
- **In-memory control-plane state.** Workspaces / sessions / deployments live in
  an in-memory store this slice; a Postgres-backed control-plane store
  (data-preserving migrations, per CONVENTIONS) is a later slice.
- **Stub App Runtime container.** Since build/deploy (Phase 5) and codegen
  (Phase 6) don't exist yet, the App Runtime container serves a **stub web
  server** (e.g. `traefik/whoami`, image overridable) purely to prove lifecycle
  / health / routing. `reference-app/empty` is **not** containerized. As a
  result, the stub does not speak the Shell bridge, so the Shell's session view
  is now driven by **control-plane status** (which supersedes the Phase 3
  bridge-derived "live" indication in that panel).
- **Security/isolation deferred.** Network isolation, egress allow-list,
  resource quotas, dropped capabilities, and read-only rootfs are documented
  no-ops / best-effort approximations this slice. Real enforcement lands with
  the Kubernetes provider and the Phase 8 hardening.
- **Minimal `core` routing addition.** The `core` `SandboxProvider` returns a
  `WorkloadHandle` with no reachable URL, and neither `Session` nor `Deployment`
  wire schemas carry a routing URL — so the Shell currently has no contract way
  to learn where to point the `<iframe>`. This slice adds `endpoint` to
  `WorkloadHandle` and an `appRuntimeUrl` field to a new **start-session
  response** schema (the persisted `Session` / `Deployment` entities are left
  unchanged).

### 4.1 `core` routing addition

- [x] Add `endpoint: string` (reachable base URL after start) to
      `WorkloadHandle` in `src/interfaces/sandbox.ts`.
- [x] Add a `startSessionResponseSchema` to `src/endpoints/schemas.ts` carrying
      the `Session` wire shape plus `appRuntimeUrl`; re-export it (and any new
      types) from the `core` barrel. Keep persisted entity schemas unchanged.

### 4.2 Docker sandbox provider (`packages/sandbox-docker`, `@datonfly-autocode/sandbox-docker`)

- [x] Scaffold the package mirroring `core`'s library setup (`package.json`,
      `tsconfig.json`, `tsc` build). Deps: `@datonfly-autocode/core`
      (`workspace:*`), `dockerode`. Dev: `typescript`, `vitest`,
      `@types/dockerode`.
- [x] `DockerSandboxProvider` implementing the `core` `SandboxProvider` against
      the local Docker daemon (default socket): `createNamespace` → a
      per-workspace Docker network (best-effort); `startWorkload` → run the stub
      image with a published port and return a `WorkloadHandle` whose `endpoint`
      is the reachable URL; `stopWorkload` / `scaleToZero` → stop/remove;
      `checkHealth` → an HTTP/inspect probe; `streamLogs` → container logs as an
      `AsyncIterable<string>`. `egressAllowList` and resource quotas are
      documented no-ops this slice.
- [x] **Integration smoke test** (Vitest, requires Docker): start the stub,
      `checkHealth` returns healthy, logs yield at least one line, stop cleans
      up. Skipped automatically when Docker is unavailable.

### 4.3 Orchestrator (`packages/orchestrator`, `@datonfly-autocode/orchestrator`)

- [x] Scaffold the package mirroring `core`'s library setup. Deps:
      `@datonfly-autocode/core` (`workspace:*`). Dev: `typescript`, `vitest`.
- [x] `createOrchestrator` implementing the `core` `Orchestrator` over an
      in-memory store (workspaces / sessions / deployments) and an injected
      `SandboxProvider` + event sink:
  - `provisionWorkspace` → record an in-memory `UserWorkspace`.
  - `startSession` → `createNamespace` + `startWorkload("app-runtime", stub)` +
    health gate → `active`; create the `Session` → `Deployment` link; emit
    `sandbox-state-changed` + `session-state-changed`; surface the `endpoint` as
    the session's `appRuntimeUrl`.
  - `endSession` → `stopWorkload` + `scaleToZero`; emit the closing events.
  - `reportBuildFailure` / `reportRuntimeFailure` / `recover` → recovery
    state-machine transitions and `recovery-state-changed` events only (no real
    build / codegen this slice).
- [x] **Unit tests** (Vitest) with a **fake** `SandboxProvider` (no Docker):

### 4.4 Control-plane backend (`packages/control-plane`, `@datonfly-autocode/control-plane`)

- [x] Scaffold a NestJS service mirroring the sibling `datonfly-assistant`
      backend conventions (NestJS 11, `nestjs-pino`, Socket.io, ESM + Node16,
      `tsc` build). Deps: `@datonfly-autocode/core`,
      `@datonfly-autocode/orchestrator`, `@datonfly-autocode/sandbox-docker`
      (all `workspace:*`), plus the Nest/runtime deps.
- [x] REST controllers on the `core` endpoint paths (`WORKSPACES_PATH`,
      `SESSIONS_PATH`, `sessionRecoveryPath`, …) and a Socket.io gateway at
      `WS_PATH` emitting the `controlPlaneEvent` union from the orchestrator's
      event sink.
- [x] Wire the orchestrator + `DockerSandboxProvider`; seed one demo
      `Application` + `UserWorkspace` in the in-memory store at boot. Dev port
      **3100**.

### 4.5 Shell wiring (`packages/shell-ui`)

- [x] Add a control-plane client: REST (start / end session, recovery) +
      Socket.io subscription to the `controlPlaneEvent` union.
- [x] `useControlPlaneSession`: start a session for the seeded demo workspace
      and expose its status + `appRuntimeUrl`.
- [x] Point `AppFrame`'s `<iframe>` `src` at `appRuntimeUrl` (the running stub
      container); the bridge host stays wired but is inert against the stub.
- [x] Drive `SessionPanel` from control-plane session/sandbox state (supersedes
      the Phase 3 bridge-derived status in this view); `RecoveryPanel` →
      `POST sessionRecoveryPath` (state transition only this slice).
- [x] `vite.config.ts`: add a `/datonfly-autocode` proxy (with `ws: true` for
      socket.io) → `http://localhost:3100`.

### 4.6 Dev wiring & verification

- [x] Document running the control-plane backend in `INSTALL.md` (Docker daemon
      required; backend on port 3100; the seeded demo workspace) alongside the
      existing Shell + assistant setup.
- [x] Run `pnpm install`, then confirm `pnpm build`, `pnpm lint`,
      `pnpm format:check`, the orchestrator unit tests, and the `sandbox-docker`
      smoke test (with Docker) pass.
- [x] Manual smoke check: with Docker + the backend up, `POST` a session →
      response carries the session + `appRuntimeUrl`; `docker ps` shows the
      container; WS emits session/sandbox events; the Shell moves `starting` →
      `active` and the `<iframe>` loads the stub; ending the session stops the
      container.
- [x] Commit: "Add the control plane with a Docker-backed orchestrator and
      session lifecycle."

### Deferred to a later slice

- [ ] Postgres-backed control-plane persistence (data-preserving migrations).
- [ ] Real network isolation, egress allow-list, resource quotas, and the
      least-privilege container hardening.
- [ ] Kubernetes provider (`sandbox-k8s`): namespace-per-user, NetworkPolicies,
      quotas, Kind + policy-enforcing CNI.
- [ ] Real build/deploy of an actual Revision into the App Runtime container
      (Phase 5) and codegen-driven content (Phase 6), replacing the stub.
- [ ] Workspace provisioning / selection UI (no hard-coded seeded workspace).

---

## Phase 5 — Repo + build/deploy (real build & deploy slice)

First slice of the **Repo + Build/Deploy** capability: replace the Phase 4
`traefik/whoami` **stub** with a **real build and deploy** of the actual
`reference-app/empty`. A pluggable `RepoProvider` clones the in-monorepo
template seed and tags a **vanilla baseline** Revision; a pluggable
`BuildProvider` builds a Revision into a deployable artifact; the Orchestrator
performs a **health-gated deploy** that serves the built artifact from the App
Runtime container and **supersedes** the previous deployment only after the
health gate passes; **revert** restores a prior Revision by rebuilding and
redeploying it. This proves the Revision → build → health-gated deploy → revert
loop end-to-end through the real provider interfaces, while keeping the Phase 4
Docker-first, in-memory posture.

Decisions for this slice (resolved with the user):

- **Vertical "real build & deploy" slice.** Provider packages + Orchestrator
  wiring + control-plane wiring + minimal Shell wiring, so the lifecycle is
  exercised end-to-end. Forgejo, the framework/application partition + the
  pre-commit hook, template-upgrade/migrations, Postgres persistence, and
  Kubernetes are explicitly **deferred**.
- **Local on-disk Git `RepoProvider` (`packages/repo-git`).** The initial
  provider is a **local filesystem Git** implementation over a configurable
  workspaces-root directory, using **`simple-git`**. The Forgejo (Gitea-API)
  provider lands with the Kubernetes slice; the `core` `RepoProvider` interface
  stays unchanged so it is a drop-in alternative. The **template seed is the
  in-monorepo `reference-app/empty` directory** (per the Phase 2 decision that
  this directory is the literal content of the application template repository).
- **Host build (`packages/build-deploy`).** `BuildProvider` checks out the
  workspace repo at a ref into a temporary directory and runs the build **on the
  host** (`pnpm install` + `pnpm build`), capturing structured build
  diagnostics. Running the build **inside a sandbox/build container** lands with
  codegen (Phase 6).
- **Workspace dependency resolution.** `reference-app/empty` depends on
  `@datonfly-autocode/app-sdk` (transitively `core`) via `workspace:*`, which a
  standalone clone cannot resolve. `createWorkspaceFromTemplate` **rewrites
  those `workspace:*` deps to `link:` absolute paths** to the pre-built monorepo
  packages (the Phase 2 plan already anticipates the Phase 5 seeding step
  rewriting the `app-sdk` dependency). The Forgejo slice replaces this with a
  pinned controlled-registry version. **`app-sdk` and `core` must be built
  before a workspace build runs.**
- **Static-serve the built artifact.** The App Runtime container serves the Vite
  **`dist/`** as static files via a web-server image (**`nginx:alpine`**),
  bind-mounting the built `dist/` read-only. A per-revision Docker image is a
  later (Kubernetes/prod) concern.
- **Operations in scope.** `createWorkspaceFromTemplate` (clone + tag baseline),
  **build a Revision** into an artifact, **health-gated deploy + supersede**,
  and **revert** to a prior Revision. The framework/application partition + the
  pre-commit hook and `template-upgrade`/migrations are **deferred**.

### 5.1 `core` contract additions (additive only)

- [x] Add an optional `mounts?: WorkloadMount[]` to `StartWorkloadOptions` in
      `src/interfaces/sandbox.ts` (`WorkloadMount` =
      `{ hostPath: string; containerPath: string; readOnly?: boolean }`), so a
      provider can serve a host-built artifact. Export `WorkloadMount` from
      `src/interfaces/index.ts` and the barrel. Keep all existing fields.
- [x] Add a `deployment-state-changed` event to `src/events/events.ts` (and the
      `controlPlaneEventSchema` union): `workspaceId`, `deploymentId`,
      `status: DeploymentStatus`, optional `appRuntimeUrl`. Re-export it.
- [x] Add `revisionWireSchema` / `deploymentWireSchema` (ISO-date transforms
      mirroring `sessionWireSchema`) + `RevisionWire` / `DeploymentWire` types
      to `src/endpoints/schemas.ts`; re-export from the barrel. Persisted entity
      shapes are unchanged.
- [x] Rebuild `core` (it is a dependency of every other package).

### 5.2 Local-git repo provider (`packages/repo-git`, `@datonfly-autocode/repo-git`)

- [x] Scaffold the package mirroring `core`'s library setup (`package.json`,
      `tsconfig.json` + `tsconfig.build.json` excluding tests, `tsc` build).
      Deps: `@datonfly-autocode/core` (`workspace:*`), `simple-git`. Dev:
      `@types/node` (+ `"types": ["node"]` in tsconfig), `typescript`, `vitest`.
- [x] `LocalGitRepoProvider` implementing the `core` `RepoProvider` over a
      configurable workspaces-root directory:
  - `createWorkspaceFromTemplate` → copy the `reference-app/empty` seed into
    `<root>/<workspaceId>`, **rewrite the `app-sdk` / `core` `workspace:*` deps
    to `link:` absolute paths** to the built monorepo packages, `git init` +
    initial commit, **tag the vanilla baseline**, and return `RepoCoordinates`
    (the `cloneUrl` is the local path). The framework/application pre-commit
    hook is **not** installed this slice.
  - `commit` / `createBranch` / `integrateBranch` / `tag` / `revertToTag` /
    `history` / `diff` implemented over `simple-git`.
  - `upgradeTemplate` → throw a not-implemented framework error (deferred).
- [x] **Unit tests** (Vitest, temp dir): `createWorkspaceFromTemplate` produces
      a repo with the baseline tag and rewritten deps; `tag` / `revertToTag` /
      `history` / `diff` round-trip.

### 5.3 Build + deploy (`packages/build-deploy`, `@datonfly-autocode/build-deploy`)

- [x] Scaffold the package mirroring `core`'s library setup. Deps:
      `@datonfly-autocode/core` (`workspace:*`). Dev: `@types/node` (+
      `"types": ["node"]`), `typescript`, `vitest`.
- [x] `HostBuildProvider` implementing the `core` `BuildProvider`: check out the
      workspace repo at `ref` into a clean temp dir, run `pnpm install` +
      `pnpm build`, capture stdout/stderr into `BuildDiagnostics`, and on
      success compute a `digest` (sha256 over the sorted `dist/` files) and
      return a `BuildArtifact` whose `reference` is the absolute `dist/` path.
      Use `formatLoggedError()` for logged failures.
- [x] A `deployArtifact({ sandbox, workspaceId, revisionId, distPath, logger })`
      helper:
      `startWorkload("app-runtime", STATIC_SERVER_IMAGE, mounts: [{     hostPath: distPath, containerPath: <nginx html root>, readOnly: true }])`,
      poll `checkHealth` (the health gate), and return `{ handle, endpoint }`.
      Keeps the Docker / static-server specifics out of the Orchestrator. Export
      `STATIC_SERVER_IMAGE` (`nginx:alpine`) and the static root constant.
- [x] **Unit test** (Vitest): the `dist/` digest helper is stable and
      order-independent. A full build smoke test runs against a **tiny fixture
      app** (not the real reference app) and is gated on tool availability.

### 5.4 Docker sandbox — bind mounts (`packages/sandbox-docker`)

- [x] `DockerSandboxProvider.startWorkload` binds `options.mounts` to
      `HostConfig.Binds` (`${hostPath}:${containerPath}:ro` for read-only). The
      static server listens on `:80`, so the existing published-port /
      `endpoint` logic is unchanged.
- [x] Extend the gated smoke test to start the static-server image with a
      bind-mounted directory and confirm it serves the file over HTTP.

### 5.5 Orchestrator wiring (`packages/orchestrator`)

- [x] `createOrchestrator` gains injected `repo: RepoProvider` and
      `build: BuildProvider` (alongside the existing `sandbox` + event sink).
- [x] `provisionWorkspace` → `repo.createWorkspaceFromTemplate`, record the repo
      coordinates, create the **baseline `Revision`** (`isBaseline`, `gitTag`,
      `commitSha`, `buildStatus: "pending"`), and set
      `workspace.currentRevisionId`.
- [x] Internal `ensureBuilt(revision)` → if unbuilt, `build.build()`; on success
      set `artifactDigest` + `buildStatus: "succeeded"` and cache the `dist`
      path; on failure route into the recovery machine (`build_failed`). Emit
      the build/deploy step events.
- [x] `startSession` → `ensureBuilt(currentRevision)` → `deployArtifact` →
      health gate → create a `healthy` `Deployment` for the current revision and
      **supersede** the prior one → `active` + `appRuntimeUrl = endpoint`
      (replaces the Phase 4 stub `startWorkload`). Emit
      `deployment-state-changed`.
- [x] `recover(revert, target)` → `repo.revertToTag` → new `Revision` →
      `ensureBuilt` → `deployArtifact` → health-gated **supersede** (stop the
      old workload) → emit `deployment-state-changed` with the new
      `appRuntimeUrl` → `recovered`.
- [x] `endSession` stops the workload + scales to zero (unchanged) and marks the
      deployment `stopped`. Add `listRevisions` / `listDeployments` accessors.
- [x] **Unit tests** update: `FakeRepoProvider` + `FakeBuildProvider` (no
      Docker) assert provision builds the baseline, `startSession` deploys the
      current revision, and `revert` rebuilds + supersedes.

### 5.6 Control-plane wiring (`packages/control-plane`)

- [x] `main.ts` instantiates `LocalGitRepoProvider` (workspaces-root + logger)
      and `HostBuildProvider` (logger), and passes `repo` + `build` to
      `createOrchestrator`. The seeded demo workspace now provisions a real
      repo + baseline at boot (slower boot is acceptable).
- [x] Add the read endpoints `GET workspaceRevisionsPath` → `RevisionWire[]` and
      `GET workspaceDeploymentsPath` → `DeploymentWire[]` (backed by the new
      Orchestrator accessors). The gateway already broadcasts the event union,
      so `deployment-state-changed` flows through unchanged.

### 5.7 Shell wiring (`packages/shell-ui`)

- [x] `useControlPlaneSession`: on `deployment-state-changed` carrying a new
      `appRuntimeUrl`, update `state.appRuntimeUrl` so the `<iframe>` repoints
      after a supersede / revert. `SessionPanel` optionally shows the current
      revision id + build status. (Recovery buttons already POST recovery;
      revert now triggers a real rebuild + redeploy.)

### 5.8 Dev wiring & verification

- [x] Update `INSTALL.md`: the control plane now performs **real build +
      deploy** — Docker daemon + `pnpm` on the host are required, `app-sdk` and
      `core` must be built first, the workspaces-root directory and the
      `nginx:alpine` static-server image are used, and the build runs on
      provision (slower seed).
- [x] Run `pnpm install`, then confirm `pnpm build`, `pnpm lint`,
      `pnpm format:check`, the `repo-git` / `build-deploy` / orchestrator unit
      tests, and the `sandbox-docker` smoke test (with Docker) pass.
- [x] Manual smoke check: provisioning builds the baseline; `startSession`
      deploys an `nginx` container serving the **real** empty app (`docker ps`
      shows the bind mount); the Shell `<iframe>` loads the empty MUI app;
      `revert` rebuilds + supersedes (old container stopped, the `<iframe>`
      repoints); ending the session stops the container.
- [x] Commit: "Add real build and deploy with a local-git repo provider and
      health-gated deployment."

### Deferred to a later slice

- [ ] Forgejo (Gitea-API) `RepoProvider` running in-cluster, replacing the
      local-git provider.
- [ ] Framework-owned vs. application-owned partition + the pre-commit hook
      rejecting commits to the framework-owned area.
- [ ] `template-upgrade`: pull/merge framework-owned files + versioned migration
      scripts from the recorded template version (with recovery-loop fallback).
- [ ] In-sandbox (container) builds via the `SandboxProvider`, replacing the
      host build (lands with codegen, Phase 6).
- [ ] Per-revision Docker image artifacts and Postgres-backed control-plane
      persistence of revisions/deployments (data-preserving migrations).

---

## Later phases (coarse — expand when reached)

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

- **Private dev-environment registries.** The local development environment
  provides a private npm registry and Docker registry (currently
  `npm.jlehtinen.net` / `docker.jlehtinen.net`). The npm registry already hosts
  the `@datonfly-assistant/*` consumable packages (`core`, `chat-client`,
  `chat-ui-mui`) at 0.0.1, which unblocks replacing the Shell's cross-repo
  `link:` chat dependencies with registry ranges (§3.7). These are
  **dev-environment infrastructure only**: Autocode itself stays
  registry-agnostic and consumes whatever package/image registries the target
  deploy environment provides, so the controlled-registry consumption model and
  template-repo dependency rewrites are configured per environment rather than
  pinned to these hosts. Auth tokens are supplied via env / `.npmrc` and never
  committed.
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
