import { buildApp } from "./app.js";

const app = buildApp();
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST?.trim() || "0.0.0.0";

try {
  await app.listen({ host, port });
  console.log(`Home-Energy API listening on http://${host}:${port}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
