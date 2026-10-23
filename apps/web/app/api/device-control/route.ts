import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const paths = {
  manual: (id: string) => `/api/home/devices/${encodeURIComponent(id)}/commands`,
  configure: (id: string) => `/api/home/devices/${encodeURIComponent(id)}/config`,
  preview: () => "/api/energy/automation/preview",
  approve: () => "/api/energy/automation/approve",
  cancel: () => "/api/energy/automation/cancel",
} as const;

export async function POST(request: NextRequest) {
  // This route only proxies JSON; a *separate*, explicitly entered control key
  // is required by the backend to perform any physical action.
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== request.headers.get("host")) {
        return NextResponse.json({ error: "cross_origin_denied" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
    }
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "json_required" }, { status: 415 });
  }

  const apiKey = process.env.HOME_ENERGY_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "api_not_configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const action = body.action;
  if (typeof action !== "string" || !(action in paths)) {
    return NextResponse.json({ error: "unsupported_action" }, { status: 400 });
  }
  const type = action as keyof typeof paths;
  const id = typeof body.deviceId === "string" ? body.deviceId : "";
  if ((type === "manual" || type === "configure") && !id) {
    return NextResponse.json({ error: "device_id_required" }, { status: 400 });
  }
  const path = paths[type](id);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-home-energy-key": apiKey,
  };
  if (typeof body.controlKey === "string" && body.controlKey.length <= 256) {
    headers["x-home-energy-control-key"] = body.controlKey;
  }
  const payload =
    type === "manual" ? { trait: "on-off", command: body.command, confirmed: true } :
    type === "configure" ? {
      gridConnectionId: body.gridConnectionId,
      nominalPowerKw: body.nominalPowerKw, confirmed: true,
    } :
    type === "preview" ? { deviceId: body.deviceId, minutes: body.minutes } :
    type === "approve" ? { deviceId: body.deviceId, minutes: body.minutes, confirmed: true } :
    { automationId: body.automationId, confirmed: true };

  try {
    const base = process.env.HOME_ENERGY_API_URL?.trim() || "http://127.0.0.1:3002";
    const response = await fetch(base + path, {
      method: type === "configure" ? "PATCH" : "POST",
      headers, body: JSON.stringify(payload), cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json() as unknown;
    return NextResponse.json(result, {
      status: response.status,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "device_api_unavailable" }, { status: 502 });
  }
}
