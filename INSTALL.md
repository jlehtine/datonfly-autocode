# Installation & Development Setup

This document covers bootstrapping the **Datonfly Autocode framework** for local
development. It will be expanded with deployment instructions in a later phase.

## Prerequisites

- **Node.js** 22 or newer.
- **pnpm** 10 or newer (`corepack enable` will provision the pinned version from
  `package.json`).
- **Docker** — required for the local Kubernetes cluster and container builds.
- **Kind** — the local/e2e Kubernetes cluster (single node is sufficient).
- A policy-enforcing CNI (**Cilium** preferred, Calico acceptable) installed
  into the Kind cluster so `NetworkPolicy` and sandbox isolation are actually
  enforced. Setup scripts are added in a later phase.

## Bootstrap

```bash
pnpm install
pnpm build
```

## Common tasks

```bash
pnpm build         # Build all packages via Turbo
pnpm lint          # Lint all packages
pnpm lint:fix      # Lint and auto-fix
pnpm format        # Format the repository with Prettier
pnpm format:check  # Verify formatting
pnpm dev           # Run packages in watch/dev mode
```
