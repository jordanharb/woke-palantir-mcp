# Environment Variables

This document lists all required environment variables for the MCP server.

## Required Variables

### Primary Supabase Database
```env
SUPABASE_URL=https://your-primary-project.supabase.co
SUPABASE_ANON_KEY=your_primary_anon_key
SUPABASE_SERVICE_KEY=your_primary_service_key
```

### Secondary Supabase Database (Campaign Finance)
```env
CAMPAIGN_FINANCE_SUPABASE_URL=https://your-cf-project.supabase.co
CAMPAIGN_FINANCE_SUPABASE_ANON_KEY=your_cf_anon_key
CAMPAIGN_FINANCE_SUPABASE_SERVICE_KEY=your_cf_service_key
```

### OpenAI API (for embeddings)
```env
OPENAI_API_KEY=sk-your_openai_api_key
```

### Server Configuration
```env
PORT=3000
```

## Alternative Variable Names

The server also supports these alternative variable names for compatibility:

### Primary Database (Alternative)
```env
SUPABASE_PRIMARY_URL=https://your-primary-project.supabase.co
SUPABASE_PRIMARY_ANON_KEY=your_primary_anon_key
SUPABASE_PRIMARY_SERVICE_ROLE_KEY=your_primary_service_key
```

### Secondary Database (Alternative)
```env
SUPABASE_SECONDARY_URL=https://your-cf-project.supabase.co
SUPABASE_SECONDARY_ANON_KEY=your_cf_anon_key
SUPABASE_SECONDARY_SERVICE_ROLE_KEY=your_cf_service_key
```

## Local Development

Create a `.env` file in the project root with the above variables:

```bash
# Copy this template and fill in your values
cp ENVIRONMENT_VARIABLES.md .env
# Then edit .env with your actual values
```

## Vercel Deployment

Set these environment variables in your Vercel project settings:

1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Add each variable above
4. Mark service keys as "Production" only for security

## Notes

- The server will use the original variable names (`SUPABASE_URL`, `CAMPAIGN_FINANCE_SUPABASE_URL`) if the new names are not set
- OpenAI API key is required for vector similarity searches
- Service keys are needed for RPC function calls
- Anon keys are used for basic database queries
