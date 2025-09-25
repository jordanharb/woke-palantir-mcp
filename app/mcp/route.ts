import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

// Ensure Node.js runtime (pg not supported on Edge)
export const runtime = "nodejs";

// Helpers are defined locally to avoid cross-file imports failing in some runtimes

let pgPool: any | null = null;
async function getPgPool() {
  if (pgPool) return pgPool;
  const { Pool } = await import("pg");
  const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  if (!DB_HOST || !DB_PORT || !DB_NAME || !DB_USER || !DB_PASSWORD) {
    console.warn("DB env vars missing; SQL tool will be disabled.");
  }
  pgPool = new Pool({
    host: DB_HOST,
    port: DB_PORT ? parseInt(DB_PORT, 10) : 5432,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return pgPool;
}

type RpcOptions = {
  url?: string;
  key?: string;
  auth?: string;
};

async function supabaseRpc<T = unknown>(fn: string, body: Record<string, any>, opts?: RpcOptions): Promise<T> {
  const url = (opts?.url || process.env.CAMPAIGN_FINANCE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = opts?.key || process.env.CAMPAIGN_FINANCE_SUPABASE_SERVICE_KEY || process.env.CAMPAIGN_FINANCE_SUPABASE_ANON_KEY || "";
  const auth = opts?.auth || `Bearer ${key}`;
  if (!url || !key) {
    throw new Error("Supabase RPC configuration missing: set CAMPAIGN_FINANCE_SUPABASE_URL and a KEY");
  }
  const endpoint = `${url}/rest/v1/rpc/${fn}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: auth,
      Prefer: "count=exact",
    },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase RPC ${fn} failed: ${res.status} ${res.statusText} ${text}`);
  }
  return (await res.json()) as T;
}

async function embedTextToVec(text: string): Promise<number[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY not set; cannot embed query_text");
  }
  const model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, input: text }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Embedding request failed: ${res.status} ${res.statusText} ${t}`);
  }
  const json = await res.json();
  const vec = json?.data?.[0]?.embedding as number[] | undefined;
  if (!vec || !Array.isArray(vec)) {
    throw new Error("Invalid embedding response");
  }
  return vec;
}

const handler = createMcpHandler(
  async (server) => {
    // Custom SQL tool (read-only by default)
    server.tool(
      "sql",
      "Execute a SQL query against the Postgres database. Default is read-only (SELECT-only). Use for custom, ad-hoc lookups strictly when other tools don't fit.",
      {
        query: z.string().describe("SQL statement. Use SELECT unless writes are explicitly allowed."),
        params: z.array(z.any()).optional().describe("Optional positional parameters, e.g. [$1, $2]."),
        allowWrite: z
          .boolean()
          .optional()
          .describe("Set true only if writes are permitted by env (SQL_TOOL_ALLOW_WRITE)."),
      },
      async ({ query, params, allowWrite }) => {
        const pool = await getPgPool();
        if (!pool) {
          throw new Error("DB not configured");
        }
        const allowWritesEnv = (process.env.SQL_TOOL_ALLOW_WRITE || "false").toLowerCase() === "true";
        const isSelect = /^\s*select\b/i.test(query);
        if (!isSelect && !(allowWrite && allowWritesEnv)) {
          throw new Error("SQL tool is read-only. Only SELECT is allowed unless SQL_TOOL_ALLOW_WRITE=true and allowWrite=true.");
        }
        const { rows, rowCount, fields } = await pool.query(query, params || []);
        const columns = fields?.map((f: any) => f.name) || [];
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ rowCount, columns, rows }, null, 2),
            },
          ],
        };
      }
    );

    // Supabase RPC-backed tools (see mcp-adaptation-guide.md)
    server.tool(
      "session_window",
      "Compute a date window around a legislative session.",
      {
        p_session_id: z.number().int(),
        p_days_before: z.number().int().min(0),
        p_days_after: z.number().int().min(0),
      },
      async (args) => {
        const data = await supabaseRpc("session_window", args);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    server.tool(
      "find_donors_by_name",
      "Fuzzy resolve canonical donors by name.",
      {
        p_name: z.string(),
        p_limit: z.number().int().min(1).max(500).optional(),
      },
      async (args) => {
        const data = await supabaseRpc("find_donors_by_name", args);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    server.tool(
      "recipient_entity_ids_for_legislator",
      "Map a legislator to recipient committee/entity ids.",
      {
        p_legislator_id: z.number().int(),
      },
      async (args) => {
        const data = await supabaseRpc("recipient_entity_ids_for_legislator", args);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    server.tool(
      "search_donor_totals_window",
      "Donor totals/themes with rich filters. Provide query_text for automatic embedding, or pass p_query_vec.",
      {
        query_text: z.string().optional().describe("Natural language theme to rank by similarity."),
        p_query_vec: z.array(z.number()).length(1536).nullable().optional(),
        p_recipient_entity_ids: z.array(z.number().int()).nullable().optional(),
        p_session_id: z.number().int().nullable().optional(),
        p_days_before: z.number().int().min(0).default(0),
        p_days_after: z.number().int().min(0).default(0),
        p_from: z.string().nullable().optional().describe("YYYY-MM-DD, used if session_id is null"),
        p_to: z.string().nullable().optional().describe("YYYY-MM-DD, exclusive, used if session_id is null"),
        p_group_numbers: z.array(z.number().int()).nullable().optional(),
        p_min_amount: z.number().default(0),
        p_limit: z.number().int().min(1).max(1000).default(200),
      },
      async (args) => {
        let vec = args.p_query_vec ?? null;
        if (!vec && args.query_text) {
          vec = await embedTextToVec(args.query_text);
        }
        const payload: any = {
          p_query_vec: vec,
          p_recipient_entity_ids: args.p_recipient_entity_ids ?? null,
          p_session_id: args.p_session_id ?? null,
          p_days_before: args.p_days_before ?? 0,
          p_days_after: args.p_days_after ?? 0,
          p_from: args.p_from ?? null,
          p_to: args.p_to ?? null,
          p_group_numbers: args.p_group_numbers ?? null,
          p_min_amount: args.p_min_amount ?? 0,
          p_limit: args.p_limit ?? 200,
        };
        const data = await supabaseRpc("search_donor_totals_window", payload);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    server.tool(
      "search_bills_for_legislator",
      "Find bills a legislator voted on, ranked by vectors. Provide query_text for automatic embedding or pass p_query_vec.",
      {
        query_text: z.string().optional().describe("Natural language theme to embed."),
        p_query_vec: z.array(z.number()).length(1536).optional(),
        p_legislator_id: z.number().int(),
        p_session_id: z.number().int(),
        p_mode: z.enum(["summary", "full"]).default("summary"),
        p_limit: z.number().int().min(1).max(200).default(50),
      },
      async (args) => {
        const vec = args.p_query_vec ?? (args.query_text ? await embedTextToVec(args.query_text) : undefined);
        if (!vec) {
          throw new Error("Either query_text or p_query_vec is required");
        }
        const payload = {
          p_query_vec: vec,
          p_legislator_id: args.p_legislator_id,
          p_session_id: args.p_session_id,
          p_mode: args.p_mode ?? "summary",
          p_limit: args.p_limit ?? 50,
        };
        const data = await supabaseRpc("search_bills_for_legislator", payload);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    server.tool(
      "get_bill_text",
      "Fetch a bill's stored summary/title and full text snapshot.",
      {
        p_bill_id: z.number().int(),
      },
      async (args) => {
        const data = await supabaseRpc("get_bill_text", args);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    server.tool(
      "get_bill_votes",
      "Detailed roll-call rows for a bill.",
      { p_bill_id: z.number().int() },
      async (args) => {
        const data = await supabaseRpc("get_bill_votes", args);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    server.tool(
      "get_bill_vote_rollup",
      "Quick tally of vote positions for a bill.",
      { p_bill_id: z.number().int() },
      async (args) => {
        const data = await supabaseRpc("get_bill_vote_rollup", args);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );

    server.tool(
      "search_rts_by_vector",
      "Vector search stakeholder positions. Provide query_text for automatic embedding or pass p_query_vec.",
      {
        query_text: z.string().optional(),
        p_query_vec: z.array(z.number()).length(1536).optional(),
        p_bill_id: z.number().int().nullable().optional(),
        p_session_id: z.number().int().nullable().optional(),
        p_limit: z.number().int().min(1).max(200).default(50),
      },
      async (args) => {
        const vec = args.p_query_vec ?? (args.query_text ? await embedTextToVec(args.query_text) : undefined);
        if (!vec) {
          throw new Error("Either query_text or p_query_vec is required");
        }
        const payload = {
          p_query_vec: vec,
          p_bill_id: args.p_bill_id ?? null,
          p_session_id: args.p_session_id ?? null,
          p_limit: args.p_limit ?? 50,
        };
        const data = await supabaseRpc("search_rts_by_vector", payload);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
    );
  },
  {
    capabilities: {
      tools: {
        sql: { description: "Execute custom SQL (read-only by default)." },
        session_window: { description: "Compute session date window." },
        find_donors_by_name: { description: "Fuzzy donor resolution by name." },
        recipient_entity_ids_for_legislator: { description: "Committees for a legislator." },
        search_donor_totals_window: { description: "Aggregate donor totals/themes." },
        search_bills_for_legislator: { description: "Bills a legislator voted on (vector-ranked)." },
        get_bill_text: { description: "Get bill summary and full text." },
        get_bill_votes: { description: "Detailed bill vote rows." },
        get_bill_vote_rollup: { description: "Vote position counts." },
        search_rts_by_vector: { description: "Vector search RTS positions." },
      },
    },
  },
  {
    basePath: "",
    verboseLogs: true,
    maxDuration: 60,
    disableSse: true,
  }
);

export { handler as GET, handler as POST, handler as DELETE };
