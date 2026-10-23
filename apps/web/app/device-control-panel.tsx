"use client";

import { useState } from "react";

type Connection = Readonly<{ id: string; name: string }>;
type Device = Readonly<{
  id: string; scopeId: string; source: string; name: string; room?: string | null;
  type: string; traits: readonly string[]; online?: boolean | null;
  gridConnectionId: string | null; nominalPowerKw: number | null;
  state: null | { values: Record<string, unknown>; observedAt: string };
}>;
type Preview = Readonly<{
  automation: {
    deviceName: string; action: string; startsAt: string; endsAt: string;
    estimatedEnergyKwh: number; variableCost: number; currency: string;
    controlAvailable: boolean; requiresApproval: true; demandImpact: { status: string } | null;
  };
  gridConnectionId: string;
}>;
type Scheduled = Readonly<{ id: string; startsAt: string; endsAt: string }>;

async function api(body: Record<string, unknown>) {
  const response = await fetch("/api/device-control", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body), cache: "no-store",
  });
  const result = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof result.error === "string" ? result.error : "Request failed");
  }
  return result;
}
function when(s: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Stockholm",
  }).format(new Date(s));
}
function amount(v: number, currency: string) {
  return new Intl.NumberFormat("sv-SE", {
    style: "currency", currency, maximumFractionDigits: 2,
  }).format(v);
}

export function DeviceControlPanel({
  devices, connections, controlEnabled,
}: {
  devices: readonly Device[];
  connections: readonly Connection[];
  controlEnabled: boolean;
}) {
  const [controlKey, setControlKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [minutes, setMinutes] = useState(60);
  const [meter, setMeter] = useState<Record<string, string>>({});
  const [power, setPower] = useState<Record<string, string>>({});
  const [scheduled, setScheduled] = useState<Scheduled | null>(null);

  async function action(id: string, command: "on" | "off") {
    if (!controlEnabled || !controlKey) {
      setFeedback("Enter the separate device-control secret first.");
      return;
    }
    const device = devices.find(v => v.id === id);
    if (!window.confirm(`Queue ${command.toUpperCase()} for ${device?.name ?? id}? The companion will execute this physical command.`))
      return;
    setBusy(id);
    try {
      const result = await api({ action: "manual", deviceId: id, command, controlKey });
      setFeedback(result.accepted === true
        ? "Command queued. Await companion acknowledgement; refresh to confirm state."
        : "Command was not accepted.");
    } catch (e) { setFeedback(e instanceof Error ? e.message : "Command failed"); }
    finally { setBusy(null); }
  }

  async function configure(device: Device) {
    if (!controlEnabled || !controlKey) {
      setFeedback("Enter the separate device-control secret first.");
      return;
    }
    const connectionId = meter[device.id] ?? device.gridConnectionId ?? "";
    const kw = Number(power[device.id] ?? device.nominalPowerKw ?? 0);
    if (!connectionId || !Number.isFinite(kw) || kw <= 0 || kw > 20) {
      setFeedback("Select the correct meter and nominal load (0–20 kW).");
      return;
    }
    if (!window.confirm(`Map ${device.name} to this electricity meter with nominal load ${kw} kW?`))
      return;
    setBusy(device.id);
    try {
      await api({ action: "configure", deviceId: device.id,
        gridConnectionId: connectionId, nominalPowerKw: kw, controlKey });
      setFeedback("Meter and nominal power saved. Refresh to update automation eligibility.");
    } catch (e) { setFeedback(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(null); }
  }

  async function plan(device: Device) {
    setBusy(device.id); setSelected(device.id); setPreview(null); setScheduled(null);
    try {
      const result = await api({ action: "preview", deviceId: device.id, minutes });
      setPreview(result as unknown as Preview);
      setFeedback("Preview only. Nothing has been switched or scheduled.");
    } catch (e) { setFeedback(e instanceof Error ? e.message : "Preview unavailable"); }
    finally { setBusy(null); }
  }

  async function approve() {
    if (!selected || !preview || !controlKey || !controlEnabled) {
      setFeedback("A valid preview and the device-control secret are required."); return;
    }
    if (!window.confirm(`Approve switching ${preview.automation.deviceName} ON at ${when(preview.automation.startsAt)} and OFF at ${when(preview.automation.endsAt)}? Requires your Google Home companion online at both times.`))
      return;
    setBusy(selected);
    try {
      const result = await api({ action: "approve", deviceId: selected, minutes, controlKey });
      const schedule = result.schedule as Scheduled;
      setScheduled(schedule);
      setFeedback("Schedule approved and queued. Commands will only run through the connected companion.");
    } catch (e) { setFeedback(e instanceof Error ? e.message : "Approval failed"); }
    finally { setBusy(null); }
  }

  async function cancel() {
    if (!scheduled || !controlKey || !window.confirm("Cancel any unexecuted commands in this schedule?"))
      return;
    try {
      await api({ action: "cancel", automationId: scheduled.id, controlKey });
      setScheduled(null); setFeedback("Unexecuted schedule commands cancelled.");
    } catch (e) { setFeedback(e instanceof Error ? e.message : "Cancel failed"); }
  }

  return (
    <section className="section devices-section">
      <div className="section-heading">
        <div>
          <span className="kicker">SMART DEVICES · LI-ERIKES GÅRD</span>
          <h2>Control &amp; automation</h2>
        </div>
        <small>{devices.filter(d => d.online).length} online / {devices.length} discovered</small>
      </div>
      <div className="device-intro">
        <p>Google Home structures remain independent for permissions; electricity meters remain independent for grid charges. Only paired devices appear here.</p>
        <p>{devices.length === 0
          ? "No companion has shared any devices yet. Connect the Google Home Android/iOS companion to enable discovery."
          : "On/off actions require a separate control secret and an explicit confirmation. Commands are not marked completed until the companion acknowledges them."}</p>
      </div>

      {devices.length > 0 ? (
        <>
          <label className="device-secret-label" htmlFor="device-control-secret">
            Device-control secret (not your Tibber or account password)
          </label>
          <input id="device-control-secret" type="password" autoComplete="off"
            value={controlKey} placeholder={controlEnabled ? "Required for changes" : "Controls not configured"}
            disabled={!controlEnabled} onChange={e => setControlKey(e.target.value)} />
          {!controlEnabled ? <p className="device-feedback">Physical control disabled by the server configuration.</p> : null}
          <div className="device-grid">
            {devices.map(device => {
              const controllable = device.online === true &&
                device.traits.includes("on-off") &&
                !/lock|garage|door|camera|alarm|security|smoke|valve/i.test(device.type);
              const state = device.state?.values.on;
              return (
                <article className="card device-card" key={device.id}>
                  <div className="device-card-top">
                    <div>
                      <span className="label">{device.room ?? "Unassigned room"} · {device.scopeId}</span>
                      <h3>{device.name}</h3>
                    </div>
                    <span className={device.online ? "device-online" : "device-offline"}>
                      {device.online ? "Online" : "Offline"}
                    </span>
                  </div>
                  <p>{device.type} · {state === true ? "On" : state === false ? "Off" : "State unknown"}</p>
                  <div className="device-actions">
                    <button disabled={!controllable || !controlEnabled || busy !== null}
                      onClick={() => void action(device.id, "on")}>Turn on</button>
                    <button disabled={!controllable || !controlEnabled || busy !== null}
                      onClick={() => void action(device.id, "off")}>Turn off</button>
                  </div>
                  <div className="device-mapping">
                    <label>Electricity connection
                      <select value={meter[device.id] ?? device.gridConnectionId ?? ""}
                        onChange={e => setMeter(v => ({ ...v, [device.id]: e.target.value }))}>
                        <option value="">Choose a grid inlet</option>
                        {connections.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}
                      </select>
                    </label>
                    <label>Nominal power, kW
                      <input type="number" min="0.01" max="20" step="0.05"
                        value={power[device.id] ?? String(device.nominalPowerKw ?? "")}
                        onChange={e => setPower(v => ({ ...v, [device.id]: e.target.value }))} />
                    </label>
                    <button disabled={!controlEnabled || busy !== null}
                      onClick={() => void configure(device)}>Save mapping</button>
                  </div>
                  <button className="device-plan" disabled={!device.online || busy !== null}
                    onClick={() => void plan(device)}>Preview cheapest automation window</button>
                </article>
              );
            })}
          </div>
        </>
      ) : null}

      {devices.length > 0 && (
        <div className="device-automation">
          <label>Load duration
            <select value={minutes} onChange={e => {
              setMinutes(Number(e.target.value)); setPreview(null); setScheduled(null);
            }}>
              {[30, 60, 120, 180, 240].map(m =>
                <option key={m} value={m}>{m} minutes</option>)}
            </select>
          </label>
          {preview && (
            <article className="card">
              <span className="label">PREVIEW · NO DEVICE ACTION YET</span>
              <h3>{preview.automation.deviceName}</h3>
              <p>{when(preview.automation.startsAt)}–{when(preview.automation.endsAt)}</p>
              <p>{preview.automation.estimatedEnergyKwh.toFixed(2)} kWh · {amount(preview.automation.variableCost, preview.automation.currency)} estimated variable cost</p>
              <p>Peak impact: {preview.automation.demandImpact?.status ?? "unknown"}. Fixed and monthly effect fees are not included in the displayed variable price.</p>
              <button disabled={!preview.automation.controlAvailable || !controlEnabled || busy !== null}
                onClick={() => void approve()}>Approve scheduled on/off</button>
            </article>
          )}
          {scheduled && (
            <p>Schedule {scheduled.id.slice(0, 8)} approved. <button onClick={() => void cancel()}>Cancel pending commands</button></p>
          )}
        </div>
      )}
      {feedback && <p className="device-feedback" role="status">{feedback}</p>}
      <small>Safety: offline devices and access controls cannot be switched. Commands expire after five minutes, are never automatically retried, and need explicit confirmation.</small>
    </section>
  );
}
