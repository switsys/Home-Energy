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
- `apps/web` — standalone server-rendered dashboard

## Environment

Copy `.env.example` to `.env` and set:

- `TIBBER_TOKEN`
- `HOME_ENERGY_HOME_ID` or `TIBBER_HOME_ID`
- `HOME_ENERGY_API_KEY`
- `HOME_ENERGY_API_URL` for the dashboard (defaults to `http://127.0.0.1:3002`)

The dashboard reads the API key server-side and does not expose it to the browser.

## Build and test

```bash
pnpm install
pnpm test
pnpm build
```

## API

Typical standalone API deployment:

```bash
PORT=3002 node --env-file=.env apps/api/dist/server.js
```

Endpoints:

- `GET /api/energy/status`
- `GET /api/energy/homes`
- `GET /api/energy/prices`
- `GET /api/energy/advice`
- `GET /api/energy/consumption`

## Dashboard

Development:

```bash
pnpm --filter @home-energy/web dev
```

Production build:

```bash
pnpm --filter @home-energy/web build
```

The dashboard is designed to run separately from the API, typically on port 3003.
