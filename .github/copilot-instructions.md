# Copilot Instructions

Follow the architecture described in [README.md](../README.md) and
[ARCHITECTURE.md](../ARCHITECTURE.md), and the coding conventions in
[CONVENTIONS.md](../CONVENTIONS.md). This file contains only agent-specific
workflow rules. General project conventions live in those files — do not
duplicate them here.

## Framework vs. applications

These instructions, and all conventions referenced above, apply to the **Datonfly
Autocode framework implementation itself**. They do **not** apply to applications
executed within the framework — those follow their own stack's conventions,
defined by each vendor application and its stack template. When working on
framework code, use the framework stack (Node.js, strict TypeScript, React/MUI,
NestJS, pnpm + Turbo). Keep contracts in `core` stack-neutral so non-TypeScript
applications can interoperate.

## Development Phase

This software is in initial development and has not been released. Inter-package
API compatibility does not need to be maintained. Prefer simplifications over
backward-compatible changes when refactoring across packages.

The one exception is **persisted control-plane data**: control-plane state may
exist in test deployments, so database schema and stored data must be handled
carefully. Always use data-preserving migrations; never drop or alter data in a
destructive way. (Application user data is owned by vendor services, not the
framework.)

## Decision Making

Stick to the agreed plan. If during implementation you encounter unforeseen
complications, inconsistencies, or ambiguities — stop, describe the problem and
the available options to the user, and ask how to proceed before continuing.

## Linting

After code changes, run `pnpm lint:fix` and fix any linting errors caused by the
changes.

## Testing

After implementing a feature, decide whether the feature warrants unit tests or
end-to-end tests. If so, implement the required tests and verify they pass.

**Run only the specific test file(s) relevant to the change** (e.g.
`pnpm exec playwright test tests/recovery.spec.ts`). Running the entire test
suite at once easily triggers LLM rate limits, causing spurious failures.

E2E tests require the dev server (`pnpm dev`) to be running. If it is not known
whether the dev server is running, ask the user to start it. If the user
previously started the dev server in the session, assume it is still running. Do
not start the dev server unless asked to or after receiving explicit permission.
