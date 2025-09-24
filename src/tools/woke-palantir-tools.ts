import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabasePrimary } from "../lib/supabase.js";

export function registerWokePalantirTools(server: McpServer): void {
  server.tool(
    "run-sql-query",
    "Execute a read-only SQL query on the primary database",
    {
      query: z.string().describe("SQL query to execute (SELECT/CTE only)"),
      parameters: z.array(z.any()).optional(),
    },
    async ({ query, parameters }) => {
      const normalized = query.trim().toUpperCase();
      if (!normalized.startsWith("SELECT") && !normalized.startsWith("WITH")) {
        return { content: [{ type: "text", text: "Only SELECT/WITH queries are allowed" }] };
      }

      const { data, error } = await supabasePrimary.rpc("execute_readonly_query", {
        query_text: query,
        query_params: parameters || [],
      });
      if (error) {
        return { content: [{ type: "text", text: `SQL error: ${error.message}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "get-filter-options",
    "Get available filter options from Supabase RPC",
    {},
    async () => {
      const { data, error } = await supabasePrimary.rpc("get_filter_options_optimized");
      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "get-schools-involved",
    "List schools involved in education-related events",
    {
      date_range: z
        .object({ start_date: z.string().optional(), end_date: z.string().optional() })
        .optional(),
      include_events: z.boolean().optional(),
    },
    async ({ date_range, include_events }) => {
      const educationTags = ["Education", "College", "High School", "Homeschool", "School Board"];

      let query = supabasePrimary.from("v2_events").select("*");
      if (date_range?.start_date) query = query.gte("event_date", date_range.start_date);
      if (date_range?.end_date) query = query.lte("event_date", date_range.end_date);

      const orClause = educationTags.map((t) => `category_tags.cs.[${JSON.stringify(t)}]`).join(",");
      query = query.or(orClause).order("event_date", { ascending: false }).limit(500);

      const { data: events, error } = await query;
      if (error) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      }

      const schoolTags = new Set<string>();
      const schoolDetails: Record<string, any> = {};
      for (const ev of events || []) {
        const tags: string[] = ev.category_tags || [];
        for (const tag of tags) {
          if (typeof tag === "string" && tag.startsWith("School:")) {
            schoolTags.add(tag);
            if (!schoolDetails[tag]) {
              schoolDetails[tag] = {
                tag,
                name: tag.replace("School:", "").replace(/_/g, " "),
                events: [],
                event_count: 0,
                states: new Set<string>(),
              };
            }
            schoolDetails[tag].events.push({ id: ev.id, name: ev.event_name, date: ev.event_date });
            schoolDetails[tag].event_count++;
            if (ev.state) schoolDetails[tag].states.add(ev.state);
          }
        }
      }

      const { data: allSchools } = await supabasePrimary
        .from("dynamic_slugs")
        .select("full_slug, label, description")
        .eq("parent_tag", "School");

      const schoolsFromEvents = Array.from(schoolTags)
        .map((tag) => ({
          ...schoolDetails[tag],
          states: Array.from(schoolDetails[tag].states),
          events: include_events ? schoolDetails[tag].events : undefined,
        }))
        .sort((a: any, b: any) => b.event_count - a.event_count);

      const result = {
        summary: {
          total_education_events: events?.length || 0,
          unique_schools_in_events: schoolTags.size,
          total_schools_in_database: allSchools?.length || 0,
          date_range: date_range || "all time",
        },
        schools_with_events: schoolsFromEvents,
        events: include_events ? events : undefined,
        all_known_schools: allSchools?.map((s: any) => ({ tag: s.full_slug, name: s.label, description: s.description })),
      };

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}


