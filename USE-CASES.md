# Use cases

This document is the durable record of **how the Datonfly Autocode framework
behaves, per user goal**. Each use case co-locates two lenses so the user
experience and the implementation never drift apart:

- the **user experience** — what an end user does and observes; and
- the **flow (implementation)** — the components, ordered interactions, and
  events that realize it, linking to [ARCHITECTURE.md](ARCHITECTURE.md) sections
  and the JSDoc'd `core` interfaces.

It complements the other docs rather than repeating them: [README.md](README.md)
frames the product, [ARCHITECTURE.md](ARCHITECTURE.md) describes the static
structure and contracts, [CONVENTIONS.md](CONVENTIONS.md) captures
coding/project conventions, and this file captures **behavior over time**.
`TODO.md` holds in-progress plans; once a slice lands, its durable behavior is
distilled here.

Each entry follows the same shape: **Actors & trigger**, **User experience**,
**Flow (implementation)**, **Failure & recovery**, and **Status** (implemented /
partial / planned).

## 1. Generate

A user describes a change in natural language and the framework produces a new,
built, deployable revision of their application variant.

**Status:** _partial._ The host-run generation cycle — agent-driven file edits,
commit/integrate/tag, revision adoption, and deployment build — is implemented
and unit-tested in the `codegen` and `orchestrator` packages. The control-plane
Generate endpoint and the Shell trigger with progress streaming are implemented:
the Shell can submit a prompt and observe `codegen-job-progress` steps. Because
no concrete agent is wired yet, the endpoint returns **503** until a
`CodegenProvider` is injected. The in-sandbox inner loop and the concrete agent
wiring remain **planned** (see _Deferred_ below).

### Actors & trigger

- **Actor:** an authenticated end user working on their own application variant.
- **Trigger:** the user submits a Generate prompt from the Shell's Generate
  panel, which `POST`s to the control-plane Generate endpoint; the controller
  calls `Orchestrator.runCodegenJob`. (The richer embedded-chat trigger remains
  planned.) One call represents exactly **one generation cycle** — prompt to a
  committed, built revision. The multi-turn interactive clarification loop (the
  agent asking follow-up questions) is owned by the assistant runtime and the
  embedded chat, not by `runCodegenJob`.

### User experience

- The user states what they want changed; generation targets only the
  **application-owned** part of the variant (UI this slice — `src/**`), never
  framework-owned files.
- Progress is observable as a sequence of steps: the agent **plans and applies a
  diff**, the changes are **committed** as a new revision, and that revision is
  **built** for deployment.
- On success the workspace advances to the new revision, which becomes what
  subsequent sessions deploy. On failure nothing is adopted and the workspace
  stays on its current revision.

### Flow (implementation)

Components: the `codegen` package's
[`HostCodegenProvider`](packages/codegen/src/host-codegen-provider.ts) (a
`core.CodegenProvider`), its application-scoped
[file tools](packages/codegen/src/tools/fs-tools.ts), the
[`InMemoryOrchestrator`](packages/orchestrator/src/orchestrator.ts), and the
injected `RepoProvider` / `BuildProvider` / `IAgentProvider`. See
[ARCHITECTURE.md §8.4](ARCHITECTURE.md) (codegen and revision lifecycle) and
[§3.2](ARCHITECTURE.md) (codegen sandbox — the planned in-sandbox host).

1. **Entry.** The caller invokes `Orchestrator.runCodegenJob(request)`. The
   orchestrator validates the workspace and records a `CodegenJob` (`queued` →
   `planning`), then delegates to the configured `CodegenProvider`. The provider
   is **optional** on the orchestrator; if none is configured, `runCodegenJob`
   rejects.
2. **Planned diff.** `HostCodegenProvider.runJob` mints a `RevisionId`, builds
   per-job file tools rooted at the workspace working tree, and calls
   `IAgentProvider.run` with the prompt plus curated context. The file tools
   (`list_files`, `read_file`, `search_files`, `write_file`) **reject** writes
   outside the application-owned globs (default `src/**`) and any path escaping
   the repo (traversal guard) — a **tool-level partition** that keeps generation
   inside the application-owned area. Emits a `planned-diff` started/completed
   step (detail = the changed-file list).
3. **Commit.** The written application-owned files are committed on a
   `codegen/<revisionId>` branch, integrated into the workspace line, and tagged
   `rev-<revisionId>`. Emits a `commit` started/completed step (detail = sha).
   If the agent writes no files, the provider returns `{ succeeded: false }`
   with no revision.
4. **Adoption.** The orchestrator adopts the produced `Revision` into its store
   (parent = the workspace's current revision, `originCodegenJobId` = the job,
   `gitTag = rev-<id>`, `commitSha` resolved via `repo.history`, build status
   pending).
5. **Deployment build.** The orchestrator runs `ensureBuilt` on the adopted
   revision to produce the deployable `dist/` artifact, emitting a build step,
   then advances `workspace.currentRevisionId` and marks the job `succeeded`.
   This **deployment build** is distinct from any **inner-loop build/test** the
   agent may run while generating: the deployment re-derives the artifact from
   the committed revision rather than trusting sandbox output (important once
   codegen runs in a less-trusted sandbox). The agent's inner loop is planned.
6. **Progress.** Each provider step is forwarded as a `codegen-job-progress`
   control-plane event; the Shell's Generate panel subscribes over the Socket.io
   gateway and renders `planned-diff`, `commit`, and the build step in order.
   Accessors `listCodegenJobs(workspaceId)` / `getCodegenJob(id)` expose
   recorded jobs; the control-plane exposes them at the `codegen-jobs` endpoint
   (`POST` to run, `GET` to list/fetch). When no `CodegenProvider` is configured
   the orchestrator throws `NoCodegenProviderError`, which the controller maps
   to HTTP **503**.

**Ownership split.** Generation writes only application-owned files; the
framework owns commit/integrate/tag, revision adoption, and the deployment
build. See [ARCHITECTURE.md §8.2](ARCHITECTURE.md) (framework- vs.
application-owned partition).

### Failure & recovery

- **No changes produced** (agent writes nothing) → the provider returns
  `succeeded: false`; the orchestrator records the job as `failed` and leaves
  the workspace on its current revision.
- **Build failure** of the adopted revision → the orchestrator emits the build
  step with `ok: false`, marks the job `failed`, and does not advance
  `currentRevisionId`.
- The structured **repair loop** that feeds build/runtime diagnostics back to
  the agent is the Phase 7 recovery flow (see
  [ARCHITECTURE.md §9](ARCHITECTURE.md)) and is **planned**. Because revisions
  are tagged and durable user data lives in vendor services, reverting to a
  prior revision is always available as the escape hatch.

### Deferred (planned)

- Binding the richer **embedded chat** (vs. the minimal Generate panel) to
  trigger Generate and show progress inline.
- In-sandbox codegen container replacing the host run, where the provider
  absorbs build/deploy and the agent gains **inner-loop build/test** tools for
  self-validation and iteration.
- Wiring the concrete agent (model/key/config) plus real application-control /
  customization tools and MCP servers.
- The repair flow (`kind: "repair"`) — Phase 7 recovery loop.
- Per-user backend-service generation (UI-only this slice).
- Application-owned globs sourced from the manifest, plus a Git pre-commit hook
  enforcing the partition.
