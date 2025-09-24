import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSupabaseTools } from "./tools/supabase-tools.js";
import { registerWokePalantirTools } from "./tools/woke-palantir-tools.js";
import { registerCampaignFinanceTools } from "./tools/campaign-finance-tools.js";
import { z } from "zod";

const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "weather-app/1.0";

// Helper function for making NWS API requests
async function makeNWSRequest<T>(url: string): Promise<T | null> {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/geo+json",
  };

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error("Error making NWS request:", error);
    return null;
  }
}

interface AlertFeature {
  properties: {
    event?: string;
    areaDesc?: string;
    severity?: string;
    status?: string;
    headline?: string;
  };
}

// Format alert data
function formatAlert(feature: AlertFeature): string {
  const props = feature.properties;
  return [
    `Event: ${props.event || "Unknown"}`,
    `Area: ${props.areaDesc || "Unknown"}`,
    `Severity: ${props.severity || "Unknown"}`,
    `Status: ${props.status || "Unknown"}`,
    `Headline: ${props.headline || "No headline"}`,
    "---",
  ].join("\n");
}

interface ForecastPeriod {
  name?: string;
  temperature?: number;
  temperatureUnit?: string;
  windSpeed?: string;
  windDirection?: string;
  shortForecast?: string;
}

interface AlertsResponse {
  features: AlertFeature[];
}

interface PointsResponse {
  properties: {
    forecast?: string;
  };
}

interface ForecastResponse {
  properties: {
    periods: ForecastPeriod[];
  };
}

export const createServer = () => {
  // Create server instance
  const server = new McpServer({
    name: "woke-palantir-mcp",
    version: "1.0.0",
  });

  // Register weather tools
  server.tool(
    "get-alerts",
    "Get weather alerts for a state",
    {
      state: z
        .string()
        .length(2)
        .describe("Two-letter state code (e.g. CA, NY)"),
    },
    async ({ state }) => {
      const stateCode = state.toUpperCase();
      const alertsUrl = `${NWS_API_BASE}/alerts?area=${stateCode}`;
      const alertsData = await makeNWSRequest<AlertsResponse>(alertsUrl);

      if (!alertsData) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to retrieve alerts data",
            },
          ],
        };
      }

      const features = alertsData.features || [];
      if (features.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No active alerts for ${stateCode}`,
            },
          ],
        };
      }

      const formattedAlerts = features.map(formatAlert);
      const alertsText = `Active alerts for ${stateCode}:\n\n${formattedAlerts.join(
        "\n"
      )}`;

      return {
        content: [
          {
            type: "text",
            text: alertsText,
          },
        ],
      };
    }
  );

  server.tool(
    "get-forecast",
    "Get weather forecast for a location",
    {
      latitude: z
        .number()
        .min(-90)
        .max(90)
        .describe("Latitude of the location"),
      longitude: z
        .number()
        .min(-180)
        .max(180)
        .describe("Longitude of the location"),
    },
    async ({ latitude, longitude }) => {
      // Get grid point data
      const pointsUrl = `${NWS_API_BASE}/points/${latitude.toFixed(
        4
      )},${longitude.toFixed(4)}`;
      const pointsData = await makeNWSRequest<PointsResponse>(pointsUrl);

      if (!pointsData) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to retrieve grid point data for coordinates: ${latitude}, ${longitude}. This location may not be supported by the NWS API (only US locations are supported).`,
            },
          ],
        };
      }

      const forecastUrl = pointsData.properties?.forecast;
      if (!forecastUrl) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to get forecast URL from grid point data",
            },
          ],
        };
      }

      // Get forecast data
      const forecastData = await makeNWSRequest<ForecastResponse>(forecastUrl);
      if (!forecastData) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to retrieve forecast data",
            },
          ],
        };
      }

      const periods = forecastData.properties?.periods || [];
      if (periods.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No forecast periods available",
            },
          ],
        };
      }

      // Format forecast periods
      const formattedForecast = periods.map((period: ForecastPeriod) =>
        [
          `${period.name || "Unknown"}:`,
          `Temperature: ${period.temperature || "Unknown"}°${
            period.temperatureUnit || "F"
          }`,
          `Wind: ${period.windSpeed || "Unknown"} ${
            period.windDirection || ""
          }`,
          `${period.shortForecast || "No forecast available"}`,
          "---",
        ].join("\n")
      );

      const forecastText = `Forecast for ${latitude}, ${longitude}:\n\n${formattedForecast.join(
        "\n"
      )}`;

      return {
        content: [
          {
            type: "text",
            text: forecastText,
          },
        ],
      };
    }
  );

  // Register Supabase-related tools
  registerSupabaseTools(server);
  registerWokePalantirTools(server);
  registerCampaignFinanceTools(server);

  // Add resources for prompts and documentation
  server.resource(
    "legislator-influence-report-prompt",
    "legislator-influence-report-prompt",
    {
      name: "Legislator Influence Report Template",
      description: "A comprehensive prompt template for running influence analysis reports on legislators during specific sessions. Includes step-by-step instructions, RPC calls, and political relevance filters.",
      mimeType: "text/markdown"
    },
    async () => {
      return {
        contents: [{
          uri: "legislator-influence-report-prompt",
          mimeType: "text/markdown",
          text: `# MCP Task Prompt — Run a Legislator Influence Report

**User ask:** "Run a report on \`<LEGISLATOR>\` during \`<SESSION or YEAR>\`."
**Goal:** Surface potential influence signals by correlating donor themes around the session window with the legislator's bill voting. Default to **±100 days** around the session unless the user specifies otherwise. Apply the **politically relevant** donation preset. Then list discovered **themes** and **pause** for which theme(s) to explore in bills (unless the user already specified themes or says "explore all themes").

## Inputs (fill these before you start)

* \`legislator_id\` or \`legislator_name\`
* \`session_id\` **or** \`year\`
* \`days_before\`, \`days_after\` (default both to **100** if not provided)
* \`themes_to_explore\` (optional; if omitted, you will present found themes and await selection)

## Definitions you must follow

* **Recipient** (who received money): \`cf_transactions.entity_id\` (committee/candidate).
* **Donor** (who gave): \`cf_transactions.transaction_entity_id\` (canonical in \`cf_transaction_entities\`).
* **Donations only:** \`cf_transactions.transaction_type_disposition_id = 1\`.
* **Vectors:** OpenAI \`text-embedding-3-small\` (dim **1536**) already live on:

  * \`bills.embedding_summary\`, \`bills.embedding_full\`
  * \`rts_positions.embedding\`
  * \`cf_transaction_entities.embedding\` and \`cf_transactions.embedding\`
* **Politically relevant preset:** A donation is "politically relevant" if **any**:

  * \`transaction_group_number != 7\` (non-individual)
  * OR (for individuals/group 7): occupation contains any of
    \`lobbyist, consultant, government, affairs, attorney, lawyer, realtor, developer\`
  * OR employer contains \`pac\` or \`committee\`
  * OR amount ≥ **1000**
    *(You may apply this in post-processing using returned fields; see Step 3.)*

## Tools (RPCs you must call — all in schema \`public\`)

* \`session_window(p_session_id int, p_days_before int, p_days_after int)\`
* \`recipient_entity_ids_for_legislator(p_legislator_id int)\`
* \`search_donor_totals_window(p_query_vec vector(1536)|null, p_recipient_entity_ids int[]|null, p_session_id int|null, p_days_before int, p_days_after int, p_from date|null, p_to date|null, p_group_numbers int[]|null, p_min_amount numeric, p_limit int)\`

  * Returns per-**donor**: \`transaction_entity_id, entity_name, total_to_recipient, donation_count, best_match, top_employer, top_occupation\`
* \`search_bills_for_legislator(p_query_vec vector(1536), p_legislator_id int, p_session_id int, p_mode text, p_limit int)\`
* \`get_bill_text(p_bill_id int)\`
* \`get_bill_votes(p_bill_id int)\` and \`get_bill_vote_rollup(p_bill_id int)\`
* (Optional) \`search_rts_by_vector(p_query_vec vector(1536), p_bill_id int|null, p_session_id int|null, p_limit int)\`

If you only have \`legislator_name\`, resolve \`legislator_id\` first (via your upstream resolver or a project-specific mapping); do not proceed until you have \`legislator_id\`.

---

## Plan (execute exactly in this order)

### Step 1 — Resolve session window

* If user gave \`session_id\`: call \`session_window(session_id, days_before||100, days_after||100)\` → \`(from_date, to_date)\`.
* Else if user gave \`year\`: pick the session(s) overlapping that year (via \`sessions\` table in your resolver) and run the same window for each; if multiple sessions match, process each separately and label outputs by \`session_id\`.

### Step 2 — Resolve recipient committees for the legislator

* Call \`recipient_entity_ids_for_legislator(legislator_id)\` → \`recipient_ids[]\`.
* If empty, report that no recipients were found and stop.

### Step 3 — Aggregate donors around the window (no vector yet)

* Call \`search_donor_totals_window(
    p_query_vec = null,
    p_recipient_entity_ids = recipient_ids,
    p_session_id = session_id,
    p_days_before = days_before||100,
    p_days_after  = days_after||100,
    p_from = null, p_to = null,
    p_group_numbers = null,
    p_min_amount = 0,
    p_limit = 200
  )\`.
* **Apply the politically relevant preset in post-processing:**

  * Treat **non-individuals** (\`transaction_group_number != 7\`) as relevant by default.
    *(Note: if you need the group number but only have aggregates, pivot to a second pass over top candidates to fetch transaction rows; otherwise use \`entity_name/top_employer/top_occupation\` heuristics.)*
  * For **individuals (group 7)**, keep donors if:

    * \`top_occupation\` matches any keyword (case-insensitive): \`lobbyist|consultant|government|affairs|attorney|lawyer|realtor|developer\`, **or**
    * \`top_employer\` contains \`pac\` or \`committee\`, **or**
    * \`total_to_recipient ≥ 1000\`.
* **Output:** a table of top donors with \`{entity_name, total_to_recipient, donation_count, top_employer, top_occupation}\`.
* **Discover themes:** build short theme labels by clustering or simple grouping of \`top_employer\`, \`top_occupation\`, and key tokens in \`entity_name\` (e.g., "Real estate & developers", "Healthcare & insurers", "Law/lobbying", "Construction", "Education", "Tribal gaming", etc.). Keep it **concise**: 5–10 themes max, each with top donors and totals.

**Pause here and ask the user** which theme(s) to explore in bills. If the user already specified themes or says "explore all," proceed.

### Step 4 — Bills the legislator voted on, ranked by the theme

For each theme to explore:

* Create a **short phrase** for the theme (e.g., "construction & real estate").
* **Embed** once with OpenAI \`text-embedding-3-small\` → 1536-d vector.
* Call \`search_bills_for_legislator(query_vec, legislator_id, session_id, 'summary', 50)\`.
* Return a ranked list of \`{bill_number, score, vote, vote_date, summary_title}\`.
* If needed for a shortlist, re-rank with \`p_mode='full'\`.

### Step 5 — Deep dive per bill (on request or top N)

* For selected bills, call:

  * \`get_bill_text(bill_id)\` → show \`bill_summary\` and \`bill_text\` (or excerpt).
  * \`get_bill_votes(bill_id)\` and \`get_bill_vote_rollup(bill_id)\` → show vote details/rollup.

### Step 6 — Optional stakeholder color

* For the theme phrase vector, call \`search_rts_by_vector(query_vec, bill_id|null, session_id, 50)\` to pull relevant registered positions to cite.

### Step 7 — Synthesis

* Produce a concise narrative tying **donor themes** (with totals & notable names) to **bills and votes**.
* Use careful language ("aligned with", "coincides with", "association"); do **not** claim causation.
* State the exact window used: **from\\_date → to\\_date** and the **session\\_id**.
* Offer next actions (e.g., "drill into tribal gaming bills" or "expand donor window to 180 days").

---

## Minimal request/response formats

**RPC call (example):**
\`POST /rest/v1/rpc/search_donor_totals_window\`
Body:

\`\`\`json
{
  "p_query_vec": null,
  "p_recipient_entity_ids": [12345, 23456],
  "p_session_id": 57,
  "p_days_before": 100,
  "p_days_after": 100,
  "p_from": null,
  "p_to": null,
  "p_group_numbers": null,
  "p_min_amount": 0,
  "p_limit": 200
}
\`\`\`

**Theme embedding:** embed short phrase(s) once and reuse across calls.
**Thresholds:** If you must filter by similarity, do so client-side with a **soft** cutoff (e.g., \`best_match ≥ 0.75\`).

---

## What to say to the user (structure)

1. **Window & scope:** "Analyzing Rep. \`<name>\` during Session \`<S>\` (±\`<days>\` days: \`<from>\` → \`<to>\`)."
2. **Donor overview (politically relevant):** Top donors, totals, counts; short bullets per theme.
3. **Ask which theme(s)** to explore in bills (unless specified).
4. **Bills:** ranked list; note votes.
5. **Deep dives:** summary/text snippets; roll-call context.
6. **Synthesis & talking points** (issue-specific, cautious language).

---

### Notes & guardrails

* If \`legislator_id\` isn't provided and you only have a name, resolve it first; don't guess.
* If \`year\` maps to multiple sessions, run them separately and report per session.
* Keep outputs short and skimmable; defer full text until asked.
* Never imply causation; emphasize temporal windows and alignment only.

---

Paste this into your MCP as the "report runbook" template. The agent fills the inputs, follows the steps, and uses the listed RPCs exactly as described.`
        }]
      };
    }
  );

  return { server };
};
