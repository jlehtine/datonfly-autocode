# Conventions

These conventions apply to the **Datonfly Autocode framework implementation
itself**. They do **not** apply to applications executed within the framework —
those follow their own stack's conventions, defined by each vendor application
and its stack template. The framework is deliberately single-stack so that its
own codebase stays consistent with the sibling
[`datonfly-assistant`](../datonfly-assistant) project.

## Language

All source identifiers (variables, functions, classes, etc.) and documentation
(comments, JSDoc, READMEs, commit messages) are written in **English**.

## Technology stack

The framework is implemented with the same stack as `datonfly-assistant`:

- **Node.js** 22+.
- **Strictly-typed TypeScript** everywhere.
- **React** with **Material UI** (`@mui/material`) for user-facing surfaces (the
  Shell), and **Material Icons** (`@mui/icons-material`) for icons.
- **NestJS** for backend/control-plane services.
- **pnpm** 10+ workspaces with a **Turbo** task graph.
- **Kubernetes** as the runtime execution environment (see
  [ARCHITECTURE.md](ARCHITECTURE.md)).

Note the stack split: this stack governs the framework's code. Stack-neutral
**contracts** that applications bind to are defined in the framework's `core`
package as TypeScript types plus language-agnostic wire schemas, so that
non-TypeScript applications can interoperate.

## TypeScript

Strict TypeScript everywhere. All packages use strict compiler settings
(`strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`,
`exactOptionalPropertyTypes`, `noImplicitReturns`, `noImplicitOverride`, and
related flags), inheriting from a shared base `tsconfig`.

## Architecture

- **`core`** declares the shared types, provider interfaces, domain model, and
  the REST/WebSocket and bridge contracts (paths + Zod schemas). All other
  packages depend on `core` — never duplicate its definitions.
- **Pluggable providers.** Capabilities with multiple possible backends —
  sandbox orchestration, per-user Git, build/deploy, the package registry, and
  the codegen agent — implement generic interfaces from `core`. Keep
  provider-specific details out of the orchestrator and shared layers, so a
  Kubernetes sandbox provider and a local Docker provider (for example) are
  interchangeable.
- **Thin standalone shims.** The runnable reference control-plane backend and
  the reference vendor application are thin compositions of the libraries — keep
  them minimal.
- **Stack-neutral contracts, single-stack implementation.** Contracts that
  applications implement must not assume the framework's stack; the framework's
  own implementation freely uses it.

## Code formatting

**Prettier** handles all code formatting, configured at the monorepo root. Key
settings mirror `datonfly-assistant`:

- `printWidth`: 120
- `tabWidth`: 4
- Import ordering via `@ianvs/prettier-plugin-sort-imports`

Run `pnpm format` to format all files, or `pnpm format:check` to verify.

Whitespace defaults are enforced by `.editorconfig` at the monorepo root
(2-space indentation for config/markup, LF line endings, UTF-8, final newline;
trailing whitespace is preserved in Markdown).

## Linting

**ESLint 10** with TypeScript-ESLint `strictTypeChecked` and
`stylisticTypeChecked` rule sets, configured at the monorepo root.

Run `pnpm lint` to lint all packages, or `pnpm lint:fix` to auto-fix. After code
changes, run `pnpm lint:fix` and fix any linting errors introduced by the
changes.

## Logging

- When logging a caught error, do not inline `error.message`, `String(error)`,
  or similar conversions at the call site.
- Use the shared `formatLoggedError()` helper to produce the logged error
  string; it walks the `Error.cause` chain so logs include the full nested
  failure context.
- Keep user-facing error messages separate from log formatting. Use the full
  formatted chain for logs and audit entries, and expose end-user text only when
  that is the intended behavior of the API or UI surface. This is especially
  important for the recovery flows, where build and runtime diagnostics are both
  logged in full and summarized for the end user.

## Commit messages

- **Sentence case**, ending with a **period**.
- Use **imperative mood** when describing an action (e.g. "Add support for…",
  "Fix an issue with…"). Descriptive noun phrases are acceptable for broader
  changes (e.g. "Sandbox orchestration scaffolding.").
- Optional **scope prefix** with a colon for scoped changes (e.g. "Orchestrator:
  …", "Registry: …").
- Keep to a **single summary line** — no body paragraph.

## Documentation

All public API interfaces are documented with **JSDoc**.

Project-wide conventions belong in this file (`CONVENTIONS.md`), with the
architecture in [ARCHITECTURE.md](ARCHITECTURE.md), the per-user-goal behavior
in [USE-CASES.md](USE-CASES.md), and the general description in
[README.md](README.md). Agent-specific instructions (e.g.
`.github/copilot-instructions.md`) should only contain agent workflow rules and
reference these documents for general conventions — never duplicate them.

[USE-CASES.md](USE-CASES.md) is the durable record of how the system behaves per
user goal, co-locating the user experience and the implementation flow for each
use case. When a `TODO.md` slice lands, distill its durable behavior into the
relevant `USE-CASES.md` entry before pruning the slice from `TODO.md`.

## User interface

The framework Shell is built with **Material UI** (`@mui/material`); use
Material UI components for all framework user-facing elements, and **Material
Icons** (`@mui/icons-material`) for icons. (Applications inside the framework
are not bound by this — they follow their own stack.)

## Naming

- **Packages** are published under the `@datonfly-autocode/` scope.
- **Framework CSS marker classes** and **data attributes** used by E2E tests use
  the `datonfly-*` prefix (see End-to-End Tests).

## Database

When the framework persists control-plane state in PostgreSQL:

- All framework tables live in the **`dfac`** (Datonfly Autocode) PostgreSQL
  schema, so other Datonfly components can share the same database using their
  own schemas.
- **Table names** use the **singular** form.
- **Column names** use `snake_case`.
- **Schema changes** are managed via Kysely migrations, each file prefixed with
  an ISO 8601 timestamp.
- **Migrations must preserve data.** Test deployments may hold real state; never
  drop or destructively alter persisted data — always use data-preserving
  migrations.

Note: durable _application user data_ is owned by vendor services, not by the
framework. The framework persists only its own control-plane state (sessions,
workspaces, revisions, deployments, jobs, and similar).

## End-to-end tests

Major framework features should have **Playwright E2E tests**, with reusable
helpers factored into a shared helpers module.

- Add `datonfly-*` CSS marker classes to Shell elements that E2E tests need to
  locate. Never rely on MUI internal class names.
- Tests must not rely on localized human-readable UI text for element targeting.
- For dynamic identifiers (e.g. a specific session or revision), use `data-`
  attributes.
- Prefer **extending an existing test** that already reaches a required
  precondition state over creating redundant setup, to keep the suite fast.

> Running an entire AI-driven suite at once can trigger model rate limits and
> cause spurious failures. Prefer running individual test files.

## Development phase

The framework is in initial development and has not been released. Inter-package
API compatibility does not need to be maintained; prefer simplifications over
backward-compatible changes when refactoring across packages. The one exception
is **persisted control-plane data**, which must always be handled with
data-preserving migrations.
