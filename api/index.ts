// Vercel serverless function entry point
// Imports from the esbuild-bundled output (dist/index.js), NOT the raw TypeScript source.
// The build step (npm run build) compiles server/index.ts + all deps into dist/index.js.
// Vercel runs "npm run build" before deploying, so dist/index.js always exists.
import app from "../dist/index.js";
export default app;
