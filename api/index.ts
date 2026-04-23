// Vercel serverless function entry — diagnostic wrapper to surface startup crash
import type { IncomingMessage, ServerResponse } from "node:http";

let app: any = null;
let startupError: string | null = null;

try {
  const mod = await import("../server/index.js");
  app = mod.default;
} catch (err: any) {
  startupError = `${err?.message || String(err)}\n\nStack: ${err?.stack || "none"}`;
  console.error("STARTUP CRASH:", startupError);
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (startupError) {
    const body = JSON.stringify({ error: "startup_failed", detail: startupError });
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(body);
    return;
  }
  return app(req, res);
}
