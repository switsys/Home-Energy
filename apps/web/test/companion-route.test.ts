import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/companion/[...path]/route";

const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
const request = (path: string, method = "GET", secret?: string, body?: string) =>
  new NextRequest("https://energy.li-erikes.se/api/companion/" + path, {
    method,
    headers: {
      ...(secret ? { "x-home-energy-bridge-key": secret } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body } : {}),
  });

afterEach(() => vi.unstubAllGlobals());

describe("HTTPS Google Home companion relay", () => {
  it("does not permit unknown paths or unauthenticated calls", async () => {
    const outgoing = vi.fn();
    vi.stubGlobal("fetch", outgoing);
    expect((await GET(request("status"), context(["status"]))).status).toBe(404);
    expect((await GET(request("commands/claim?scopeId=a"),
      context(["commands", "claim"]))).status).toBe(401);
    expect(outgoing).not.toHaveBeenCalled();
  });

  it("forwards only the scoped claim to the private configured backend", async () => {
    const outgoing = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ command: null }), {
        status: 200, headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", outgoing);
    const result = await GET(
      request("commands/claim?scopeId=structure-1", "GET", "bridge-secret"),
      context(["commands", "claim"]),
    );
    expect(result.status).toBe(200);
    expect(outgoing).toHaveBeenCalledOnce();
    const [destination, options] = outgoing.mock.calls[0];
    expect(destination).toMatch(/\/api\/bridge\/commands\/claim\?scopeId=structure-1$/);
    expect(options.headers["x-home-energy-bridge-key"]).toBe("bridge-secret");
    expect(options.redirect).toBe("manual");
    expect(options.cache).toBe("no-store");
  });

  it("rejects oversized sync payloads and invalid command IDs", async () => {
    const outgoing = vi.fn();
    vi.stubGlobal("fetch", outgoing);
    const json = JSON.stringify({ scopeId: "s", devices: ["x".repeat(300_000)] });
    const big = await POST(request("devices/sync", "POST", "test-secret", json),
      context(["devices", "sync"]));
    expect(big.status).toBe(413);
    const ack = await POST(request("commands/not-a-uuid/ack", "POST", "test-secret", "{}"),
      context(["commands", "not-a-uuid", "ack"]));
    expect(ack.status).toBe(404);
    expect(outgoing).not.toHaveBeenCalled();
  });
});
