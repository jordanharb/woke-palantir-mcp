import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabasePrimary, supabaseSecondary } from "../lib/supabase.js";

export function registerSupabaseTools(server: McpServer): void {
  server.tool(
    "db-primary-ping",
    "Run a simple query against the primary Supabase database",
    {},
    async () => {
      const { data, error } = await supabasePrimary.from("pg_tables").select("tablename").limit(1);
      if (error) {
        return { content: [{ type: "text", text: `Primary DB error: ${error.message}` }] };
      }
      return { content: [{ type: "text", text: `Primary DB ok. Sample: ${JSON.stringify(data)}` }] };
    }
  );

  server.tool(
    "db-secondary-ping",
    "Run a simple query against the secondary Supabase database",
    {},
    async () => {
      const { data, error } = await supabaseSecondary.from("pg_tables").select("tablename").limit(1);
      if (error) {
        return { content: [{ type: "text", text: `Secondary DB error: ${error.message}` }] };
      }
      return { content: [{ type: "text", text: `Secondary DB ok. Sample: ${JSON.stringify(data)}` }] };
    }
  );
}


