import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET, HEAD } from "../app/api/install/companion/route";

const savedSecret = process.env.HOME_ENERGY_APK_DOWNLOAD_SECRET;
const savedFile = process.env.HOME_ENERGY_COMPANION_APK_FILE;
let temp: string | undefined;

afterEach(() => {
  if (savedSecret === undefined) delete process.env.HOME_ENERGY_APK_DOWNLOAD_SECRET;
  else process.env.HOME_ENERGY_APK_DOWNLOAD_SECRET = savedSecret;
  if (savedFile === undefined) delete process.env.HOME_ENERGY_COMPANION_APK_FILE;
  else process.env.HOME_ENERGY_COMPANION_APK_FILE = savedFile;
  if (temp) rmSync(temp, { recursive: true, force: true });
  temp = undefined;
});

const secret = "private-companion-test-secret-with-at-least-40-characters";
function url(expiry: number, valid = true) {
  const expires = String(expiry);
  const sig = valid
    ? createHmac("sha256", secret).update("home-energy-companion-apk-v1:" + expires).digest("hex")
    : "0".repeat(64);
  return new NextRequest(
    "https://energy.li-erikes.se/api/install/companion?expires=" +
    expires + "&sig=" + sig,
  );
}
function fixture() {
  temp = mkdtempSync(join(tmpdir(), "companion-download-"));
  const file = join(temp, "test.apk");
  writeFileSync(file, Buffer.from("test apk binary bytes"));
  process.env.HOME_ENERGY_COMPANION_APK_FILE = file;
  process.env.HOME_ENERGY_APK_DOWNLOAD_SECRET = secret;
}

describe("Private Home-Energy APK download", () => {
  it("rejects unconfigured, malformed, wrong and expired tokens", async () => {
    process.env.HOME_ENERGY_APK_DOWNLOAD_SECRET = "";
    expect((await GET(url(Math.floor(Date.now() / 1000) + 90))).status).toBe(403);
    fixture();
    const now = Math.floor(Date.now() / 1000);
    expect((await GET(new NextRequest("https://energy.li-erikes.se/api/install/companion"))).status)
      .toBe(403);
    expect((await GET(url(now + 30, false))).status).toBe(403);
    expect((await GET(url(now - 30))).status).toBe(403);
    expect((await GET(url(now + 72 * 3600))).status).toBe(403);
  });

  it("serves exactly the configured binary without allowing URL paths", async () => {
    fixture();
    const request = url(Math.floor(Date.now() / 1000) + 3600);
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/vnd.android.package-archive");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-disposition")).toContain("Home-Energy-Companion");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from("test apk binary bytes"));

    const head = await HEAD(request);
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe(String(Buffer.byteLength("test apk binary bytes")));
    expect(await head.text()).toBe("");
  });

  it("does not expose arbitrary disk paths or an absent APK", async () => {
    fixture();
    const request = url(Math.floor(Date.now() / 1000) + 3600);
    process.env.HOME_ENERGY_COMPANION_APK_FILE = "relative/path.apk";
    expect((await GET(request)).status).toBe(503);
    process.env.HOME_ENERGY_COMPANION_APK_FILE = join(temp!, "missing.apk");
    expect((await GET(request)).status).toBe(503);
  });
});
