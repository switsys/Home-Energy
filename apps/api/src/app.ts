import { createHash, timingSafeEqual } from "node:crypto";
import {
  buildEnergyAdvice,
  type EnergyProvider,
  type PriceSchedule,
  type PriceSlot,
} from "@home-energy/core";
import { TibberProvider } from "@home-energy/tibber";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";

const HOME_CACHE_MS = 60 * 60 * 1000;
const PRICE_CACHE_MS = 24 * 60 * 60 * 1000;
const PRICE_RETRY_CACHE_MS = 60 * 60 * 1000;

type TimedCache<T> = Readonly<{ expiresAt: number; value: T }>;

export type AppOptions = Readonly<{
  provider?: EnergyProvider | null;
  clock?: () => Date;
  apiKey?: string | null;
  defaultHomeId?: string | null;
}>;

function configured(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function providerFromEnvironment(): EnergyProvider | null {
  const token = configured(process.env.TIBBER_TOKEN);
  if (token === null) return null;

  return new TibberProvider({
    token,
    endpoint: configured(process.env.TIBBER_API_URL) ?? undefined,
  });
}

function secretEqual(actual: string, expected: string): boolean {
  const actualDigest = createHash("sha256").update(actual).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

function accessGuard(apiKey: string | null) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (apiKey === null) {
      return reply.status(503).send({
        error: "api_key_not_configured",
      });
    }

    const supplied = request.headers["x-home-energy-key"];
    if (typeof supplied !== "string" || !secretEqual(supplied, apiKey)) {
      return reply.status(401).send({ error: "unauthenticated" });
    }
  };
}

function priceStartsAt(price: PriceSlot): number | null {
  if (price.startsAt === null) return null;
  const value = Date.parse(price.startsAt);
  return Number.isFinite(value) ? value : null;
}

function deriveCurrentPrice(
  schedule: PriceSchedule,
  now: Date,
): PriceSchedule {
  const entries = [...schedule.today, ...schedule.tomorrow]
    .map((price) => ({ price, startsAt: priceStartsAt(price) }))
    .filter(
      (entry): entry is Readonly<{ price: PriceSlot; startsAt: number }> =>
        entry.startsAt !== null,
    )
    .sort((left, right) => left.startsAt - right.startsAt);

  const nowMs = now.getTime();
  const current =
    entries.find((entry, index) => {
      const nextStart =
        entries[index + 1]?.startsAt ?? entry.startsAt + 15 * 60 * 1000;
      return entry.startsAt <= nowMs && nowMs < nextStart;
    })?.price ?? schedule.current;

  return { ...schedule, current };
}

function cacheLifetime(schedule: PriceSchedule): number {
  return schedule.tomorrow.length > 0 ? PRICE_CACHE_MS : PRICE_RETRY_CACHE_MS;
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const provider =
    options.provider === undefined ? providerFromEnvironment() : options.provider;
  const clock = options.clock ?? (() => new Date());
  const apiKey =
    options.apiKey === undefined
      ? configured(process.env.HOME_ENERGY_API_KEY)
      : configured(options.apiKey);
  const defaultHomeId =
    options.defaultHomeId === undefined
      ? configured(process.env.HOME_ENERGY_HOME_ID) ??
        configured(process.env.TIBBER_HOME_ID)
      : configured(options.defaultHomeId);
  const requireAccess = accessGuard(apiKey);

  let homesCache: TimedCache<Awaited<ReturnType<EnergyProvider["homes"]>>> | null =
    null;
  const priceCache = new Map<string, TimedCache<PriceSchedule>>();

  async function homes() {
    if (provider === null) throw new Error("No energy provider is configured");
    const nowMs = clock().getTime();
    if (homesCache !== null && homesCache.expiresAt > nowMs) {
      return homesCache.value;
    }
    const value = await provider.homes();
    homesCache = { expiresAt: nowMs + HOME_CACHE_MS, value };
    return value;
  }

  async function resolveHomeId(requested?: string): Promise<string> {
    const explicit = configured(requested);
    if (explicit !== null) return explicit;
    if (defaultHomeId !== null) return defaultHomeId;

    const first = (await homes())[0];
    if (first === undefined) throw new Error("No homes are visible to provider");
    return first.id;
  }

  async function prices(homeId: string): Promise<PriceSchedule> {
    if (provider === null) throw new Error("No energy provider is configured");

    const now = clock();
    const cached = priceCache.get(homeId);
    if (cached !== undefined && cached.expiresAt > now.getTime()) {
      return deriveCurrentPrice(cached.value, now);
    }

    const value = await provider.prices(homeId);
    priceCache.set(homeId, {
      expiresAt: now.getTime() + cacheLifetime(value),
      value,
    });
    return deriveCurrentPrice(value, now);
  }

  function unavailable(reply: FastifyReply, error: unknown) {
    return reply.status(502).send({
      error: "energy_provider_unavailable",
      message: error instanceof Error ? error.message : "Unknown provider error",
    });
  }

  app.get("/api/energy/status", async () => ({
    configured: provider !== null,
    protected: apiKey !== null,
    provider: provider?.id ?? null,
  }));

  app.get(
    "/api/energy/homes",
    { preHandler: requireAccess },
    async (_request, reply) => {
      try {
        return { homes: await homes() };
      } catch (error) {
        return unavailable(reply, error);
      }
    },
  );

  app.get<{ Querystring: { homeId?: string } }>(
    "/api/energy/prices",
    { preHandler: requireAccess },
    async (request, reply) => {
      try {
        const homeId = await resolveHomeId(request.query.homeId);
        return await prices(homeId);
      } catch (error) {
        return unavailable(reply, error);
      }
    },
  );

  app.get<{ Querystring: { homeId?: string } }>(
    "/api/energy/advice",
    { preHandler: requireAccess },
    async (request, reply) => {
      try {
        const homeId = await resolveHomeId(request.query.homeId);
        return buildEnergyAdvice(await prices(homeId), clock());
      } catch (error) {
        return unavailable(reply, error);
      }
    },
  );

  app.get<{ Querystring: { days?: string; homeId?: string } }>(
    "/api/energy/consumption",
    { preHandler: requireAccess },
    async (request, reply) => {
      const days =
        request.query.days === undefined ? 7 : Number(request.query.days);
      if (!Number.isInteger(days) || days < 1 || days > 31) {
        return reply.status(400).send({
          error: "invalid_days",
          message: "days must be an integer from 1 to 31",
        });
      }

      try {
        if (provider === null) throw new Error("No energy provider is configured");
        const homeId = await resolveHomeId(request.query.homeId);
        return await provider.consumption(homeId, days);
      } catch (error) {
        return unavailable(reply, error);
      }
    },
  );

  return app;
}
