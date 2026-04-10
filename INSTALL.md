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

## Running the Shell with the assistant chat (temporary dev setup)

The Shell (`packages/shell-ui`) embeds the assistant chat from the sibling
`datonfly-assistant` workspace. This is a **temporary** arrangement: the chat
packages are consumed as `link:` dependencies and the chat talks to a regular
assistant backend run from the sibling repo. The Shell proxies the assistant API
to that backend, so the chat shares the Shell's origin (no special CORS or
search configuration is needed).

1. **Build the sibling assistant packages** the Shell links against. From the
   `datonfly-assistant` checkout (a sibling directory of this repo):

   ```bash
   pnpm install
   pnpm --filter @datonfly-assistant/chat-ui-mui... build
   ```

2. **Start the assistant** normally from the sibling repo, following its own
   `INSTALL.md` (configure its `.env`, at minimum `ANTHROPIC_API_KEY`):

   ```bash
   # in datonfly-assistant
   docker compose up -d   # Postgres and the other assistant dependencies
   pnpm dev               # assistant backend + frontend; backend listens on port 3000
   ```

3. **Run the empty reference application** (the application sub-frame), telling
   it to accept the Shell origin:

   ```bash
   # in datonfly-autocode
   VITE_SHELL_ORIGIN=http://localhost:5274 pnpm --filter @datonfly-autocode/reference-empty-app dev
   ```

4. **Run the Shell:**

   ```bash
   pnpm --filter @datonfly-autocode/shell-ui dev
   ```

   The Shell serves on port 5274, proxies the assistant API
   (`/datonfly-assistant`, `/auth`) to the backend on port 3000, and loads the
   empty app (`http://localhost:5273`) in the sandboxed sub-frame.
