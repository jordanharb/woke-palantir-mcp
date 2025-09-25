#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const origin = process.argv[2];
if (!origin) {
  console.error("Usage: node scripts/check.mjs <origin>\nExample: node scripts/check.mjs https://your-app.vercel.app");
  process.exit(1);
}

async function checkMetadata() {
  const url = new URL("/.well-known/oauth-protected-resource", origin);
  const res = await fetch(url);
  const text = await res.text();
  console.log("[metadata]", res.status, res.headers.get("content-type"));
  console.log(text);
}

async function checkMcp() {
  const transport = new StreamableHTTPClientTransport(new URL("/mcp", origin));
  const client = new Client(
    { name: "check-client", version: "1.0.0" },
    { capabilities: { tools: {}, prompts: {}, resources: {} } }
  );
  await client.connect(transport);
  console.log("[mcp] connected. server capabilities:", client.getServerCapabilities());
  const tools = await client.listTools();
  console.log("[mcp] tools:", tools);
  client.close();
}

try {
  await checkMetadata().catch((e) => {
    console.error("[metadata] error:", e.message);
  });
  await checkMcp().catch((e) => {
    console.error("[mcp] error:", e.message);
  });
} catch (e) {
  console.error("[fatal]", e);
  process.exit(1);
}

