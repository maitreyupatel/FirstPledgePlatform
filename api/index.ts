// Import from source - Vercel will transpile TypeScript automatically
// Note: The .js extension is required for ESM imports even though the source is .ts
import app from "../server/index.js";

// Vercel serverless function handler
export default app;

