"use client";

import { useMemo, useRef, useState } from "react";

type PriceSlot = Readonly<{
  startsAt: string;
  total: number;
  currency: string;
  level: string | null;
}>;

type PeakRiskSlot = Readonly<{
  startsAt: string;
  demandRatePerKwMonth: number;
}>;

type InteractivePriceCurveProps = Readonly<{
  slots: readonly PriceSlot[];
  currentStartsAt: string | null;
  currentPrice: PriceSlot | null;
  priceAreaCode: string | null;
  peakRiskSlots: readonly PeakRiskSlot[];
  gridScheduleAvailable: boolean;
  gridConnectionName: string | null;
  loadMinutes: number;
  loadPowerKw: number;
}>;

const STOCKHOLM = "Europe/Stockholm";

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
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

function priceLevelClass(level: string | null): string {
  switch (level) {
    case "VERY_CHEAP":
      return "very-cheap";
    case "CHEAP":
      return "cheap";
    case "EXPENSIVE":
      return "expensive";
    case "VERY_EXPENSIVE":
      return "very-expensive";
    default:
      return "normal";
  }
}

type WindowEstimate = Readonly<{
  startsAt: string;
  averagePrice: number;
  electricityCost: number;
  energyKwh: number;
  currency: string;
}>;

function signedPriceDifference(
  difference: number,
  currency: string,
  baselineLabel: string,
): string {
  if (Math.abs(difference) < 0.005) return `Same as ${baselineLabel}`;
  const direction = difference < 0 ? "below" : "above";
  return `${money(Math.abs(difference), currency)}/kWh ${direction} ${baselineLabel}`;
}

function estimateLoadWindow(
  values: readonly PriceSlot[],
  startIndex: number,
  minutes: number,
  powerKw: number,
): WindowEstimate | null {
  if (
    startIndex < 0 ||
    startIndex >= values.length ||
    !Number.isFinite(powerKw) ||
    powerKw <= 0 ||
    !Number.isFinite(minutes) ||
    minutes <= 0
  ) {
    return null;
  }

  const first = values[startIndex];
  if (first === undefined) return null;

  const slotMs = 15 * 60 * 1000;
  let expectedStartsAtMs = Date.parse(first.startsAt);
  if (!Number.isFinite(expectedStartsAtMs)) return null;

  let remainingMinutes = minutes;
  let electricityCost = 0;
  let weightedPriceMinutes = 0;
  let energyKwh = 0;

  for (let index = startIndex; remainingMinutes > 0; index += 1) {
    const slot = values[index];
    if (slot === undefined || slot.currency !== first.currency) return null;

    const startsAtMs = Date.parse(slot.startsAt);
    if (
      !Number.isFinite(startsAtMs) ||
      Math.abs(startsAtMs - expectedStartsAtMs) > 1000
    ) {
      return null;
    }

    const durationMinutes = Math.min(15, remainingMinutes);
    const slotEnergyKwh = powerKw * (durationMinutes / 60);
    electricityCost += slot.total * slotEnergyKwh;
    weightedPriceMinutes += slot.total * durationMinutes;
    energyKwh += slotEnergyKwh;
    remainingMinutes -= durationMinutes;
    expectedStartsAtMs += slotMs;
  }

  return {
    startsAt: first.startsAt,
    averagePrice: weightedPriceMinutes / minutes,
    electricityCost,
    energyKwh,
    currency: first.currency,
  };
}

function buildCurve(
  slots: readonly PriceSlot[],
  currentStartsAt: string | null,
) {
  const values = slots
    .filter(
      (slot) =>
        Number.isFinite(slot.total) &&
        Number.isFinite(Date.parse(slot.startsAt)),
    )
    .sort(
      (left, right) =>
        Date.parse(left.startsAt) - Date.parse(right.startsAt),
    );

  if (values.length === 0) return null;

  const width = 1000;
  const height = 250;
  const left = 20;
  const right = 20;
  const top = 20;
  const bottom = 32;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const rawMin = Math.min(...values.map((slot) => slot.total));
  const rawMax = Math.max(...values.map((slot) => slot.total));
  const domainMin = Math.min(0, rawMin);
  const domainMax = Math.max(0, rawMax);
  const domainRange = Math.max(0.01, domainMax - domainMin);
  const average =
    values.reduce((sum, slot) => sum + slot.total, 0) / values.length;
  const slotMs = 15 * 60 * 1000;
  const firstStartsAtMs = Date.parse(values[0]!.startsAt);
  const lastStartsAtMs = Date.parse(values[values.length - 1]!.startsAt);
  const domainStartMs = firstStartsAtMs;
  const domainEndMs = lastStartsAtMs + slotMs;
  const domainDurationMs = Math.max(slotMs, domainEndMs - domainStartMs);

  const xForTime = (startsAtMs: number) =>
    left +
    ((startsAtMs - domainStartMs) / domainDurationMs) * plotWidth;
  const yFor = (price: number) =>
    top + ((domainMax - price) / domainRange) * plotHeight;
  const baselineY = yFor(0);
  const points = values
    .map(
      (slot) =>
        `${xForTime(Date.parse(slot.startsAt))},${yFor(slot.total)}`,
    )
    .join(" ");
  const area = [
    `M ${xForTime(firstStartsAtMs)} ${baselineY}`,
    ...values.map(
      (slot) =>
        `L ${xForTime(Date.parse(slot.startsAt))} ${yFor(slot.total)}`,
    ),
    `L ${xForTime(domainEndMs)} ${baselineY}`,
    "Z",
  ].join(" ");
  const currentStartsAtMs =
    currentStartsAt === null ? Number.NaN : Date.parse(currentStartsAt);
  const currentIndex = Number.isFinite(currentStartsAtMs)
    ? values.findIndex(
        (slot) => Date.parse(slot.startsAt) === currentStartsAtMs,
      )
    : -1;
  const tickHours = ["00", "06", "12", "18"] as const;
  const timeTicks: Array<{ label: string; x: number }> =
    tickHours.flatMap((label) => {
      const slot = values.find(
        (value) => formatTime(value.startsAt) === `${label}:00`,
      );
      return slot
        ? [{ label, x: xForTime(Date.parse(slot.startsAt)) }]
        : [];
    });

  if (formatTime(values[values.length - 1]!.startsAt) === "23:45") {
    timeTicks.push({ label: "24", x: xForTime(domainEndMs) });
  }

  return {
    width,
    height,
    left,
    right,
    top,
    bottom,
    plotWidth,
    plotHeight,
    values,
    rawMin,
    rawMax,
    average,
    xForTime,
    yFor,
    baselineY,
    points,
    area,
    currentIndex,
    domainStartMs,
    domainEndMs,
    domainDurationMs,
    slotMs,
    timeTicks,
  };
}

export function InteractivePriceCurve({
  slots,
  currentStartsAt,
  currentPrice,
  priceAreaCode,
  peakRiskSlots,
  gridScheduleAvailable,
  gridConnectionName,
  loadMinutes,
  loadPowerKw,
}: InteractivePriceCurveProps) {
  const curve = useMemo(
    () => buildCurve(slots, currentStartsAt),
    [slots, currentStartsAt],
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    curve && curve.currentIndex >= 0 ? curve.currentIndex : null,
  );
  const activePointer = useRef<number | null>(null);

  if (curve === null) return null;
  const activeCurve = curve;

  const selected =
    selectedIndex === null ? null : activeCurve.values[selectedIndex] ?? null;
  const selectedStartsAtMs =
    selected === null ? null : Date.parse(selected.startsAt);
  const selectedX =
    selectedStartsAtMs === null
      ? null
      : activeCurve.xForTime(selectedStartsAtMs);
  const selectedPeak =
    selectedStartsAtMs === null
      ? null
      : peakRiskSlots.find(
          (slot) => Date.parse(slot.startsAt) === selectedStartsAtMs,
        ) ?? null;
  const selectedIsElapsed =
    selectedIndex !== null &&
    activeCurve.currentIndex >= 0 &&
    selectedIndex <= activeCurve.currentIndex;
  const selectedEstimate =
    selectedIndex === null || selectedIsElapsed
      ? null
      : estimateLoadWindow(
          activeCurve.values,
          selectedIndex,
          loadMinutes,
          loadPowerKw,
        );
  const firstAvailableIndex =
    activeCurve.currentIndex >= 0 ? activeCurve.currentIndex + 1 : 0;
  const bestEstimate = activeCurve.values.reduce<WindowEstimate | null>(
    (best, _slot, index) => {
      if (index < firstAvailableIndex) return best;
      const estimate = estimateLoadWindow(
        activeCurve.values,
        index,
        loadMinutes,
        loadPowerKw,
      );
      if (estimate === null) return best;
      return best === null || estimate.electricityCost < best.electricityCost
        ? estimate
        : best;
    },
    null,
  );
  const versusAverage =
    selected === null ? null : selected.total - activeCurve.average;
  const versusNow =
    selected === null ||
    currentPrice === null ||
    selected.currency !== currentPrice.currency
      ? null
      : selected.total - currentPrice.total;
  const averagePercent =
    selected !== null && activeCurve.average > 0.01
      ? ((selected.total - activeCurve.average) / activeCurve.average) * 100
      : null;
  const selectedSavings =
    selectedEstimate !== null &&
    bestEstimate !== null &&
    selectedEstimate.currency === bestEstimate.currency
      ? selectedEstimate.electricityCost - bestEstimate.electricityCost
      : null;

  function selectFromClientX(clientX: number, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0) return;
    const normalized = Math.min(
      1,
      Math.max(0, (clientX - rect.left) / rect.width),
    );
    const chartX = normalized * activeCurve.width;
    const plotRatio = Math.min(
      1,
      Math.max(0, (chartX - activeCurve.left) / activeCurve.plotWidth),
    );
    const targetMs =
      activeCurve.domainStartMs + plotRatio * activeCurve.domainDurationMs;

    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    activeCurve.values.forEach((slot, index) => {
      const slotMs = Date.parse(slot.startsAt);
      const distance = Math.abs(slotMs - targetMs);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    setSelectedIndex(bestIndex);
  }

  function moveSelection(delta: number) {
    setSelectedIndex((current) => {
      const base =
        current ?? (activeCurve.currentIndex >= 0 ? activeCurve.currentIndex : 0);
      return Math.min(
        activeCurve.values.length - 1,
        Math.max(0, base + delta),
      );
    });
  }

  return (
    <section className="section price-curve-section">
      <div className="section-heading price-curve-heading">
        <div>
          <span className="kicker">TODAY&apos;S PRICE CURVE</span>
          <h2>Quarter-hour electricity price</h2>
        </div>
        <small>
          {priceAreaCode ? `${priceAreaCode} · ` : ""}
          15 min · {activeCurve.values.length} slots
        </small>
      </div>

      <article className="price-curve-card">
        <div className="price-curve-stats">
          <div>
            <span className="label">NOW</span>
            <strong>
              {currentPrice
                ? money(currentPrice.total, currentPrice.currency)
                : "—"}
            </strong>
          </div>
          <div>
            <span className="label">LOW</span>
            <strong>
              {money(activeCurve.rawMin, activeCurve.values[0]?.currency ?? "SEK")}
            </strong>
          </div>
          <div>
            <span className="label">AVERAGE</span>
            <strong>
              {money(activeCurve.average, activeCurve.values[0]?.currency ?? "SEK")}
            </strong>
          </div>
          <div>
            <span className="label">HIGH</span>
            <strong>
              {money(activeCurve.rawMax, activeCurve.values[0]?.currency ?? "SEK")}
            </strong>
          </div>
        </div>

        <div
          aria-label="Interactive quarter-hour electricity price curve. Drag across the chart or use left and right arrow keys to inspect prices."
          className="price-chart-interactive"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              moveSelection(-1);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              moveSelection(1);
            }
          }}
          onPointerCancel={(event) => {
            if (activePointer.current === event.pointerId) {
              activePointer.current = null;
            }
          }}
          onPointerDown={(event) => {
            activePointer.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            selectFromClientX(event.clientX, event.currentTarget);
          }}
          onPointerMove={(event) => {
            if (
              event.pointerType === "mouse" ||
              activePointer.current === event.pointerId
            ) {
              selectFromClientX(event.clientX, event.currentTarget);
            }
          }}
          onPointerUp={(event) => {
            if (activePointer.current === event.pointerId) {
              activePointer.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }
          }}
          role="group"
          tabIndex={0}
        >
          {selected && selectedX !== null ? (
            <div
              aria-live="polite"
              className="price-chart-readout"
              style={{
                left: `${Math.min(92, Math.max(8, (selectedX / activeCurve.width) * 100))}%`,
              }}
            >
              <span>{formatTime(selected.startsAt)}</span>
              <strong>{money(selected.total, selected.currency)}</strong>
              <small>
                {selected.level
                  ? selected.level.replaceAll("_", " ").toLowerCase()
                  : "price slot"}
                {selectedPeak
                  ? ` · effect charge ${selectedPeak.demandRatePerKwMonth} SEK/kW/month`
                  : gridScheduleAvailable
                    ? " · no effect charge"
                    : ""}
              </small>
            </div>
          ) : null}

          <div className="price-chart-wrap">
            <svg
              aria-hidden="true"
              className="price-chart"
              preserveAspectRatio="none"
              viewBox={`0 0 ${activeCurve.width} ${activeCurve.height}`}
            >
              <defs>
                <linearGradient
                  id="priceArea"
                  x1="0"
                  x2="0"
                  y1="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="currentColor"
                    stopOpacity="0.28"
                  />
                  <stop
                    offset="100%"
                    stopColor="currentColor"
                    stopOpacity="0.015"
                  />
                </linearGradient>
                <linearGradient
                  id="priceLine"
                  x1="0"
                  x2="1"
                  y1="0"
                  y2="0"
                >
                  <stop offset="0%" stopColor="var(--green)" />
                  <stop offset="58%" stopColor="var(--green)" />
                  <stop offset="78%" stopColor="var(--amber)" />
                  <stop offset="100%" stopColor="var(--red)" />
                </linearGradient>
              </defs>

              {peakRiskSlots.map((slot) => {
                const startsAtMs = Date.parse(slot.startsAt);
                if (!Number.isFinite(startsAtMs)) return null;
                const x = activeCurve.xForTime(startsAtMs);
                const endX = activeCurve.xForTime(
                  Math.min(
                    startsAtMs + activeCurve.slotMs,
                    activeCurve.domainEndMs,
                  ),
                );
                return (
                  <rect
                    className="price-peak-band"
                    height={activeCurve.plotHeight}
                    key={slot.startsAt}
                    width={Math.max(1, endX - x)}
                    x={x}
                    y={activeCurve.top}
                  />
                );
              })}

              {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
                const y = activeCurve.top + activeCurve.plotHeight * fraction;
                return (
                  <line
                    className="price-grid-line"
                    key={fraction}
                    x1={activeCurve.left}
                    x2={activeCurve.width - activeCurve.right}
                    y1={y}
                    y2={y}
                  />
                );
              })}

              <line
                className="price-average-line"
                x1={activeCurve.left}
                x2={activeCurve.width - activeCurve.right}
                y1={activeCurve.yFor(activeCurve.average)}
                y2={activeCurve.yFor(activeCurve.average)}
              />

              <line
                className="price-zero-line"
                x1={activeCurve.left}
                x2={activeCurve.width - activeCurve.right}
                y1={activeCurve.baselineY}
                y2={activeCurve.baselineY}
              />

              <path
                className="price-area"
                d={activeCurve.area}
                fill="url(#priceArea)"
              />

              {activeCurve.values.map((slot, index) => {
                const startsAtMs = Date.parse(slot.startsAt);
                const x = activeCurve.xForTime(startsAtMs);
                const y = activeCurve.yFor(slot.total);
                const barEndMs = Math.min(
                  startsAtMs + activeCurve.slotMs,
                  activeCurve.domainEndMs,
                );
                const barWidth = Math.max(
                  2,
                  activeCurve.xForTime(barEndMs) - x - 1,
                );
                const barY = Math.min(y, activeCurve.baselineY);
                const barHeight = Math.max(
                  1,
                  Math.abs(activeCurve.baselineY - y),
                );

                return (
                  <rect
                    className={`price-slot-bar price-slot-${priceLevelClass(
                      slot.level,
                    )}${
                      index === activeCurve.currentIndex
                        ? " price-slot-current"
                        : ""
                    }${
                      index === selectedIndex
                        ? " price-slot-selected"
                        : ""
                    }`}
                    height={barHeight}
                    key={slot.startsAt}
                    width={barWidth}
                    x={x}
                    y={barY}
                  />
                );
              })}

              <polyline
                className="price-line"
                fill="none"
                points={activeCurve.points}
                stroke="url(#priceLine)"
              />

              {activeCurve.currentIndex >= 0 ? (
                <>
                  <line
                    className="price-now-line"
                    x1={activeCurve.xForTime(
                      Date.parse(
                        activeCurve.values[activeCurve.currentIndex]!.startsAt,
                      ),
                    )}
                    x2={activeCurve.xForTime(
                      Date.parse(
                        activeCurve.values[activeCurve.currentIndex]!.startsAt,
                      ),
                    )}
                    y1={activeCurve.top}
                    y2={activeCurve.height - activeCurve.bottom}
                  />
                  <circle
                    className="price-now-dot"
                    cx={activeCurve.xForTime(
                      Date.parse(
                        activeCurve.values[activeCurve.currentIndex]!.startsAt,
                      ),
                    )}
                    cy={activeCurve.yFor(
                      activeCurve.values[activeCurve.currentIndex]?.total ?? 0,
                    )}
                    r="6"
                  />
                </>
              ) : null}

              {selected && selectedX !== null ? (
                <>
                  <line
                    className="price-selected-line"
                    x1={selectedX}
                    x2={selectedX}
                    y1={activeCurve.top}
                    y2={activeCurve.height - activeCurve.bottom}
                  />
                  <circle
                    className="price-selected-dot"
                    cx={selectedX}
                    cy={activeCurve.yFor(selected.total)}
                    r="7"
                  />
                </>
              ) : null}

              {activeCurve.timeTicks.map((tick, index) => (
                <text
                  className="price-axis-label"
                  key={tick.label}
                  textAnchor={
                    index === 0
                      ? "start"
                      : index === activeCurve.timeTicks.length - 1
                        ? "end"
                        : "middle"
                  }
                  x={tick.x}
                  y={activeCurve.height - 8}
                >
                  {tick.label}
                </text>
              ))}
            </svg>
          </div>
        </div>

        {selected ? (
          <div className="energy-lens" aria-live="polite">
            <div className="energy-lens-heading">
              <div>
                <span className="label">ENERGY LENS</span>
                <strong>{formatTime(selected.startsAt)}</strong>
              </div>
              <small>
                {gridConnectionName ?? "Primary price connection"}
              </small>
            </div>

            <div className="energy-lens-grid">
              <div>
                <span>VS DAILY AVERAGE</span>
                <strong>
                  {versusAverage === null
                    ? "—"
                    : signedPriceDifference(
                        versusAverage,
                        selected.currency,
                        "today's average",
                      )}
                </strong>
                <small>
                  {averagePercent === null
                    ? "Absolute comparison"
                    : `${Math.abs(averagePercent).toFixed(0)}% ${
                        averagePercent < 0 ? "cheaper" : "more expensive"
                      }`}
                </small>
              </div>

              <div>
                <span>VS NOW</span>
                <strong>
                  {versusNow === null
                    ? "—"
                    : signedPriceDifference(
                        versusNow,
                        selected.currency,
                        "now",
                      )}
                </strong>
                <small>
                  {currentPrice
                    ? `Now ${money(currentPrice.total, currentPrice.currency)}/kWh`
                    : "Current price unavailable"}
                </small>
              </div>

              <div>
                <span>PEAK RISK</span>
                <strong>
                  {selectedPeak
                    ? `ACTIVE · ${selectedPeak.demandRatePerKwMonth} SEK/kW/month`
                    : gridScheduleAvailable
                      ? "INACTIVE"
                      : "UNKNOWN"}
                </strong>
                <small>
                  {selectedPeak
                    ? "Effect-charge window"
                    : gridScheduleAvailable
                      ? "No effect-charge window at this time"
                      : "Grid tariff schedule unavailable"}
                </small>
              </div>

              <div>
                <span>SELECTED LOAD</span>
                <strong>
                  {selectedEstimate
                    ? money(
                        selectedEstimate.electricityCost,
                        selectedEstimate.currency,
                      )
                    : "—"}
                </strong>
                <small>
                  {selectedIsElapsed
                    ? "Select a future slot for a complete load estimate"
                    : selectedEstimate
                      ? `${loadPowerKw.toFixed(1)} kW × ${loadMinutes} min · electricity price only`
                      : `Not enough remaining slots for ${loadMinutes} min`}
                </small>
              </div>
            </div>

            {selectedEstimate && bestEstimate ? (
              <div className="energy-lens-advice">
                {selectedIsElapsed ? (
                  <>
                    <span>CURRENT / ELAPSED SLOT</span>
                    <strong>
                      Best complete future start {formatTime(bestEstimate.startsAt)}
                    </strong>
                    <small>
                      This tariff interval has already started, so it is excluded
                      from complete future-window estimates.
                    </small>
                  </>
                ) : selectedSavings !== null && selectedSavings > 0.005 ? (
                  <>
                    <span>BETTER WINDOW</span>
                    <strong>
                      {formatTime(bestEstimate.startsAt)} · save{" "}
                      {money(selectedSavings, selectedEstimate.currency)}
                    </strong>
                    <small>
                      Same {loadPowerKw.toFixed(1)} kW × {loadMinutes} min load,
                      electricity price only.
                    </small>
                  </>
                ) : (
                  <>
                    <span>WINDOW CHECK</span>
                    <strong>Best available future start for this load</strong>
                    <small>
                      No cheaper complete {loadMinutes}-minute window remains in
                      today&apos;s price schedule.
                    </small>
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="price-curve-legend">
          <span><i className="price-dot cheap" /> cheaper</span>
          <span><i className="price-dot normal" /> normal</span>
          <span><i className="price-dot expensive" /> expensive</span>
          {peakRiskSlots.length > 0 ? (
            <span>
              <i className="price-dot peak-risk" />
              effect-charge window
            </span>
          ) : gridScheduleAvailable ? (
            <span className="price-peak-inactive">
              effect charge inactive today
            </span>
          ) : null}
          <span className="price-average-note">
            drag or tap to inspect · dashed = daily average
          </span>
        </div>
      </article>
    </section>
  );
}
