type PriceSlot = Readonly<{
  startsAt: string;
  total: number;
  currency: string;
  level: string | null;
}>;

type PriceWindow = Readonly<{
  minutes: number;
  startsAt: string;
  endsAt: string;
  average: number;
  minimum: number;
  maximum: number;
  currency: string;
}>;

type Advice = Readonly<{
  provider: string;
  homeId: string;
  generatedAt: string;
  current: PriceSlot | null;
  recommendation: Readonly<{
    action: "run_now" | "wait" | "neutral";
    reason: string;
    currentPercentile: number | null;
    nextCheaperAt: string | null;
  }>;
  cheapestWindows: Readonly<{
    minutes30: PriceWindow | null;
    minutes60: PriceWindow | null;
    minutes120: PriceWindow | null;
  }>;
  cheapestSlots: readonly PriceSlot[];
  expensiveSlots: readonly PriceSlot[];
}>;

type Home = Readonly<{
  id: string;
  name?: string | null;
  gridCompany?: string | null;
  priceAreaCode?: string | null;
}>;

type Consumption = Readonly<{
  totalConsumption: number | null;
  totalCost: number | null;
  currency: string | null;
}>;

const STOCKHOLM = "Europe/Stockholm";

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: STOCKHOLM,
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: STOCKHOLM,
  }).format(new Date(value));
}

function money(value: number, currency = "SEK"): string {
  return new Intl.NumberFormat("sv-SE", {
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function number(value: number, digits = 1): string {
  return new Intl.NumberFormat("sv-SE", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

async function api<T>(path: string): Promise<T> {
  const key = process.env.HOME_ENERGY_API_KEY?.trim();
  if (!key) throw new Error("HOME_ENERGY_API_KEY is not configured");

  const base =
    process.env.HOME_ENERGY_API_URL?.trim() || "http://127.0.0.1:3002";

  const response = await fetch(`${base}${path}`, {
    cache: "no-store",
    headers: { "x-home-energy-key": key },
  });

  if (!response.ok) {
    throw new Error(`Home-Energy API returned HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

function signalText(action: Advice["recommendation"]["action"]) {
  if (action === "run_now") {
    return {
      label: "RUN NOW",
      detail: "Current electricity is among the cheapest available.",
    };
  }

  if (action === "wait") {
    return {
      label: "WAIT",
      detail: "A meaningfully cheaper window is coming up.",
    };
  }

  return {
    label: "NEUTRAL",
    detail: "No strong price advantage either way right now.",
  };
}

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let advice: Advice;
  let homes: readonly Home[];
  let consumption: Consumption;

  try {
    [advice, { homes }, consumption] = await Promise.all([
      api<Advice>("/api/energy/advice"),
      api<{ homes: readonly Home[] }>("/api/energy/homes"),
      api<Consumption>("/api/energy/consumption?days=7"),
    ]);
  } catch (error) {
    return (
      <main className="shell shell-error">
        <section className="error-card">
          <span className="kicker">HOME-ENERGY</span>
          <h1>Dashboard unavailable</h1>
          <p>{error instanceof Error ? error.message : "Unknown error"}</p>
        </section>
      </main>
    );
  }

  const home = homes.find((item) => item.id === advice.homeId);
  const signal = signalText(advice.recommendation.action);
  const windows = [
    advice.cheapestWindows.minutes30,
    advice.cheapestWindows.minutes60,
    advice.cheapestWindows.minutes120,
  ].filter((window): window is PriceWindow => window !== null);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">HE</span>
          <span>
            <strong>Home-Energy</strong>
            <small>SWITSYS</small>
          </span>
        </div>

        <div className="system-state">
          <i aria-hidden="true" />
          LIVE · {advice.provider.toUpperCase()}
        </div>
      </header>

      <main className="content">
        <section className="heading">
          <div>
            <span className="kicker">
              {home?.name ?? "HOME"} · {home?.priceAreaCode ?? "ENERGY"}
            </span>
            <h1>Energy overview</h1>
            <p>
              Price intelligence now. Telemetry and automation next.
            </p>
          </div>

          <a className="refresh" href="/">
            Refresh
          </a>
        </section>

        <section className="hero-grid">
          <article className="card current-card">
            <span className="label">CURRENT PRICE</span>
            <div className="price">
              {advice.current
                ? money(advice.current.total, advice.current.currency)
                : "—"}
            </div>
            <span className="unit">per kWh</span>
            {advice.current?.level ? (
              <span className="pill">
                {advice.current.level.replaceAll("_", " ")}
              </span>
            ) : null}
          </article>

          <article
            className={`card signal-card signal-${advice.recommendation.action}`}
          >
            <span className="label">RECOMMENDATION</span>
            <strong>{signal.label}</strong>
            <p>{signal.detail}</p>
            {advice.recommendation.nextCheaperAt ? (
              <small>
                Next cheaper opportunity:{" "}
                {formatDateTime(advice.recommendation.nextCheaperAt)}
              </small>
            ) : (
              <small>No cheaper slot currently identified.</small>
            )}
          </article>

          <article className="card consumption-card">
            <span className="label">LAST 7 DAYS</span>
            <strong>
              {consumption.totalConsumption === null
                ? "—"
                : `${number(consumption.totalConsumption)} kWh`}
            </strong>
            <p>
              {consumption.totalCost === null
                ? "Cost unavailable"
                : money(
                    consumption.totalCost,
                    consumption.currency ?? "SEK",
                  )}
            </p>
            <small>{home?.gridCompany ?? "Grid company unavailable"}</small>
          </article>
        </section>

        <section className="section">
          <div className="section-heading">
            <div>
              <span className="kicker">BEST WINDOWS</span>
              <h2>Cheapest time to run</h2>
            </div>
          </div>

          <div className="window-grid">
            {windows.map((window) => (
              <article className="window-card" key={window.minutes}>
                <span>{window.minutes} MIN</span>
                <strong>
                  {formatTime(window.startsAt)}–{formatTime(window.endsAt)}
                </strong>
                <p>{money(window.average, window.currency)} avg/kWh</p>
                <small>
                  {money(window.minimum, window.currency)}–{money(window.maximum, window.currency)}
                </small>
              </article>
            ))}
          </div>
        </section>

        <section className="two-column">
          <div>
            <div className="section-heading compact">
              <div>
                <span className="kicker">CHEAPEST UPCOMING</span>
                <h2>Good slots</h2>
              </div>
            </div>

            <div className="slot-list">
              {advice.cheapestSlots.map((slot) => (
                <div className="slot-row cheap" key={slot.startsAt}>
                  <span>{formatDateTime(slot.startsAt)}</span>
                  <strong>{money(slot.total, slot.currency)}</strong>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="section-heading compact">
              <div>
                <span className="kicker">MOST EXPENSIVE</span>
                <h2>Avoid these</h2>
              </div>
            </div>

            <div className="slot-list">
              {advice.expensiveSlots.map((slot) => (
                <div className="slot-row expensive" key={slot.startsAt}>
                  <span>{formatDateTime(slot.startsAt)}</span>
                  <strong>{money(slot.total, slot.currency)}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer>
          <span>
            Updated {formatDateTime(advice.generatedAt)}
          </span>
          <span>Home-Energy · provider-neutral core</span>
        </footer>
      </main>
    </div>
  );
}
