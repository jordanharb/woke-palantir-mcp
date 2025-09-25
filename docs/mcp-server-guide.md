# MCP Server Integration Guide

This document explains how to use the deployed MCP server at `https://woke-palantir-mcp.vercel.app/mcp`, how the tooling is structured, and what a developer needs to integrate it with an AI agent or adapt it to another application.

---

## 1. Overview

- **Stack**: Next.js route running `mcp-handler` with custom tools backed by Supabase RPCs and a PostgreSQL connection.
- **Entry point**: `app/mcp/route.ts` exposes the Streamable HTTP transport at `/mcp`.
- **Authentication**: None required. OAuth metadata endpoint advertises no auth via `/.well-known/oauth-protected-resource`.
- **Transport**: Streamable HTTP (SSE disabled for now). Clients should POST to `/mcp` unless enabling SSE manually.
- **Verification script**: `node scripts/check.mjs https://woke-palantir-mcp.vercel.app` validates the metadata endpoint and lists registered tools.

---

## 2. Environment Variables

Populate these in `.env.local`, Vercel project settings, or a secrets manager.

```ini
# MCP server identity (optional)
MCP_SERVER_PORT=3000
MCP_SERVER_NAME=woke-palantir-mcp

# Postgres connection for the SQL tool and direct queries
DB_HOST=aws-0-us-east-2.pooler.supabase.com
DB_PORT=6543
DB_NAME=postgres
DB_USER=postgres.djzrlccihwqxtjkytcph
DB_PASSWORD=Fightfest908!
SQL_TOOL_ALLOW_WRITE=false        # Enable only if writes are intentionally allowed

# Supabase project that hosts the domain RPCs
CAMPAIGN_FINANCE_SUPABASE_URL=https://ffdrtpknppmtkkbqsvek.supabase.co
CAMPAIGN_FINANCE_SUPABASE_ANON_KEY=<anon or service key>
CAMPAIGN_FINANCE_SUPABASE_SERVICE_KEY=<service key recommended for server runtime>

# Embedding API for automatic query vectorization
OPENAI_API_KEY=<OpenAI API key>
EMBEDDING_MODEL=text-embedding-3-small
```

> **Note:** Store secrets in Vercel environment variables for production.

---

## 3. HTTP Endpoints

| Path | Method | Purpose |
|------|--------|---------|
| `/mcp` | `POST` | Streamable HTTP MCP transport (primary endpoint). |
| `/mcp` | `DELETE`, `GET` | Return HTTP 405 but implementors should expose these for completeness. |
| `/.well-known/oauth-protected-resource` | `GET` | OAuth metadata returning `authorization_servers: []` (signals no OAuth required). |
| `/.well-known/oauth-protected-resource` | `OPTIONS` | CORS preflight support. |

---

## 4. Tool Catalogue

All tools are registered in `app/mcp/route.ts`. Table below lists names, descriptions, and input schemas.

| Tool | Description | Input Schema |
|------|-------------|--------------|
| `sql` | Execute custom SQL (read-only unless env + request explicitly allow writes). | `{ query: string, params?: any[], allowWrite?: boolean }` |
| `session_window` | Compute ± day window for a legislative session. | `{ p_session_id: number, p_days_before: number, p_days_after: number }` |
| `find_donors_by_name` | Fuzzy donor lookup with summary stats. | `{ p_name: string, p_limit?: number }` |
| `recipient_entity_ids_for_legislator` | Committees/entities tied to a legislator. | `{ p_legislator_id: number }` |
| `search_donor_totals_window` | Aggregate donor totals/themes with optional vector ranking (auto-embeds `query_text`). | `{ query_text?: string, p_query_vec?: number[1536], p_recipient_entity_ids?: number[], p_session_id?: number, p_days_before?: number, p_days_after?: number, p_from?: string, p_to?: string, p_group_numbers?: number[], p_min_amount?: number, p_limit?: number }` |
| `search_bills_for_legislator` | Vector-ranked bills a legislator voted on. | `{ query_text?: string, p_query_vec?: number[1536], p_legislator_id: number, p_session_id: number, p_mode?: "summary" | "full", p_limit?: number }` |
| `get_bill_text` | Fetch bill summary/title and full text snapshot. | `{ p_bill_id: number }` |
| `get_bill_votes` | Detailed roll-call rows for a bill. | `{ p_bill_id: number }` |
| `get_bill_vote_rollup` | Vote count aggregation by position. | `{ p_bill_id: number }` |
| `search_rts_by_vector` | Vector search for stakeholder positions (RTS). | `{ query_text?: string, p_query_vec?: number[1536], p_bill_id?: number, p_session_id?: number, p_limit?: number }` |

Supporting notes:

- Automatic embeddings use OpenAI `text-embedding-3-small`; requires `OPENAI_API_KEY`.
- SQL tool enforces read-only by default. To allow writes, set `SQL_TOOL_ALLOW_WRITE=true` **and** call with `allowWrite: true`.
- Supabase RPC shapes and recommended chains are detailed in `mcp-adaptation-guide.md`.

---

## 5. OAuth Metadata Endpoint

File: `app/.well-known/oauth-protected-resource/route.ts`

```json
GET /.well-known/oauth-protected-resource -> {
  "resource": "https://woke-palantir-mcp.vercel.app",
  "authorization_servers": []
}
```

This tells clients no OAuth flow is required. OPTIONS handler adds permissive CORS headers.

---

## 6. Local Verification

```bash
npm install
npm run build              # ensure Next.js build passes

# Smoke test: metadata + MCP
node scripts/check.mjs https://woke-palantir-mcp.vercel.app
# or, if running locally
node scripts/check.mjs http://localhost:3000
```

The script prints the metadata response then connects via Streamable HTTP and lists tools.

---

## 7. Connecting an MCP Client

ChatGPT’s current connector UI supports only the two-tool sample, so use an MCP-compliant agent that accepts multi-tool servers.

**Claude Desktop (macOS/Windows)**

```json
{
  "mcpServers": {
    "woke-palantir": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://woke-palantir-mcp.vercel.app/mcp"]
    }
  }
}
```

**Cursor (IDE)**

```json
{
  "servers": [
    {
      "id": "woke-palantir",
      "type": "http",
      "url": "https://woke-palantir-mcp.vercel.app/mcp"
    }
  ]
}
```

**Windsurf (Codeium)**

```json
{
  "mcpServers": [
    {
      "id": "woke-palantir",
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://woke-palantir-mcp.vercel.app/mcp"]
    }
  ]
}
```

Custom integrations can use `@modelcontextprotocol/sdk`—see `scripts/test-client.mjs` (SSE) and `scripts/test-streamable-http-client.mjs` (Streamable HTTP).

---

## 8. Adapting to Other Domains

1. Clone or fork the repo.
2. Replace Supabase RPCs and database credentials with your domain-specific functions.
3. Update `app/mcp/route.ts` to register your tools.
4. Adjust embedding logic if vector dimensions or models differ.
5. Run `npm run build` locally to confirm type safety.
6. Deploy to Vercel (Framework preset: Next.js; disable standalone MCP TypeScript build if enabled).
7. Verify with `node scripts/check.mjs <origin>` and your MCP client of choice.

Refer to `mcp-adaptation-guide.md` for the full RPC contract and recommended prompt/chain flows.

---

## 9. Troubleshooting

- **“No entrypoint found” during Vercel build**: ensure only the Next.js framework builder is enabled; avoid additional `server.js/ts` entrypoints unless intentionally deploying a standalone MCP server.
- **ChatGPT still asks for OAuth**: confirm the metadata endpoint returns `authorization_servers: []` and re-add the connector selecting “No OAuth.”
- **Supabase errors**: verify `CAMPAIGN_FINANCE_SUPABASE_*` env variables and network connectivity. Set `SQL_TOOL_ALLOW_WRITE=false` unless absolutely required.
- **Embedding failures**: ensure `OPENAI_API_KEY` is configured and the account has access to `text-embedding-3-small`.

---

## 10. Reference Files

- `app/mcp/route.ts` — MCP server and tool registration.
- `app/.well-known/oauth-protected-resource/route.ts` — OAuth discovery metadata.
- `mcp-adaptation-guide.md` — Supabase RPC interface specs and recommended flows.
- `schema.md` — Legislative and campaign finance schema reference.
- `.env.local.example` — Environment variable template.
- `scripts/check.mjs` — Quick verification script for metadata + MCP.

