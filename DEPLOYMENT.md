# Vercel Deployment Guide

This guide will help you deploy the MCP server to Vercel and connect it to ChatGPT.

## Prerequisites

1. A Vercel account (free tier is sufficient)
2. Your Supabase project URLs and keys
3. An OpenAI API key

## Step 1: Deploy to Vercel

### Option A: Deploy from GitHub (Recommended)

1. **Push to GitHub:**
   ```bash
   cd express-mcp
   git add .
   git commit -m "Initial MCP server with campaign finance tools"
   git push origin migrate-from-tpusa
   ```

2. **Connect to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Select the `migrate-from-tpusa` branch
   - Vercel will auto-detect the settings

### Option B: Deploy with Vercel CLI

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Deploy:**
   ```bash
   cd express-mcp
   vercel
   ```

## Step 2: Configure Environment Variables

In your Vercel project dashboard:

1. Go to **Settings** → **Environment Variables**
2. Add these variables:

### Required Variables:
```
SUPABASE_URL=https://your-primary-project.supabase.co
SUPABASE_ANON_KEY=your_primary_anon_key
SUPABASE_SERVICE_KEY=your_primary_service_key

CAMPAIGN_FINANCE_SUPABASE_URL=https://your-cf-project.supabase.co
CAMPAIGN_FINANCE_SUPABASE_ANON_KEY=your_cf_anon_key
CAMPAIGN_FINANCE_SUPABASE_SERVICE_KEY=your_cf_service_key

OPENAI_API_KEY=sk-your_openai_api_key
```

3. **Important:** Mark service keys as "Production" only for security
4. Click "Save" for each variable

## Step 3: Redeploy

After adding environment variables:
1. Go to **Deployments** tab
2. Click the "..." menu on the latest deployment
3. Click "Redeploy"

## Step 4: Test the Deployment

Your MCP server will be available at:
```
https://your-project-name.vercel.app/mcp
```

Test it with a simple request:
```bash
curl -X POST https://your-project-name.vercel.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}'
```

## Step 5: Connect to ChatGPT

### Using MCP Inspector (Recommended for testing):

1. Go to [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)
2. Add a new server with URL: `https://your-project-name.vercel.app/mcp`
3. Test the connection and available tools

### Using Claude Desktop:

1. Open Claude Desktop
2. Go to **Settings** → **Developer**
3. Add MCP server:
   ```json
   {
     "mcpServers": {
       "woke-palantir": {
         "command": "npx",
         "args": ["@modelcontextprotocol/server-fetch", "https://your-project-name.vercel.app/mcp"]
       }
     }
   }
   ```

### Using ChatGPT (if MCP support is available):

1. In ChatGPT, look for MCP or plugin settings
2. Add server URL: `https://your-project-name.vercel.app/mcp`
3. Configure authentication if required

## Available Tools

Once connected, you'll have access to these tool categories:

### Weather Tools (from template):
- `get-alerts` - Weather alerts by state
- `get-forecast` - Weather forecast by coordinates

### Supabase Tools:
- `db-primary-ping` - Test primary database connection
- `db-secondary-ping` - Test secondary database connection

### Woke Palantir Tools:
- `run-sql-query` - Execute read-only SQL queries
- `get-filter-options` - Get available filter options
- `get-schools-involved` - List schools in education events

### Campaign Finance Tools:
- `session-window` - Compute session date windows
- `find-donors-by-name` - Search donors by name
- `recipient-entity-ids-for-legislator` - Get legislator entity IDs
- `search-donor-totals-window` - Main donor analysis tool
- `search-bills-for-legislator` - Bills voted on by legislator
- `get-bill-text` - Get bill details and text
- `get-bill-votes` - Get voting records
- `get-bill-vote-rollup` - Vote tallies
- `search-rts-by-vector` - RTS positions by similarity
- `resolve-legislator-by-name` - Resolve legislator names
- `search-bill-embeddings` - Search bill embeddings
- `search-donor-embeddings` - Search donor embeddings
- `search-rts-embeddings` - Search RTS embeddings
- `get-session-info` - Legislative session info
- `get-bill-documents` - Bill documents
- `get-bill-sponsors` - Bill sponsors
- `get-transaction-groups` - Transaction categories
- `get-entity-details` - Campaign finance entity details

## Troubleshooting

### Common Issues:

1. **Environment Variables Not Working:**
   - Ensure variables are set in Vercel dashboard
   - Redeploy after adding variables
   - Check variable names match exactly

2. **Build Failures:**
   - Check Vercel build logs
   - Ensure all dependencies are in package.json
   - Verify TypeScript compilation

3. **Connection Issues:**
   - Verify the `/mcp` endpoint is accessible
   - Check CORS settings
   - Test with curl first

4. **Database Connection Issues:**
   - Verify Supabase URLs and keys
   - Check RLS policies
   - Test with ping tools first

### Getting Help:

- Check Vercel deployment logs
- Test individual tools with MCP Inspector
- Verify environment variables are set correctly
- Check Supabase connection from Vercel functions

## Security Notes

- Service keys are marked as Production-only in Vercel
- Never commit API keys to Git
- Use environment variables for all sensitive data
- Consider IP restrictions for Supabase if needed
