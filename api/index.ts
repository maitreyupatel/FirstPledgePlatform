// Vercel serverless function entry point
// Wraps server startup to expose crash details via /api/health if init fails

let app: any = null;
let startupError: any = null;

try {
  const mod = await import("../server/index.js");
  app = mod.default;
} catch (err: any) {
  startupError = err;
  console.error("STARTUP CRASH:", err?.message, err?.stack);
}

export default function handler(req: any, res: any) {
  if (startupError) {
    res.status(500).json({
      error: "Server startup failed",
      message: startupError?.message || String(startupError),
      stack: process.env.NODE_ENV !== "production" ? startupError?.stack : undefined,
    });
    return;
  }
  return app(req, res);
}
