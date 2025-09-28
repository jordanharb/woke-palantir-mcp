import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

// Ensure Node.js runtime (pg not supported on Edge)
export const runtime = "nodejs";

const exposeFullToolset = (process.env.EXPOSE_FULL_TOOLSET || "false").toLowerCase() === "true";

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
    ssl: { rejectUnauthorized: false },
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

const SearchFiltersCoreSchema = z.object({
  types: z.array(z.enum(["donor", "bill", "rts"])).optional(),
  legislator_id: z.number().int().optional(),
  session_id: z.number().int().optional(),
  days_before: z.number().int().min(0).optional(),
  days_after: z.number().int().min(0).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  recipient_entity_ids: z.array(z.number().int()).optional(),
  bill_id: z.number().int().optional(),
  group_numbers: z.array(z.number().int()).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  min_amount: z.number().optional(),
  mode: z.enum(["summary", "full"]).optional(),
});

type SearchFilters = z.infer<typeof SearchFiltersCoreSchema>;

const SearchFiltersSchema = SearchFiltersCoreSchema.optional();

const FetchInputSchema = z.object({
  id: z.string().describe("Identifier from the search results."),
});

type SearchResult = {
  id: string;
  type: string;
  title: string;
  summary: string;
  source: string;
};

function createResultId(payload: Record<string, any> & { type: string }) {
  return `${payload.type}:${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
}

function decodeResultId(id: string) {
  const [prefix, encoded] = id.split(":", 2);
  if (!prefix || !encoded) {
    throw new Error("Invalid result id format");
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return { prefix, payload } as const;
  } catch (error) {
    throw new Error("Failed to decode result id");
  }
}

function asArray<T>(data: T | T[] | null | undefined): T[] {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

function formatCurrency(value: unknown) {
  const num = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(num)) return "N/A";
  return num.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatNumber(value: unknown) {
  const num = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(num)) return "N/A";
  return num.toLocaleString("en-US");
}

async function donorSearchResults(queryText: string, queryVector: number[] | null, filters?: SearchFilters): Promise<SearchResult[]> {
  const f = filters ?? {};
  const recipients = f.recipient_entity_ids
    ? f.recipient_entity_ids
    : f.legislator_id
    ? asArray<{ entity_id: number }>(
        await supabaseRpc("recipient_entity_ids_for_legislator", {
          p_legislator_id: f.legislator_id,
        })
      ).map((row) => row.entity_id)
    : null;

  const payload: Record<string, any> = {
    p_query_vec: queryVector,
    p_recipient_entity_ids: recipients && recipients.length ? recipients : null,
    p_session_id: f.session_id ?? null,
    p_days_before: f.days_before ?? 0,
    p_days_after: f.days_after ?? 0,
    p_from: f.from ?? null,
    p_to: f.to ?? null,
    p_group_numbers: f.group_numbers ?? null,
    p_min_amount: f.min_amount ?? 0,
    p_limit: f.limit ?? 25,
  };

  const rows = asArray<any>(await supabaseRpc("search_donor_totals_window", payload));

  return rows.map((row) => {
    const idPayload = {
      type: "donor",
      record: row,
      context: {
        query_text: queryText,
        filters: f,
      },
    };
    const id = createResultId(idPayload);
    const title = row.entity_name || `Transaction Entity ${row.transaction_entity_id}`;
    const summary = [
      `Total To Recipients: ${formatCurrency(row.total_to_recipient)}`,
      `Donations: ${formatNumber(row.donation_count)}`,
      row.top_employer ? `Top Employer: ${row.top_employer}` : null,
      row.top_occupation ? `Top Occupation: ${row.top_occupation}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      id,
      type: "donor",
      title,
      summary,
      source: "search_donor_totals_window",
    } satisfies SearchResult;
  });
}

async function billSearchResults(
  queryText: string,
  queryVector: number[] | null,
  filters?: SearchFilters
): Promise<SearchResult[]> {
  const f = filters ?? {};
  if (!queryVector || !f.legislator_id || !f.session_id) {
    return [];
  }
  const payload = {
    p_query_vec: queryVector,
    p_legislator_id: f.legislator_id,
    p_session_id: f.session_id,
    p_mode: f.mode ?? "summary",
    p_limit: f.limit ?? 25,
  };
  const rows = asArray<any>(await supabaseRpc("search_bills_for_legislator", payload));

  return rows.map((row) => {
    const idPayload = {
      type: "bill",
      bill_id: row.bill_id,
      legislator_id: f.legislator_id,
      session_id: f.session_id,
      mode: payload.p_mode,
      score: row.score,
      query_text: queryText,
    };
    const id = createResultId(idPayload);
    const title = row.summary_title || row.bill_number || `Bill ${row.bill_id}`;
    const summary = [
      row.bill_number ? `Bill ${row.bill_number}` : null,
      row.vote ? `Vote: ${row.vote}` : null,
      row.vote_date ? `Vote Date: ${row.vote_date}` : null,
      row.score ? `Score: ${Number(row.score).toFixed(3)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      id,
      type: "bill",
      title,
      summary,
      source: "search_bills_for_legislator",
    } satisfies SearchResult;
  });
}

async function rtsSearchResults(queryText: string, queryVector: number[] | null, filters?: SearchFilters): Promise<SearchResult[]> {
  const f = filters ?? {};
  if (!queryVector) {
    return [];
  }
  const payload = {
    p_query_vec: queryVector,
    p_bill_id: f.bill_id ?? null,
    p_session_id: f.session_id ?? null,
    p_limit: f.limit ?? 25,
  };
  const rows = asArray<any>(await supabaseRpc("search_rts_by_vector", payload));

  return rows.map((row) => {
    const idPayload = {
      type: "rts",
      record: row,
      context: {
        query_text: queryText,
        filters: f,
      },
    };
    const id = createResultId(idPayload);
    const summary = [
      row.entity_name ? `Entity: ${row.entity_name}` : null,
      row.rts_position ? `Position: ${row.rts_position}` : null,
      row.score ? `Score: ${Number(row.score).toFixed(3)}` : null,
      row.bill_id ? `Bill ID: ${row.bill_id}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      id,
      type: "rts",
      title: row.entity_name || `RTS Position ${row.position_id}`,
      summary,
      source: "search_rts_by_vector",
    } satisfies SearchResult;
  });
}

function registerSearchAndFetch(server: any) {
  server.tool(
    "search",
    "Unified search across donors, bills, and stakeholder positions. Returns lightweight result summaries that can be passed to the fetch tool for detail.",
    {
      query: z.string().optional().describe("Search query. Natural language works best; leave empty to see top donors."),
      filters: SearchFiltersSchema,
    },
    async ({ query, filters }: { query?: string; filters?: SearchFilters }) => {
      const queryText = query?.trim() ?? "";
      const filtersInput = filters;
      const requestedTypes = filtersInput?.types ?? ["donor", "bill", "rts"];
      const results: SearchResult[] = [];
      const errors: string[] = [];

      let queryVector: number[] | null = null;
      if (queryText) {
        try {
          queryVector = await embedTextToVec(queryText);
        } catch (error: any) {
          errors.push(`Embedding failed: ${error.message ?? error}`);
        }
      }

      if (requestedTypes.includes("donor")) {
        try {
          results.push(...(await donorSearchResults(queryText, queryVector, filtersInput)));
        } catch (error: any) {
          errors.push(`Donor search failed: ${error.message ?? error}`);
        }
      }

      if (requestedTypes.includes("bill")) {
        try {
          results.push(...(await billSearchResults(queryText, queryVector, filtersInput)));
        } catch (error: any) {
          errors.push(`Bill search failed: ${error.message ?? error}`);
        }
      }

      if (requestedTypes.includes("rts")) {
        try {
          results.push(...(await rtsSearchResults(queryText, queryVector, filtersInput)));
        } catch (error: any) {
          errors.push(`RTS search failed: ${error.message ?? error}`);
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ results, errors }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "fetch",
    "Retrieve detailed information for a result returned by the search tool.",
    FetchInputSchema,
    async ({ id }: { id: string }) => {
      const { prefix, payload } = decodeResultId(id);

      if (prefix === "donor") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                type: "donor",
                summary: payload.record,
                context: payload.context,
              }, null, 2),
            },
          ],
        };
      }

      if (prefix === "bill") {
        const billId = payload.bill_id;
        const billText = await supabaseRpc("get_bill_text", { p_bill_id: billId });
        const votes = await supabaseRpc("get_bill_votes", { p_bill_id: billId });
        const rollup = await supabaseRpc("get_bill_vote_rollup", { p_bill_id: billId });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                type: "bill",
                bill: billText,
                votes,
                vote_rollup: rollup,
                context: payload,
              }, null, 2),
            },
          ],
        };
      }

      if (prefix === "rts") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ type: "rts", record: payload.record, context: payload.context }, null, 2),
            },
          ],
        };
      }

      throw new Error(`Unknown result type: ${prefix}`);
    }
  );
}

function registerDomainTools(server: any) {
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
    async ({ query, params, allowWrite }: { query: string; params?: any[]; allowWrite?: boolean }) => {
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

  server.tool(
    "session_window",
    "Compute a date window around a legislative session.",
    {
      p_session_id: z.number().int(),
      p_days_before: z.number().int().min(0),
      p_days_after: z.number().int().min(0),
    },
    async (args: Record<string, any>) => {
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
    async (args: Record<string, any>) => {
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
    async (args: Record<string, any>) => {
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
    async (args: Record<string, any>) => {
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
    async (args: Record<string, any>) => {
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
    async (args: Record<string, any>) => {
      const data = await supabaseRpc("get_bill_text", args);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "get_bill_votes",
    "Detailed roll-call rows for a bill.",
    { p_bill_id: z.number().int() },
    async (args: Record<string, any>) => {
      const data = await supabaseRpc("get_bill_votes", args);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "get_bill_vote_rollup",
    "Quick tally of vote positions for a bill.",
    { p_bill_id: z.number().int() },
    async (args: Record<string, any>) => {
      const data = await supabaseRpc("get_bill_vote_rollup", args);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "search_rts_by_vector",
    "Vector search stakeholder positions with optional bill/session filter.",
    {
      query_text: z.string().optional(),
      p_query_vec: z.array(z.number()).length(1536).optional(),
      p_bill_id: z.number().int().nullable().optional(),
      p_session_id: z.number().int().nullable().optional(),
      p_limit: z.number().int().min(1).max(200).default(50),
    },
    async (args: Record<string, any>) => {
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
}

const toolDescriptions = exposeFullToolset
  ? {
      search: { description: "Unified search across donors, bills, and stakeholder data." },
      fetch: { description: "Retrieve detailed info for a search result." },
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
    }
  : {
      search: { description: "Unified search across donors, bills, and stakeholder data." },
      fetch: { description: "Retrieve detailed info for a search result." },
    };

const handler = createMcpHandler(
  async (server) => {
    registerSearchAndFetch(server);
    if (exposeFullToolset) {
      registerDomainTools(server);
    }
  },
  {
    capabilities: {
      tools: toolDescriptions,
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
