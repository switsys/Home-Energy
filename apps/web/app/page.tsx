import { InteractivePriceCurve } from "./price-curve-chart";

type PriceSlot = Readonly<{
  startsAt: string;
  total: number;
  currency: string;
  level: string | null;
}>;

type PriceSchedule = Readonly<{
  provider: string;
  homeId: string;
  current: PriceSlot | null;
  today: readonly PriceSlot[];
  tomorrow: readonly PriceSlot[];
}>;

type GridScheduleSlot = Readonly<{
  startsAt: string;
  loadPeriod: "low" | "high";
  season: "summer" | "winter";
  demandRatePerKwMonth: number;
}>;

type GridSchedule = Readonly<{
  provider: string | null;
  homeId: string;
  tariffId: string;
  label: string;
  today: readonly GridScheduleSlot[];
  tomorrow: readonly GridScheduleSlot[];
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

type GridConnection = Readonly<{
  id: string;
  name: string;
  providerId: string;
  providerHomeId: string;
  billingScopeId: string;
  gridTariffId: string | null;
  gridCompany: string | null;
  gridAreaCode: string | null;
  priceAreaCode: string | null;
}>;

type EnergyProperty = Readonly<{
  id: string;
  name: string;
  timeZone: string | null;
  gridConnections: readonly GridConnection[];
}>;

type PropertyConsumptionConnection = Readonly<{
  gridConnectionId: string;
  name: string;
  providerHomeId: string;
  totalConsumption: number | null;
  totalCost: number | null;
  currency: string | null;
}>;

type PropertyConsumption = Readonly<{
  propertyId: string;
  days: number;
  gridConnectionCount: number;
  totalConsumption: number | null;
  totalCost: number | null;
  currency: string | null;
  connections: readonly PropertyConsumptionConnection[];
}>;

type LoadPlanDemandImpact = Readonly<{
  status: "none" | "unknown" | "possible" | "definite";
  thresholdKw: number | null;
  plannedPeakContributionKw: number;
  currentEstimatedDemandCharge: number | null;
  projectedMinimumDemandCharge: number | null;
  minimumIncrementalDemandCharge: number | null;
  demandRatePerKwMonth: number;
}>;

type LoadPlanGridSummary = Readonly<{
  tariffId: string;
  label: string;
  transferCost: number;
  highestDemandRatePerKwMonth: number;
  peakWindowMinutes: number;
  peakAveragingCount: number;
  demandChargeIncludedInEstimatedCost: false;
  demandImpact: LoadPlanDemandImpact;
}>;

type LoadPlanWindow = Readonly<{
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  powerKw: number;
  energyKwh: number;
  averagePrice: number;
  energyPriceCost: number;
  gridTransferCost: number;
  estimatedCost: number;
  comparisonCost: number;
  currency: string;
  grid: LoadPlanGridSummary | null;
}>;

type LoadPlan = Readonly<{
  action: "run_now" | "wait";
  reason: string;
  immediate: LoadPlanWindow | null;
  best: LoadPlanWindow;
  savings: number | null;
  savingsPercent: number | null;
}>;

type DemandPeakDay = Readonly<{
  date: string;
  startsAt: string;
  averageKw: number;
}>;

type DemandPeakReport = Readonly<{
  tariffId: string;
  label: string;
  currency: string;
  generatedAt: string;
  billingMonth: string;
  status: "inactive" | "no_data" | "partial" | "estimated";
  demandRatePerKwMonth: number;
  requiredPeakDays: number;
  eligibleHours: number;
  peakDays: readonly DemandPeakDay[];
  trackedAveragePeakKw: number | null;
  thresholdKw: number | null;
  estimatedDemandCharge: number | null;
}>;

type PropertyGridPeakConnection = DemandPeakReport &
  Readonly<{
    gridConnectionId: string;
    billingScopeId: string;
    name: string;
    providerHomeId: string;
  }>;

type PropertyGridPeaks = Readonly<{
  propertyId: string;
  billingMode: "per_connection";
  currency: string | null;
  estimatedDemandChargeTotal: number | null;
  connections: readonly PropertyGridPeakConnection[];
}>;

type DashboardPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

function demandImpactText(window: LoadPlanWindow | null): string | null {
  const impact = window?.grid?.demandImpact;
  if (!impact || impact.status === "none") return null;

  if (
    impact.status === "definite" &&
    impact.minimumIncrementalDemandCharge !== null
  ) {
    return `Peak-demand impact: at least ${money(
      impact.minimumIncrementalDemandCharge,
      window?.currency ?? "SEK",
    )} additional monthly effect charge.`;
  }

  if (impact.status === "possible" && impact.thresholdKw !== null) {
    return `Peak-demand window: current top-3 threshold is ${number(
      impact.thresholdKw,
      2,
    )} kW; household baseline load could still increase the effect charge.`;
  }

  return "Peak-demand window: effect-charge impact is unknown until enough hourly history is available.";
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

function queryNumber(
  value: string | string[] | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const query = await searchParams;
  const plannerMinutes = Math.round(
    queryNumber(query.minutes, 120, 15, 24 * 60),
  );
  const plannerPowerKw = queryNumber(query.powerKw, 1.5, 0.1, 100);
  let advice: Advice;
  let prices: PriceSchedule;
  let property: EnergyProperty;
  let consumption: PropertyConsumption;

  try {
    [advice, prices, property, consumption] = await Promise.all([
      api<Advice>("/api/energy/advice"),
      api<PriceSchedule>("/api/energy/prices"),
      api<EnergyProperty>("/api/energy/property"),
      api<PropertyConsumption>("/api/energy/property/consumption?days=7"),
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

  let loadPlan: LoadPlan | null = null;
  let loadPlanError: string | null = null;
  let propertyPeaks: PropertyGridPeaks | null = null;
  let gridSchedule: GridSchedule | null = null;

  try {
    const params = new URLSearchParams({
      minutes: String(plannerMinutes),
      powerKw: String(plannerPowerKw),
    });
    loadPlan = await api<LoadPlan>(`/api/energy/load-plan?${params.toString()}`);
  } catch (error) {
    loadPlanError =
      error instanceof Error ? error.message : "Unable to calculate load plan";
  }

  try {
    propertyPeaks = await api<PropertyGridPeaks>(
      "/api/energy/property/grid-peaks",
    );
  } catch {
    propertyPeaks = null;
  }

  try {
    gridSchedule = await api<GridSchedule>("/api/energy/grid-schedule");
  } catch {
    gridSchedule = null;
  }

  const activeConnection = property.gridConnections.find(
    (connection) => connection.providerHomeId === advice.homeId,
  );
  const peakRiskSlots =
    gridSchedule?.today.filter(
      (slot) => slot.loadPeriod === "high" && slot.demandRatePerKwMonth > 0,
    ) ?? [];
  const signal = signalText(advice.recommendation.action);
  const allPeaksInactive =
    propertyPeaks?.connections.every(
      (connection) => connection.status === "inactive",
    ) ?? false;
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
              {property.name} · {property.gridConnections.length} GRID CONNECTIONS
            </span>
            <h1>Energy overview</h1>
            <p>
              One property view across both metered inlets.
            </p>
          </div>

          <a className="refresh" href="/">
            Refresh
          </a>
        </section>

        <section className="hero-grid">
          <article className="card current-card">
            <span className="label">CURRENT ENERGY PRICE</span>
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
            <small>
              Across {consumption.gridConnectionCount} separate grid connections
            </small>
          </article>
        </section>

        <InteractivePriceCurve
          currentPrice={advice.current ?? prices.current}
          currentStartsAt={
            advice.current?.startsAt ?? prices.current?.startsAt ?? null
          }
          gridScheduleAvailable={gridSchedule !== null}
          peakRiskSlots={peakRiskSlots}
          priceAreaCode={activeConnection?.priceAreaCode ?? null}
          slots={prices.today}
        />

        <section className="section">
          <div className="section-heading">
            <div>
              <span className="kicker">GRID CONNECTIONS</span>
              <h2>{property.name} as one property</h2>
            </div>
          </div>

          <div className="connection-grid">
            {property.gridConnections.map((connection) => {
              const usage = consumption.connections.find(
                (item) => item.gridConnectionId === connection.id,
              );
              const active = connection.id === activeConnection?.id;

              return (
                <article
                  className={`connection-card${active ? " connection-active" : ""}`}
                  key={connection.id}
                >
                  <span className="label">
                    {active ? "PRIMARY PRICE CONNECTION" : "GRID CONNECTION"}
                  </span>
                  <strong>{connection.name}</strong>
                  <p>
                    {usage?.totalConsumption === null ||
                    usage?.totalConsumption === undefined
                      ? "Consumption unavailable"
                      : `${number(usage.totalConsumption, 1)} kWh · last 7 days`}
                  </p>
                  <small>
                    {usage?.totalCost === null ||
                    usage?.totalCost === undefined
                      ? "Cost unavailable"
                      : money(usage.totalCost, usage.currency ?? "SEK")}
                    {" · "}
                    {connection.gridCompany ?? "Grid company unavailable"}
                    {connection.priceAreaCode
                      ? ` · ${connection.priceAreaCode}`
                      : ""}
                  </small>
                </article>
              );
            })}
          </div>
        </section>

        <section className="section planner-section">
          <div className="section-heading planner-heading">
            <div>
              <span className="kicker">LOAD PLANNER</span>
              <h2>When should I run it?</h2>
            </div>

            <form className="planner-form" method="get">
              <label>
                <span>Minutes</span>
                <input
                  defaultValue={plannerMinutes}
                  max="1440"
                  min="15"
                  name="minutes"
                  step="15"
                  type="number"
                />
              </label>
              <label>
                <span>Power kW</span>
                <input
                  defaultValue={plannerPowerKw}
                  max="100"
                  min="0.1"
                  name="powerKw"
                  step="0.1"
                  type="number"
                />
              </label>
              <button type="submit">Plan load</button>
            </form>
          </div>

          {loadPlan ? (
            <div className="planner-grid">
              <article className={`planner-result planner-${loadPlan.action}`}>
                <span className="label">RECOMMENDED START</span>
                <strong>
                  {loadPlan.action === "wait"
                    ? `WAIT UNTIL ${formatTime(loadPlan.best.startsAt)}`
                    : "RUN NOW"}
                </strong>
                <p>
                  {formatTime(loadPlan.best.startsAt)}–
                  {formatTime(loadPlan.best.endsAt)} ·{" "}
                  {money(loadPlan.best.estimatedCost, loadPlan.best.currency)}
                </p>
                <small>
                  {number(loadPlan.best.energyKwh, 2)} kWh ·{" "}
                  {money(loadPlan.best.averagePrice, loadPlan.best.currency)}
                  /kWh variable cost
                </small>
                {loadPlan.best.grid ? (
                  <small>
                    {loadPlan.best.grid.label}:{" "}
                    {money(
                      loadPlan.best.grid.transferCost,
                      loadPlan.best.currency,
                    )}{" "}
                    grid transfer included · peak tariff up to{" "}
                    {number(
                      loadPlan.best.grid.highestDemandRatePerKwMonth,
                      0,
                    )}{" "}
                    SEK/kW/month excluded from the displayed variable cost
                  </small>
                ) : null}
                {demandImpactText(loadPlan.best) ? (
                  <small>{demandImpactText(loadPlan.best)}</small>
                ) : null}
              </article>

              <article className="planner-result">
                <span className="label">STARTING NOW</span>
                <strong>
                  {loadPlan.immediate
                    ? money(
                        loadPlan.immediate.estimatedCost,
                        loadPlan.immediate.currency,
                      )
                    : "—"}
                </strong>
                <p>
                  {loadPlan.savings === null
                    ? "Immediate comparison unavailable."
                    : `Planning saving: ${money(
                        loadPlan.savings,
                        loadPlan.best.currency,
                      )}`}
                </p>
                <small>
                  {loadPlan.savingsPercent === null
                    ? `${plannerMinutes} min · ${number(plannerPowerKw, 1)} kW`
                    : `${number(loadPlan.savingsPercent, 1)}% cheaper at the best start`}
                </small>
                {loadPlan.immediate?.grid ? (
                  <small>
                    Current peak-tariff band: up to{" "}
                    {number(
                      loadPlan.immediate.grid.highestDemandRatePerKwMonth,
                      0,
                    )}{" "}
                    SEK/kW/month
                  </small>
                ) : null}
                {demandImpactText(loadPlan.immediate) ? (
                  <small>{demandImpactText(loadPlan.immediate)}</small>
                ) : null}
              </article>
            </div>
          ) : (
            <div className="planner-error">{loadPlanError}</div>
          )}
        </section>

        {propertyPeaks ? (
          <section className="section">
            <div className="section-heading">
              <div>
                <span className="kicker">PEAK DEMAND</span>
                <h2>Falu Elnät effect charge · separate per inlet</h2>
              </div>
            </div>

            {allPeaksInactive ? (
              <article className="peak-card peak-offseason">
                <span className="label">CURRENT PERIOD</span>
                <strong>OFF-SEASON</strong>
                <p>No effect charge applies this month.</p>
                <small>
                  Next active period: 1 November ·{" "}
                  {propertyPeaks.connections.length} separate billing scopes
                </small>
              </article>
            ) : (
              <>
                <article className="peak-card peak-summary">
                  <span className="label">PROPERTY EFFECT CHARGE</span>
                  <strong>
                    {propertyPeaks.estimatedDemandChargeTotal === null
                      ? "PARTIAL"
                      : money(
                          propertyPeaks.estimatedDemandChargeTotal,
                          propertyPeaks.currency ?? "SEK",
                        )}
                  </strong>
                  <p>
                    Sum of the separately calculated inlet charges. Peak demand
                    is never merged across the two meters.
                  </p>
                  <small>
                    {propertyPeaks.connections.length} independent billing scopes
                  </small>
                </article>

                <div className="peak-grid connection-peak-grid">
                  {propertyPeaks.connections.map((connection) => (
                    <article
                      className="peak-card"
                      key={connection.gridConnectionId}
                    >
                      <span className="label">{connection.name}</span>
                      <strong>
                        {connection.estimatedDemandCharge === null
                          ? connection.status === "no_data"
                            ? "NO DATA"
                            : "PARTIAL"
                          : money(
                              connection.estimatedDemandCharge,
                              connection.currency,
                            )}
                      </strong>
                      <p>
                        {connection.trackedAveragePeakKw === null
                          ? "No tracked peak average yet."
                          : `${number(
                              connection.trackedAveragePeakKw,
                              2,
                            )} kW tracked top-3 average`}
                      </p>
                      <small>
                        {connection.thresholdKw === null
                          ? `${connection.peakDays.length}/${connection.requiredPeakDays} peak days`
                          : `Threshold ${number(
                              connection.thresholdKw,
                              2,
                            )} kW`}
                        {" · "}
                        {number(connection.demandRatePerKwMonth, 0)} SEK/kW
                      </small>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        ) : null}

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
