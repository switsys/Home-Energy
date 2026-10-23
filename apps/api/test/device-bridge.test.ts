import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeviceBridge } from "../src/device-bridge.js";
import { buildApp } from "../src/app.js";

const plug = {
  id: "structure-a:workshop-plug", name: "Workshop plug",
  type: "on-off-plugin-unit", traits: ["on-off"], room: "Workshop",
  online: true, state: { on: false },
};

describe("Google Home companion relay", () => {
  it("requires separate bridge and control credentials and explicit confirmation", async () => {
    let now = new Date("2026-10-23T18:30:00+02:00");
    const bridge = new DeviceBridge(null, () => now);
    const app = buildApp({
      provider: null, apiKey: "api-secret", bridgeKey: "bridge-secret",
      controlKey: "control-secret", deviceBridge: bridge, clock: () => now,
    });
    const wrong = await app.inject({
      method: "POST", url: "/api/bridge/devices/sync",
      headers: { "x-home-energy-bridge-key": "api-secret" },
      payload: { scopeId: "structure-a", devices: [plug] },
    });
    expect(wrong.statusCode).toBe(401);
    const ok = await app.inject({
      method: "POST", url: "/api/bridge/devices/sync",
      headers: { "x-home-energy-bridge-key": "bridge-secret" },
      payload: { scopeId: "structure-a", devices: [plug] },
    });
    expect(ok.statusCode).toBe(200);
    const get = await app.inject({
      method: "GET", url: "/api/home/devices",
      headers: { "x-home-energy-key": "api-secret" },
    });
    expect(get.json().devices).toMatchObject([
      { id: plug.id, scopeId: "structure-a", name: plug.name, online: true },
    ]);
    const url = "/api/home/devices/" + encodeURIComponent(plug.id) + "/commands";
    const payload = { trait: "on-off", command: "on", confirmed: true };
    const denied = await app.inject({
      method: "POST", url,
      headers: { "x-home-energy-key": "api-secret" },
      payload,
    });
    expect(denied.statusCode).toBe(403);
    const noConfirm = await app.inject({
      method: "POST", url,
      headers: { "x-home-energy-key": "api-secret",
        "x-home-energy-control-key": "control-secret" },
      payload: { trait: "on-off", command: "on" },
    });
    expect(noConfirm.statusCode).toBe(403);
    const queued = await app.inject({
      method: "POST", url,
      headers: { "x-home-energy-key": "api-secret",
        "x-home-energy-control-key": "control-secret" },
      payload,
    });
    expect(queued.statusCode).toBe(200);
    expect(queued.json().message).toBe("queued_for_companion");
    const claim = await app.inject({
      method: "GET", url: "/api/bridge/commands/claim?scopeId=structure-a",
      headers: { "x-home-energy-bridge-key": "bridge-secret" },
    });
    const commandId = claim.json().command?.id;
    expect(claim.json().command).toMatchObject({
      deviceId: plug.id, command: "on", trait: "on-off",
    });
    const duplicate = await app.inject({
      method: "GET", url: "/api/bridge/commands/claim?scopeId=structure-a",
      headers: { "x-home-energy-bridge-key": "bridge-secret" },
    });
    expect(duplicate.json().command).toBeNull();
    const spoof = await app.inject({
      method: "POST", url: "/api/bridge/commands/" + commandId + "/ack",
      headers: { "x-home-energy-bridge-key": "bridge-secret" },
      payload: { scopeId: "wrong-structure", succeeded: true },
    });
    expect(spoof.statusCode).toBe(409);
    const ack = await app.inject({
      method: "POST", url: "/api/bridge/commands/" + commandId + "/ack",
      headers: { "x-home-energy-bridge-key": "bridge-secret" },
      payload: { scopeId: "structure-a", succeeded: true },
    });
    expect(ack.json().status).toBe("succeeded");
    const replay = await app.inject({
      method: "POST", url: "/api/bridge/commands/" + commandId + "/ack",
      headers: { "x-home-energy-bridge-key": "bridge-secret" },
      payload: { scopeId: "structure-a", succeeded: true },
    });
    expect(replay.statusCode).toBe(409);
    now = new Date("2026-10-23T18:33:00+02:00");
    expect((await bridge.devices())[0]?.online).toBe(false);
    expect(() => bridge.manual(plug.id, "off")).toThrow("device_offline");
    await app.close();
  });

  it("isolates structures, preserves mapping, enforces access-control exclusions", async () => {
    const bridge = new DeviceBridge(null);
    bridge.sync("structure-a", [plug]);
    bridge.configure(plug.id, "tibber:meter-a", 1.5);
    bridge.sync("structure-b", [{
      ...plug, id: "structure-b:kitchen-light", type: "on-off-light", name: "Kitchen light",
    }]);
    bridge.sync("structure-a", [{ ...plug, name: "Renamed workshop plug" }]);
    expect((await bridge.devices())).toHaveLength(2);
    expect((await bridge.energyDevices("li-erikes")).find(d=>d.id===plug.id))
      .toMatchObject({ gridConnectionId: "tibber:meter-a", nominalPowerKw: 1.5 });
    expect(() => bridge.sync("structure-b", [plug])).toThrow("device_scope_collision");
    bridge.sync("structure-c", [{ ...plug, id:"structure-c:garage", type:"garage-door" }]);
    expect(() => bridge.manual("structure-c:garage", "on")).toThrow("unsupported_control");
    expect(() => bridge.sync("structure-a", [plug, plug])).toThrow("duplicate_bridge_device");
  });

  it("persists approved command and prevents duplicate delivery after a lost ack", () => {
    const dir = mkdtempSync(join(tmpdir(), "energy-bridge-"));
    const path = join(dir, "state.json");
    try {
      let now = new Date("2026-10-23T18:00:00Z");
      const bridge = new DeviceBridge(path, () => now);
      bridge.sync("structure-a", [plug]);
      const on = bridge.manual(plug.id, "on");
      const restored = new DeviceBridge(path, () => now);
      expect(restored.commands()).toHaveLength(1);
      expect(restored.claim("structure-a")?.id).toBe(on.id);
      now = new Date("2026-10-23T18:02:00Z");
      expect(restored.claim("structure-a")).toBeNull();
      expect(restored.commands()[0]?.status).toBe("failed");
      expect((readFileSync(path, "utf8")).includes("bridge-secret")).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("executes no timed off-command unless the scheduled on-command was acknowledged", () => {
    let now = new Date("2026-10-23T18:00:00Z");
    const bridge = new DeviceBridge(null, () => now);
    bridge.sync("structure-a", [plug]);
    const scheduled = bridge.schedule(
      plug.id, "2026-10-23T18:01:00Z", "2026-10-23T18:02:00Z",
    );
    expect(bridge.claim("structure-a")).toBeNull();
    now = new Date("2026-10-23T18:01:00Z");
    bridge.sync("structure-a", [plug]);
    expect(bridge.claim("structure-a")?.id).toBe(scheduled.onCommandId);
    expect(() => bridge.cancel(scheduled.id)).toThrow("automation_not_cancellable");
    now = new Date("2026-10-23T18:02:00Z");
    bridge.sync("structure-a", [plug]);
    expect(bridge.claim("structure-a")).toBeNull();
    bridge.ack("structure-a", scheduled.onCommandId, true);
    expect(bridge.claim("structure-a")?.id).toBe(scheduled.offCommandId);
  });
});
