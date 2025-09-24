# Woke Palantir MCP Server

A Model Context Protocol (MCP) server built with Express.js that provides comprehensive tools for analyzing campaign finance data, legislative voting patterns, and social media monitoring.

## Features

### Campaign Finance Analysis
- **Donor Research**: Search donors by name, analyze donation patterns
- **Legislator Mapping**: Connect legislators to their campaign finance entities
- **Bill Analysis**: Find bills legislators voted on, with vector similarity search
- **Session Windows**: Analyze donations around legislative sessions
- **RTS Positions**: Search Request to Speak positions by topic similarity

### Social Media Monitoring
- **Event Querying**: Search events with filters for date, location, actors, tags
- **School Tracking**: Identify schools involved in education-related events
- **Actor Analysis**: Get detailed information about people and organizations
- **SQL Queries**: Execute read-only database queries

### Vector Search Capabilities
- **Bill Embeddings**: Search bills by semantic similarity
- **Donor Embeddings**: Find donors by topic relevance
- **RTS Embeddings**: Locate stakeholder positions by theme

## Quick Start

### Local Development

1. **Clone and install:**
   ```bash
   git clone <your-repo>
   cd express-mcp
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp ENVIRONMENT_VARIABLES.md .env
   # Edit .env with your actual values
   ```

3. **Run locally:**
   ```bash
   npm run dev
   ```

4. **Test the server:**
   ```bash
   curl -X POST http://localhost:3000/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}'
   ```

### Vercel Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete deployment instructions.

## Available Tools

### Core Campaign Finance Tools
- `resolve-legislator-by-name` - Find legislator by name
- `search-donor-totals-window` - Analyze donations in time windows
- `search-bills-for-legislator` - Bills voted on by legislator
- `get-bill-text` - Get bill details and full text
- `get-bill-votes` - Detailed voting records
- `search-rts-by-vector` - RTS positions by similarity

### Vector Search Tools
- `search-bill-embeddings` - Semantic bill search
- `search-donor-embeddings` - Topic-based donor search
- `search-rts-embeddings` - RTS position similarity

### Utility Tools
- `session-window` - Calculate session date ranges
- `get-session-info` - Legislative session details
- `get-bill-sponsors` - Bill sponsorship information
- `get-transaction-groups` - Campaign finance categories

### Social Media Tools
- `run-sql-query` - Execute read-only SQL
- `get-filter-options` - Available filter options
- `get-schools-involved` - Education event analysis

## Environment Variables

Required environment variables:

```env
# Primary Database
SUPABASE_URL=https://your-primary-project.supabase.co
SUPABASE_ANON_KEY=your_primary_anon_key
SUPABASE_SERVICE_KEY=your_primary_service_key

# Campaign Finance Database
CAMPAIGN_FINANCE_SUPABASE_URL=https://your-cf-project.supabase.co
CAMPAIGN_FINANCE_SUPABASE_ANON_KEY=your_cf_anon_key
CAMPAIGN_FINANCE_SUPABASE_SERVICE_KEY=your_cf_service_key

# OpenAI for embeddings
OPENAI_API_KEY=sk-your_openai_key

# Server
PORT=3000
```

## Usage Examples

### Find Donors for a Legislator
```json
{
  "method": "tools/call",
  "params": {
    "name": "search-donor-totals-window",
    "arguments": {
      "query_text": "construction real estate",
      "recipient_entity_ids": [123, 456],
      "session_id": 57,
      "days_before": 100,
      "days_after": 100
    }
  }
}
```

### Search Bills by Topic
```json
{
  "method": "tools/call",
  "params": {
    "name": "search-bills-for-legislator",
    "arguments": {
      "query_text": "education funding",
      "legislator_id": 123,
      "session_id": 57
    }
  }
}
```

### Resolve Legislator
```json
{
  "method": "tools/call",
  "params": {
    "name": "resolve-legislator-by-name",
    "arguments": {
      "name": "Hernandez"
    }
  }
}
```

## Architecture

- **Express.js** server with MCP protocol support
- **Supabase** for database operations and RPC functions
- **OpenAI** for text embeddings (text-embedding-3-small)
- **TypeScript** for type safety
- **Vercel** for serverless deployment

## Database Schema

The server connects to two Supabase databases:

1. **Primary Database**: Social media monitoring, events, actors
2. **Campaign Finance Database**: Legislative data, donations, bills, votes

Key tables include:
- `bills` - Legislative bills with embeddings
- `cf_transactions` - Campaign finance transactions
- `cf_transaction_entities` - Donor entities with embeddings
- `rts_positions` - Request to Speak positions
- `legislators` - Legislator information
- `sessions` - Legislative sessions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

ISC License - see package.json for details.

## Support

For issues and questions:
1. Check the deployment logs in Vercel
2. Test individual tools with MCP Inspector
3. Verify environment variables
4. Check Supabase connection status