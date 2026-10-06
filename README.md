# Home-Energy

Standalone home energy intelligence, telemetry and automation platform.

## Design

Home-Energy owns the decisions. External services are adapters that provide facts or control hardware.

```text
price providers / meters / devices
            ↓
       adapters
            ↓
      core contracts
            ↓
 intelligence + automation
            ↓
       API / UI
```

The initial provider is Tibber. The core does not depend on Tibber-specific types.

## Workspace

- `packages/core` — provider-neutral contracts and energy intelligence
- `packages/tibber` — Tibber GraphQL adapter
- `apps/api` — standalone Fastify API

## Environment

Copy `.env.example` to `.env` and set:

- `TIBBER_TOKEN`
- `TIBBER_HOME_ID`
- `HOME_ENERGY_API_KEY`

## Run

```bash
pnpm install
pnpm test
pnpm --filter @home-energy/api build
node --env-file=.env apps/api/dist/server.js
```

Default API: `http://127.0.0.1:3001`.
