import express from 'express';

// Minimal Express app to satisfy Vercel's MCP TypeScript server entrypoint scan.
// The actual MCP server is served via Next.js at `app/mcp/route.ts`.
const app = express();
app.get('/', (_req, res) => res.status(200).send('OK'));

export default app;

