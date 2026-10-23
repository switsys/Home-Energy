import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  EnergyDevice, HomeDevice, HomeDeviceCommand,
  HomeDeviceCommandResult, HomeDeviceGateway, HomeDeviceState,
} from "@home-energy/core";

const MAX_DEVICES = 150;
const HEARTBEAT_MS = 120_000;
const DISPATCH_GRACE_MS = 5 * 60_000;
const LEASE_MS = 90_000;
const SAFE_ID = /^[a-zA-Z0-9_.:/-]{1,180}$/;
const CONTROL_TRAIT = "on-off";

export type BridgeDevice = HomeDevice & {
  scopeId: string;
  gridConnectionId: string | null;
  nominalPowerKw: number | null;
  lastSeenAt: string;
  state: HomeDeviceState | null;
};

export type BridgeCommand = {
  id: string;
  deviceId: string;
  trait: "on-off";
  command: "on" | "off";
  dueAt: string;
  expiresAt: string;
  status: "queued" | "leased" | "succeeded" | "failed" | "expired" | "cancelled";
  dependsOn: string | null;
  leasedAt: string | null;
  completedAt: string | null;
  message: string | null;
  automationId: string | null;
};

type Stored = { devices: BridgeDevice[]; commands: BridgeCommand[] };
const empty = (): Stored => ({ devices: [], commands: [] });

function legalId(id: unknown): id is string {
  return typeof id === "string" && SAFE_ID.test(id);
}

function hasOnOff(device: BridgeDevice): boolean {
  // Never remotely toggle security or access controls via generic OnOff.
  return device.traits.includes(CONTROL_TRAIT) &&
    !/lock|garage|door|camera|alarm|security|smoke|valve/i.test(device.type);
}

function validString(v: unknown, max = 120): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= max;
}

export class DeviceBridge implements HomeDeviceGateway {
  readonly id = "google-home-companion";
  private data: Stored;
  constructor(
    private readonly path: string | null,
    private readonly clock: () => Date = () => new Date(),
  ) {
    if (path === null) {
      this.data = empty();
    } else {
      try {
        const restored = JSON.parse(readFileSync(path, "utf8")) as Stored;
        this.data = Array.isArray(restored.devices) &&
          Array.isArray(restored.commands) ? restored : empty();
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        this.data = empty();
      }
    }
  }

  private persist() {
    if (this.path === null) return;
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data), { mode: 0o600 });
    renameSync(tmp, this.path);
  }
  private now() { return this.clock().getTime(); }
  private online(device: BridgeDevice) {
    return device.online !== false &&
      this.now() - Date.parse(device.lastSeenAt) < HEARTBEAT_MS;
  }

  /** Each structure is a separate permission boundary; syncing one never removes another. */
  sync(scopeId: string, incoming: readonly unknown[]) {
    if (!legalId(scopeId) || !Array.isArray(incoming) ||
        incoming.length > MAX_DEVICES) throw new Error("invalid_bridge_snapshot");
    const now = this.clock().toISOString();
    const previous = new Map(this.data.devices.map(d => [d.id, d]));
    const dedup = new Set<string>();
    const normalized: BridgeDevice[] = incoming.map((raw) => {
      const d = raw as Record<string, unknown>;
      if (!d || !legalId(d.id) || !validString(d.name) ||
          !validString(d.type) || !Array.isArray(d.traits) ||
          d.traits.length > 50 || !d.traits.every(t => validString(t, 100)) ||
          (d.state !== undefined && (
            d.state === null || typeof d.state !== "object" ||
            Array.isArray(d.state) || Object.keys(d.state).length > 30
          ))) throw new Error("invalid_bridge_device");
      if (dedup.has(d.id)) throw new Error("duplicate_bridge_device");
      dedup.add(d.id);
      const existing = previous.get(d.id);
      if (existing && existing.scopeId !== scopeId)
        throw new Error("device_scope_collision");
      return {
        id: d.id,
        source: "google-home",
        name: d.name,
        room: typeof d.room === "string" ? d.room.slice(0, 120) : null,
        type: d.type,
        traits: d.traits as string[],
        scopeId,
        gridConnectionId: existing?.gridConnectionId ?? null,
        nominalPowerKw: existing?.nominalPowerKw ?? null,
        online: d.online === true,
        lastSeenAt: now,
        state: d.state === undefined ? existing?.state ?? null : {
          deviceId: d.id,
          observedAt: now,
          values: d.state as HomeDeviceState["values"],
        },
      };
    });
    this.data.devices = [
      ...this.data.devices.filter(d => d.scopeId !== scopeId),
      ...normalized,
    ];
    this.persist();
    return { scopeId, deviceCount: normalized.length };
  }

  async devices(): Promise<readonly BridgeDevice[]> {
    return this.data.devices.map(d => ({ ...d, online: this.online(d) }));
  }
  async state(id: string): Promise<HomeDeviceState | null> {
    return this.data.devices.find(d => d.id === id)?.state ?? null;
  }
  async energyDevices(propertyId: string): Promise<readonly EnergyDevice[]> {
    return this.data.devices.map(d => ({
      id: d.id,
      propertyId,
      gridConnectionId: d.gridConnectionId,
      providerScopeId: d.scopeId,
      name: d.name,
      kind: (/plug/i.test(d.type) ? "smart_plug" :
        /heater|thermostat/i.test(d.type) ? "heater" : "other") as EnergyDevice["kind"],
      controllable: this.online(d) && hasOnOff(d),
      nominalPowerKw: d.nominalPowerKw,
      powerState: d.state?.values.on === true ? "on" :
        d.state?.values.on === false ? "off" : "unknown",
    }));
  }
  // Interface alias for the existing energy automation preview.

  configure(id: string, gridConnectionId: string | null, nominalPowerKw: number | null) {
    const d = this.data.devices.find(v => v.id === id);
    if (!d) throw new Error("device_not_found");
    if (gridConnectionId !== null && !legalId(gridConnectionId))
      throw new Error("invalid_grid_connection");
    if (nominalPowerKw !== null &&
      (!Number.isFinite(nominalPowerKw) || nominalPowerKw <= 0 || nominalPowerKw > 20))
      throw new Error("invalid_nominal_power");
    d.gridConnectionId = gridConnectionId;
    d.nominalPowerKw = nominalPowerKw;
    this.persist();
    return d;
  }

  private enqueue(deviceId: string, command: "on"|"off", dueAt: Date,
                  automationId: string | null, dependsOn: string | null) {
    const device = this.data.devices.find(d => d.id === deviceId);
    if (!device) throw new Error("device_not_found");
    if (!hasOnOff(device)) throw new Error("unsupported_control");
    if (!this.online(device)) throw new Error("device_offline");
    if (!Number.isFinite(dueAt.getTime())) throw new Error("invalid_due_time");
    if (dueAt.getTime() < this.now() - 5_000 ||
        dueAt.getTime() > this.now() + 48 * 3600_000)
      throw new Error("command_time_out_of_range");
    const cmd: BridgeCommand = {
      id: randomUUID(), deviceId, trait: CONTROL_TRAIT, command,
      dueAt: dueAt.toISOString(),
      expiresAt: new Date(dueAt.getTime() + DISPATCH_GRACE_MS).toISOString(),
      status: "queued", dependsOn, leasedAt: null,
      completedAt: null, message: null, automationId,
    };
    this.data.commands.push(cmd);
    this.persist();
    return cmd;
  }

  manual(deviceId: string, command: "on"|"off") {
    if (command !== "on" && command !== "off") throw new Error("invalid_command");
    return this.enqueue(deviceId, command, this.clock(), null, null);
  }

  schedule(deviceId: string, startsAt: string, endsAt: string) {
    const start = new Date(startsAt), end = new Date(endsAt);
    if (!Number.isFinite(start.getTime()) ||
        !Number.isFinite(end.getTime()) ||
        end.getTime() <= start.getTime() ||
        end.getTime() - start.getTime() > 24 * 3600_000)
      throw new Error("invalid_automation_window");
    const automationId = randomUUID();
    const on = this.enqueue(deviceId, "on", start, automationId, null);
    try {
      const off = this.enqueue(deviceId, "off", end, automationId, on.id);
      return { id: automationId, deviceId, startsAt, endsAt,
        onCommandId: on.id, offCommandId: off.id, status: "approved" };
    } catch (e) {
      this.data.commands = this.data.commands.filter(v => v.id !== on.id);
      this.persist();
      throw e;
    }
  }

  async execute(command: HomeDeviceCommand): Promise<HomeDeviceCommandResult> {
    if (command.trait !== CONTROL_TRAIT ||
        (command.command !== "on" && command.command !== "off"))
      throw new Error("unsupported_control");
    const queued = this.manual(command.deviceId, command.command);
    return { deviceId: queued.deviceId, accepted: true, message: "queued_for_companion" };
  }

  claim(scopeId: string) {
    if (!legalId(scopeId)) throw new Error("invalid_scope");
    const now = this.now();
    let changed = false;
    for (const command of this.data.commands) {
      if (command.status === "leased" &&
          now - Date.parse(command.leasedAt ?? "") >= LEASE_MS) {
        command.status = "failed"; command.message = "ack_timeout_no_retry";
        changed = true;
      }
      if (command.status === "queued" && now >= Date.parse(command.expiresAt)) {
        command.status = "expired";
        changed = true;
      }
    }
    // Only dispatch if the companion for that structure is online.
    const candidate = this.data.commands.find(c => {
      const d = this.data.devices.find(v => v.id === c.deviceId);
      const dependent = c.dependsOn
        ? this.data.commands.find(v => v.id === c.dependsOn) : null;
      if (dependent && dependent.status !== "succeeded") {
        if (["expired", "failed", "cancelled"].includes(dependent.status)) {
          c.status = "cancelled"; changed = true;
        }
        return false;
      }
      return c.status === "queued" && d?.scopeId === scopeId &&
        this.online(d) && hasOnOff(d) &&
        now >= Date.parse(c.dueAt) && now < Date.parse(c.expiresAt);
    });
    if (candidate) {
      candidate.status = "leased";
      candidate.leasedAt = this.clock().toISOString();
      changed = true;
    }
    if (changed) this.persist();
    return candidate ? {
      id: candidate.id, deviceId: candidate.deviceId,
      trait: candidate.trait, command: candidate.command,
      expiresAt: candidate.expiresAt, automationId: candidate.automationId,
    } : null;
  }

  ack(scopeId: string, id: string, succeeded: boolean, message?: string) {
    const c = this.data.commands.find(v => v.id === id);
    const d = this.data.devices.find(v => v.id === c?.deviceId);
    if (!c || !d || d.scopeId !== scopeId || c.status !== "leased")
      throw new Error("command_not_claimed");
    c.status = succeeded ? "succeeded" : "failed";
    c.completedAt = this.clock().toISOString();
    c.message = typeof message === "string" ? message.slice(0, 180) : null;
    this.persist();
    return { id: c.id, status: c.status };
  }

  commands(deviceId?: string) {
    return this.data.commands
      .filter(c => !deviceId || c.deviceId === deviceId)
      .slice(-100);
  }
  cancel(automationId: string) {
    const all = this.data.commands.filter(c => c.automationId === automationId);
    // Never cancel the scheduled OFF after ON was already dispatched:
    // that could leave a physical heater or smart plug running indefinitely.
    if (!all.length || all.some(c => c.status !== "queued"))
      throw new Error("automation_not_cancellable");
    for (const c of all) c.status = "cancelled";
    this.persist();
    return { id: automationId, cancelled: all.length };
  }
}
