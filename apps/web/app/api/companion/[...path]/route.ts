import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const DEVICE_ID = /^[a-zA-Z0-9_.:/-]{1,180}$/;
const COMMAND_ID = /^[0-9a-f-]{36}$/i;
const MAX_BODY_BYTES = 256 * 1024;

// Only the three companion operations are public. Authentication and
// structure-scoped authorization are enforced again by the backend.
function destination(method: string, parts: string[], request: NextRequest): string | null {
  if (method === "POST" && parts.length === 2 &&
      parts[0] === "devices" && parts[1] === "sync") {
    return "/api/bridge/devices/sync";
  }
  if (method === "GET" && parts.length === 2 &&
      parts[0] === "commands" && parts[1] === "claim") {
    const scope = request.nextUrl.searchParams.get("scopeId");
    if (!scope || !DEVICE_ID.test(scope)) return null;
    return "/api/bridge/commands/claim?scopeId=" + encodeURIComponent(scope);
  }
  if (method === "POST" && parts.length === 3 &&
      parts[0] === "commands" && COMMAND_ID.test(parts[1] ?? "") &&
      parts[2] === "ack") {
    return "/api/bridge/commands/" + parts[1] + "/ack";
  }
  return null;
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const method = request.method.toUpperCase();
  const target = destination(method, path, request);
  if (!target) return NextResponse.json({ error: "unsupported_bridge_route" }, { status: 404 });

  const secret = request.headers.get("x-home-energy-bridge-key");
  if (!secret || secret.length > 256) {
    return NextResponse.json({ error: "bridge_unauthorized" }, { status: 401 });
  }

  let body: string | undefined;
  if (method === "POST") {
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return NextResponse.json({ error: "json_required" }, { status: 415 });
    }
    const size = Number(request.headers.get("content-length") ?? 0);
    if (size > MAX_BODY_BYTES) return NextResponse.json(
      { error: "payload_too_large" }, { status: 413 },
    );
    body = await request.text();
    if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
  }

  // Backend address is server-controlled; the device never supplies an upstream URL.
  const base = process.env.HOME_ENERGY_API_URL?.trim() || "http://127.0.0.1:3002";
  try {
    const upstream = await fetch(base + target, {
      method,
      body,
      headers: {
        "x-home-energy-bridge-key": secret,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      return NextResponse.json({ error: "unexpected_upstream_redirect" }, { status: 502 });
    }
    const result = await upstream.json();
    return NextResponse.json(result, {
      status: upstream.status,
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  } catch {
    return NextResponse.json({ error: "bridge_upstream_unavailable" }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
