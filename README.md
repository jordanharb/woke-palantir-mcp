# Sample MCP Server for ChatGPT Deep Research

This is a sample Model Context Protocol (MCP) server designed to work with ChatGPT's Deep Research feature. It provides semantic search through OpenAI's Vector Store API and document retrieval capabilities, demonstrating how to build custom MCP servers that can extend ChatGPT with company-specific knowledge and tools.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Fdeep-research-template)

## Features

- **Search Tool**: Semantic search using OpenAI Vector Store API
- **Fetch Tool**: Complete document retrieval by ID with full content and metadata
- **Sample Data**: Includes 5 sample documents covering various technical topics
- **MCP Compliance**: Follows [OpenAI's MCP specification](https://platform.openai.com/docs/mcp#test-and-connect-your-mcp-server) for deep research integration

## Connecting to ChatGPT Deep Research

Check out the [Deep Research](https://platform.openai.com/docs/mcp#create-an-mcp-server) for and [Developer Mode](https://platform.openai.com/docs/guides/developer-mode) documentation for more information on how to connect to your MCP server.

## Usage

This sample app uses the [mcp-handler](https://www.npmjs.com/package/mcp-handler) that allows you to drop in an MCP server on a group of routes in any Next.js project.

Update `app/mcp/route.ts` with your tools, prompts, and resources following the [MCP TypeScript SDK documentation](https://github.com/modelcontextprotocol/typescript-sdk/tree/main?tab=readme-ov-file#server).


This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## MCP Database Adaptation

This template is adapted to your Postgres/Supabase dataset and exposes database-backed MCP tools. The demo `search`/`fetch` tools have been replaced with:

- `sql` — execute custom SQL (SELECT-only by default)
- `session_window` — compute a date window for a legislative session
- `find_donors_by_name` — fuzzy donor resolution
- `recipient_entity_ids_for_legislator` — map legislator → recipient committees
- `search_donor_totals_window` — donor totals/themes with filters (+ optional vector ranking)
- `search_bills_for_legislator` — vector-ranked bills a legislator voted on
- `get_bill_text` — bill summary and full text snapshot
- `get_bill_votes` — detailed roll-call rows
- `get_bill_vote_rollup` — quick vote counts
- `search_rts_by_vector` — vector search for RTS positions

### Automatic Vectorization
- For vector tools, pass natural language `query_text`. The server will embed it using OpenAI (`OPENAI_API_KEY`, `EMBEDDING_MODEL`) before calling Supabase RPCs. You can still pass `p_query_vec` directly if you already have a 1536-d vector.

### Environment Variables
Place these in `.env.local` (or your deployment’s secret manager):

```
# MCP
MCP_SERVER_PORT=3000
MCP_SERVER_NAME=woke-palantir-mcp

# Postgres (direct SQL tool)
DB_HOST=your-host
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=...
# Optional: allow writes via sql tool (off by default)
SQL_TOOL_ALLOW_WRITE=false

# Supabase (RPC tools)
CAMPAIGN_FINANCE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
# Prefer service key for server runtime
CAMPAIGN_FINANCE_SUPABASE_SERVICE_KEY=...
# Or anon key (reduced privileges)
CAMPAIGN_FINANCE_SUPABASE_ANON_KEY=...

# OpenAI embeddings
OPENAI_API_KEY=...
EMBEDDING_MODEL=text-embedding-3-small
```

### SQL Tool Safety
- Only SELECT is allowed by default. To enable writes, set `SQL_TOOL_ALLOW_WRITE=true` and pass `allowWrite: true` when invoking the tool. Keep this disabled in production unless absolutely necessary.

### Supabase RPCs
These tools call your database functions via `POST /rest/v1/rpc/<fn>` using `CAMPAIGN_FINANCE_SUPABASE_URL` and a key. See `mcp-adaptation-guide.md` for function specs, inputs/outputs, and chaining recommendations.

### Running
- Install deps: `npm install`
- Dev: `npm run dev`
- The MCP HTTP endpoint is available at `app/mcp/route.ts` (`/mcp`).

### Notes
- Ensure your DB has the schema in `schema.md` and the RPCs listed in `mcp-adaptation-guide.md`.
- If you need additional domain tools, mirror the pattern in `app/mcp/route.ts`.
