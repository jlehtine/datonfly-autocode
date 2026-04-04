# Datonfly Autocode

A framework for delivering **per-user, AI-customizable applications** on top of a
shared, vendor-supplied base application. Autocode combines existing vendor code
with on-demand, AI-generated code so that end users — including non-developers —
can both **operate** and **extend** an application through natural language.

Two capabilities are offered behind a single natural-language surface:

- **Operate** — drive the *existing* user interface with natural-language input
  that resolves to existing functionality and user-provided parameters. No new
  code is produced; the running application exposes tools and the assistant
  invokes them.
  _Example:_ "search for projects starting in January".

- **Generate** — *extend* the application with new, on-demand AI-generated code
  that is built, deployed, and run as a per-user variant of the application.
  _Example:_ "add a new view showing projects as a Gantt chart".

The framework makes Generate safe, reversible, and recoverable: every generated
change is versioned in a per-user Git repository, all code runs in an isolated
sandbox that can reach only vendor-approved services, and failures degrade
gracefully to a known-good state with an in-product assistant to repair them.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the implementation architecture and
[CONVENTIONS.md](CONVENTIONS.md) for the coding and project conventions that
apply to the framework itself.

## Scope

### Framework vs. applications

Autocode draws a firm line between **the framework** and **the applications**
that run inside it:

- **The framework implementation is single-stack.** Autocode itself is built
  with Node.js, strictly-typed TypeScript, React with Material UI, and NestJS,
  organized as a pnpm + Turbo monorepo. See
  [CONVENTIONS.md](CONVENTIONS.md).

- **Applications running inside the framework may use any stack.** A vendor
  application can be built in TypeScript/React, Python, or any other supported
  technology. The framework orchestrates, isolates, versions, builds, deploys,
  and recovers application variants without assuming the application's language
  or libraries.

- **The vendor supplies the agent instructions for their stack.** Because the
  codegen agent must produce idiomatic code in the application's own language and
  architecture, the application vendor provides the prompts, instructions, and
  tool definitions that teach the agent how to build on that specific stack.

- **The framework ships ready-made stack templates.** Templates bundle a base
  application skeleton, extension hooks, the application SDK, and the agent
  instructions for a given stack. The **initial template targets the framework's
  own stack** (TypeScript / React + MUI / NestJS); additional templates (e.g.
  Python) can be added over time.

### In scope

- Natural-language **Operate** over an existing application via assistant tools.
- AI-driven **Generate** of per-user application extensions (new views, menus,
  panels, and — where the stack allows — backend services).
- **Per-user isolation**: each user session runs an isolated sandbox that can
  communicate only with vendor-approved services and APIs.
- **On-demand lifecycle**: per-user sandboxes start when a session begins and
  stop when it expires.
- **Versioning**: every generated change is committed to a per-user Git
  repository and is fully revertible.
- **Controlled dependency supply**: an allow-listed package registry (optionally
  a curated public mirror) governs what generated code may depend on.
- **Error handling and recovery**: build and runtime failures are captured and
  surfaced, with auto-repair, revert-to-revision, and switch-to-vanilla escape
  hatches.

### Out of scope

- The vendor application's own business logic and data ownership — Autocode
  extends and orchestrates applications but does not own their domain data, which
  remains in vendor services.
- General-purpose CI/CD for vendor base applications — Autocode builds and
  deploys *per-user variants*, not the vendor's authoritative base release.
- Acting as an identity provider — authentication is delegated to an OIDC
  provider, consistent with `datonfly-assistant`.

## Features

- **Dual natural-language surface** — one assistant that both operates the
  existing UI and generates new functionality.
- **In-product Shell** — a framework-provided top frame that hosts the per-user
  application in a sandboxed sub-frame and provides the assistant chat (built on
  `datonfly-assistant`), session control, and a recovery panel.
- **Per-user sandboxes on Kubernetes** — isolated execution and build pods,
  started and stopped on demand as sessions begin and expire, locked down by
  network policy to vendor services only.
- **Per-user Git history** — every AI-generated change is a commit; any prior
  version can be restored.
- **On-demand codegen sandbox** — an ephemeral environment containing the cloned
  repository, vendor-supplied agent instructions, and the tools needed to publish
  a new version of the application to the user.
- **Extension hooks** — the vendor base application exposes typed hooks (menus,
  views/routes, panels, data sources) that generated code extends without forking
  the base library.
- **Controlled library registry** — generated code may depend only on
  allow-listed packages, or on a curated mirror of selected public packages.
- **First-class recovery** — health-gated deploys, isolation of sub-frame
  failures from the framework Shell, auto-repair via the assistant, and an
  always-available switch back to the vanilla vendor application.
- **Stack templates** — ready-made starting points per application stack, with
  the initial template matching the framework's own stack.

## Relationship to Datonfly Assistant

Autocode reuses [`datonfly-assistant`](../datonfly-assistant) for the in-product
assistant: the streaming chat UI embedded in the Shell top frame (used for both
Operate and repair), the pluggable AI agent runtime that powers code generation,
and the OIDC/JWT authentication model. Autocode adds the layers specific to
auto-coding: sandbox orchestration, per-user versioning, build and deployment of
application variants, the controlled registry, and the recovery state machine.

## Status

Early development. Nothing has been released and inter-package APIs are expected
to change. This repository currently contains the project's foundational
documentation; implementation follows the phased roadmap described in the
planning materials.
