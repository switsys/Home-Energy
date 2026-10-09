# Home-Energy

[![CI](https://github.com/switsys/Home-Energy/actions/workflows/ci.yml/badge.svg)](https://github.com/switsys/Home-Energy/actions/workflows/ci.yml)

**Current release line:** `0.9.0-beta.1`

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
- `HOME_ENERGY_GRID_TARIFF=falu-elnat-2026` to enable the current Falu Elnät grid model
- `HOME_ENERGY_PROPERTY_ID` and `HOME_ENERGY_PROPERTY_NAME` to give multiple provider homes one property identity

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
- `GET /api/energy/property`
- `GET /api/energy/property/consumption?days=7`
- `GET /api/energy/property/grid-peaks`
- `GET /api/energy/homes`
- `GET /api/energy/prices`
- `GET /api/energy/advice`
- `GET /api/energy/consumption`
- `GET /api/energy/load-plan?minutes=120&powerKw=1.5`
- `GET /api/energy/grid-peaks`
- `GET /api/energy/devices`
- `POST /api/energy/automation/preview`

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


## What 0.9 beta already does

- Reads quarter-hourly Tibber prices without coupling the core to Tibber.
- Finds the cheapest contiguous run window for a configurable load.
- Includes Falu Elnät variable grid-transfer cost in load planning.
- Models the winter effect-tariff period separately instead of pretending it is a per-kWh fee.
- Reads hourly consumption history and tracks the three peak-demand days used by the Falu Elnät effect-charge model.
- Keeps separate peak-demand billing scopes for properties with multiple grid inlets instead of merging their peaks.
- Groups multiple provider homes into one Home-Energy property and aggregates property-wide consumption while preserving each connection.
- Maps devices to the grid connection that actually powers them before calculating automation windows.
- Produces approval-gated device automation previews without executing physical control yet.
- Keeps account credentials on the server side; the browser never receives the Home-Energy API key.

The next development line connects device adapters, starting with Google Home as a companion control surface, while keeping Home-Energy responsible for energy decisions and grid-aware scheduling.
