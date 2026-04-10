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

3. **Start the control-plane backend** (`packages/control-plane`). It drives the
   Docker-backed orchestrator and the session lifecycle, so a running **Docker
   daemon is required**. Unlike earlier slices it now performs a **real build +
   deploy**: on boot it provisions a demo workspace as a local Git repository
   cloned from `reference-app/empty`, builds it with host `pnpm`, and (when a
   session starts) serves the built `dist` from an `nginx:alpine` container over
   a read-only bind mount, reporting its `appRuntimeUrl` to the Shell. This
   means:
   - **`pnpm` on the host** is used to install + build each workspace (not just
     this repo's packages).
   - **`app-sdk` and `core` must be built first** — the standalone workspace
     links against their compiled output. A full `pnpm build` (above) covers
     this.
   - The **`nginx:alpine`** image is pulled on first deploy.
   - Workspaces are created under a workspaces-root directory (default
     `.workspaces/` in the repo root; override with `DF_WORKSPACES_ROOT`).
   - The build runs on provision, so **the first boot is slower** than the
     previous stub.

   ```bash
   # in datonfly-autocode (Docker daemon must be running; run `pnpm build` first)
   pnpm --filter @datonfly-autocode/control-plane dev
   ```

   The backend listens on port 3100 (REST + Socket.io). Override with `PORT` and
   the log level with `LOG_LEVEL` (set `LOG_FORMAT=json` for structured logs).

4. **Run the Shell:**

   ```bash
   pnpm --filter @datonfly-autocode/shell-ui dev
   ```

   The Shell serves on port 5274 and proxies the assistant API
   (`/datonfly-assistant`, `/auth`) to the backend on port 3000 and the
   control-plane API (`/datonfly-autocode`, with `ws: true` for socket.io) to
   the backend on port 3100. On load it starts a session for the seeded demo
   workspace; the sandboxed sub-frame is pointed at the control plane's
   `appRuntimeUrl` — the `nginx` container serving the freshly built
   `reference-empty-app`. The iframe automatically repoints when a new
   deployment becomes healthy (for example after a `revert`).
