// Minimal Express entrypoint to satisfy Vercel's MCP TypeScript Server detector.
// NOTE: The actual MCP server runs via Next.js at `app/mcp/route.ts` using mcp-handler.
import express from 'express';

const app = express();
app.get('/', (_req, res) => res.status(200).send('OK'));

export default app;

