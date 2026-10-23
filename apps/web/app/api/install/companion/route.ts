import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_LIFETIME_SECONDS = 48 * 60 * 60;
const INSTALL_FILENAME = "Home-Energy-Companion-0.1.0-debug.apk";

function authorized(request: NextRequest): boolean {
  const key = process.env.HOME_ENERGY_APK_DOWNLOAD_SECRET;
  if (!key || key.length < 40) return false;

  const expires = request.nextUrl.searchParams.get("expires") ?? "";
  const signature = request.nextUrl.searchParams.get("sig") ?? "";
  if (!/^\d{10}$/.test(expires) || !/^[a-f0-9]{64}$/.test(signature))
    return false;

  const validUntil = Number(expires);
  const now = Math.floor(Date.now() / 1000);
  if (validUntil < now || validUntil > now + MAX_LIFETIME_SECONDS) return false;

  const expected = createHmac("sha256", key)
    .update(`home-energy-companion-apk-v1:${expires}`)
    .digest();
  return timingSafeEqual(Buffer.from(signature, "hex"), expected);
}

async function serve(request: NextRequest, headersOnly: boolean): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ error: "invalid_or_expired_download_link" }, {
      status: 403,
      headers: { "cache-control": "no-store" },
    });
  }

  // Path is administrator configured. Never accept paths or filenames from the URL.
  const apkPath = process.env.HOME_ENERGY_COMPANION_APK_FILE;
  if (!apkPath?.startsWith("/")) {
    return Response.json({ error: "apk_not_configured" }, { status: 503 });
  }

  let fileSize: number;
  try {
    const data = await stat(apkPath);
    if (!data.isFile() || data.size < 1 || data.size > 100 * 1024 * 1024) {
      return Response.json({ error: "apk_unavailable" }, { status: 503 });
    }
    fileSize = data.size;
  } catch {
    return Response.json({ error: "apk_unavailable" }, { status: 503 });
  }

  const headers: Record<string, string> = {
    "content-type": "application/vnd.android.package-archive",
    "content-disposition": `attachment; filename="${INSTALL_FILENAME}"`,
    "content-length": String(fileSize),
    "cache-control": "private, no-store, max-age=0",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
  if (headersOnly) return new Response(null, { status: 200, headers });

  const stream = Readable.toWeb(createReadStream(apkPath));
  return new Response(stream as ReadableStream<Uint8Array>, { status: 200, headers });
}

export async function GET(request: NextRequest) {
  return serve(request, false);
}

export async function HEAD(request: NextRequest) {
  return serve(request, true);
}
