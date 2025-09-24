import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabaseSecondary } from "../lib/supabase.js";
import OpenAI from "openai";

export function registerCampaignFinanceTools(server: McpServer): void {
  // Initialize OpenAI client
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Helper function to create embedding vector from text
  async function createEmbedding(text: string): Promise<number[] | null> {
    try {
      if (!process.env.OPENAI_API_KEY) {
        console.warn("OPENAI_API_KEY not set, skipping vector search");
        return null;
      }
      
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
      });
      
      return response.data[0].embedding;
    } catch (error) {
      console.error("Error creating embedding:", error);
      return null;
    }
  }

  server.tool(
    "session-window",
    "Compute date window around a legislative session",
    {
      session_id: z.number().describe("Legislative session ID"),
      days_before: z.number().optional().default(0),
      days_after: z.number().optional().default(0),
    },
    async ({ session_id, days_before, days_after }) => {
      const { data, error } = await supabaseSecondary.rpc("session_window", {
        p_session_id: session_id,
        p_days_before: days_before,
        p_days_after: days_after,
      });
      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "find-donors-by-name",
    "Fuzzy search for donors by name",
    {
      name: z.string().describe("Donor name to search for"),
      limit: z.number().optional().default(25),
    },
    async ({ name, limit }) => {
      const { data, error } = await supabaseSecondary.rpc("find_donors_by_name", {
        p_name: name,
        p_limit: limit,
      });
      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "recipient-entity-ids-for-legislator",
    "Get recipient entity IDs for a legislator",
    {
      legislator_id: z.number().describe("Legislator ID"),
    },
    async ({ legislator_id }) => {
      const { data, error } = await supabaseSecondary.rpc("recipient_entity_ids_for_legislator", {
        p_legislator_id: legislator_id,
      });
      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "search-donor-totals-window",
    "Search donor totals within a date/session window with optional vector filtering",
    {
      query_text: z.string().optional().describe("Text to embed for vector search (optional)"),
      recipient_entity_ids: z.array(z.number()).optional().describe("Target recipient entity IDs"),
      session_id: z.number().optional().describe("Session ID for window calculation"),
      days_before: z.number().optional().default(0),
      days_after: z.number().optional().default(0),
      from_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      to_date: z.string().optional().describe("End date (YYYY-MM-DD, exclusive)"),
      group_numbers: z.array(z.number()).optional().describe("Transaction group numbers to filter"),
      min_amount: z.number().optional().default(0),
      limit: z.number().optional().default(200),
    },
    async (args) => {
      let query_vec = null;
      if (args.query_text) {
        query_vec = await createEmbedding(args.query_text);
      }

      const { data, error } = await supabaseSecondary.rpc("search_donor_totals_window", {
        p_query_vec: query_vec,
        p_recipient_entity_ids: args.recipient_entity_ids || null,
        p_session_id: args.session_id || null,
        p_days_before: args.days_before || 0,
        p_days_after: args.days_after || 0,
        p_from: args.from_date || null,
        p_to: args.to_date || null,
        p_group_numbers: args.group_numbers || null,
        p_min_amount: args.min_amount || 0,
        p_limit: args.limit || 200,
      });
      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "search-bills-for-legislator",
    "Find bills a legislator voted on, ranked by vector similarity",
    {
      query_text: z.string().describe("Text to embed for bill search"),
      legislator_id: z.number().describe("Legislator ID"),
      session_id: z.number().describe("Session ID"),
      mode: z.enum(["summary", "full"]).optional().default("summary"),
      limit: z.number().optional().default(50),
    },
    async ({ query_text, legislator_id, session_id, mode, limit }) => {
      const query_vec = await createEmbedding(query_text);
      if (!query_vec) {
        return { content: [{ type: "text", text: "Error: Could not create embedding vector" }] };
      }

      const { data, error } = await supabaseSecondary.rpc("search_bills_for_legislator", {
        p_query_vec: query_vec,
        p_legislator_id: legislator_id,
        p_session_id: session_id,
        p_mode: mode,
        p_limit: limit,
      });
      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "get-bill-text",
    "Get bill summary and full text",
    {
      bill_id: z.number().describe("Bill ID"),
    },
    async ({ bill_id }) => {
      const { data, error } = await supabaseSecondary.rpc("get_bill_text", {
        p_bill_id: bill_id,
      });
      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "get-bill-votes",
    "Get detailed voting records for a bill",
    {
      bill_id: z.number().describe("Bill ID"),
    },
    async ({ bill_id }) => {
      const { data, error } = await supabaseSecondary.rpc("get_bill_votes", {
        p_bill_id: bill_id,
      });
      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "get-bill-vote-rollup",
    "Get vote tally summary for a bill",
    {
      bill_id: z.number().describe("Bill ID"),
    },
    async ({ bill_id }) => {
      const { data, error } = await supabaseSecondary.rpc("get_bill_vote_rollup", {
        p_bill_id: bill_id,
      });
      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "search-rts-by-vector",
    "Search Request to Speak positions by vector similarity",
    {
      query_text: z.string().describe("Text to embed for RTS search"),
      bill_id: z.number().optional().describe("Filter by specific bill ID"),
      session_id: z.number().optional().describe("Filter by session ID"),
      limit: z.number().optional().default(50),
    },
    async ({ query_text, bill_id, session_id, limit }) => {
      const query_vec = await createEmbedding(query_text);
      if (!query_vec) {
        return { content: [{ type: "text", text: "Error: Could not create embedding vector" }] };
      }

      const { data, error } = await supabaseSecondary.rpc("search_rts_by_vector", {
        p_query_vec: query_vec,
        p_bill_id: bill_id || null,
        p_session_id: session_id || null,
        p_limit: limit,
      });
      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "resolve-legislator-by-name",
    "Resolve legislator name to legislator_id and entity_ids",
    {
      name: z.string().describe("Legislator name to search for"),
    },
    async ({ name }) => {
      // Search legislators table for name match
      const { data: legislators, error: legError } = await supabaseSecondary
        .from("legislators")
        .select("legislator_id, full_name, chamber")
        .ilike("full_name", `%${name}%`)
        .limit(10);

      if (legError) {
        return { content: [{ type: "text", text: `Error searching legislators: ${legError.message}` }] };
      }

      if (!legislators || legislators.length === 0) {
        return { content: [{ type: "text", text: "No legislators found matching that name" }] };
      }

      // For each legislator, get their entity IDs
      const results = [];
      for (const leg of legislators) {
        const { data: entityIds, error: entityError } = await supabaseSecondary.rpc(
          "recipient_entity_ids_for_legislator",
          { p_legislator_id: leg.legislator_id }
        );

        results.push({
          legislator_id: leg.legislator_id,
          full_name: leg.full_name,
          chamber: leg.chamber,
          entity_ids: entityError ? [] : entityIds?.map((e: any) => e.entity_id) || [],
        });
      }

      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }
  );

  server.tool(
    "get-session-info",
    "Get information about legislative sessions",
    {
      session_id: z.number().optional().describe("Specific session ID"),
      limit: z.number().optional().default(20),
    },
    async ({ session_id, limit }) => {
      let query = supabaseSecondary.from("sessions").select("*");
      
      if (session_id) {
        query = query.eq("session_id", session_id);
      } else {
        query = query.order("session_id", { ascending: false }).limit(limit);
      }

      const { data, error } = await query;
      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "search-bill-embeddings",
    "Search bills using the dedicated bill_embeddings table",
    {
      query_text: z.string().describe("Text to embed for bill search"),
      kind: z.enum(["summary", "chunk"]).optional().default("summary"),
      session_id: z.number().optional().describe("Filter by session ID"),
      limit: z.number().optional().default(50),
    },
    async ({ query_text, kind, session_id, limit }) => {
      const query_vec = await createEmbedding(query_text);
      if (!query_vec) {
        return { content: [{ type: "text", text: "Error: Could not create embedding vector" }] };
      }

      let query = supabaseSecondary
        .from("bill_embeddings")
        .select("*")
        .eq("kind", kind)
        .order("embedding", { ascending: true })
        .limit(limit);

      if (session_id) {
        query = query.eq("session_id", session_id);
      }

      const { data, error } = await query;
      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "search-donor-embeddings",
    "Search donors using the dedicated donor_embeddings table",
    {
      query_text: z.string().describe("Text to embed for donor search"),
      limit: z.number().optional().default(50),
    },
    async ({ query_text, limit }) => {
      const query_vec = await createEmbedding(query_text);
      if (!query_vec) {
        return { content: [{ type: "text", text: "Error: Could not create embedding vector" }] };
      }

      const { data, error } = await supabaseSecondary
        .from("donor_embeddings")
        .select("*")
        .order("embedding", { ascending: true })
        .limit(limit);

      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "search-rts-embeddings",
    "Search RTS positions using the dedicated rts_embeddings table",
    {
      query_text: z.string().describe("Text to embed for RTS search"),
      bill_id: z.number().optional().describe("Filter by bill ID"),
      limit: z.number().optional().default(50),
    },
    async ({ query_text, bill_id, limit }) => {
      const query_vec = await createEmbedding(query_text);
      if (!query_vec) {
        return { content: [{ type: "text", text: "Error: Could not create embedding vector" }] };
      }

      let query = supabaseSecondary
        .from("rts_embeddings")
        .select("*")
        .order("embedding", { ascending: true })
        .limit(limit);

      if (bill_id) {
        query = query.eq("bill_id", bill_id);
      }

      const { data, error } = await query;
      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "get-bill-documents",
    "Get bill documents and their processing status",
    {
      bill_id: z.number().describe("Bill ID"),
    },
    async ({ bill_id }) => {
      const { data, error } = await supabaseSecondary
        .from("bill_documents")
        .select("*")
        .eq("bill_id", bill_id)
        .order("created_at", { ascending: false });

      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "get-bill-sponsors",
    "Get sponsors for a bill",
    {
      bill_id: z.number().describe("Bill ID"),
    },
    async ({ bill_id }) => {
      const { data, error } = await supabaseSecondary
        .from("bill_sponsors")
        .select(`
          *,
          legislators!bill_sponsors_legislator_id_fkey (
            legislator_id,
            full_name,
            party,
            body,
            district
          )
        `)
        .eq("bill_id", bill_id)
        .order("display_order", { ascending: true });

      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "get-transaction-groups",
    "Get transaction group categories",
    {},
    async () => {
      const { data, error } = await supabaseSecondary
        .from("cf_transaction_groups")
        .select("*")
        .order("group_number", { ascending: true });

      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "get-entity-details",
    "Get detailed information about a campaign finance entity",
    {
      entity_id: z.number().describe("Entity ID"),
    },
    async ({ entity_id }) => {
      const { data, error } = await supabaseSecondary
        .from("cf_entities")
        .select(`
          *,
          cf_entity_records!cf_entities_entity_id_fkey (*)
        `)
        .eq("entity_id", entity_id)
        .single();

      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );
}
