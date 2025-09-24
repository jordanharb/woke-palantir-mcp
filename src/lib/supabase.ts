import { createClient, SupabaseClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

// Primary database: prefer new vars, fall back to original project vars
const PRIMARY_URL = process.env.SUPABASE_PRIMARY_URL || process.env.SUPABASE_URL;
const PRIMARY_ANON = process.env.SUPABASE_PRIMARY_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const PRIMARY_SERVICE = process.env.SUPABASE_PRIMARY_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

export const supabasePrimary: SupabaseClient = createClient(
  PRIMARY_URL || requireEnv("SUPABASE_PRIMARY_URL"),
  PRIMARY_ANON || requireEnv("SUPABASE_PRIMARY_ANON_KEY")
);

// Secondary database (campaign finance): prefer new vars, fall back to CAMPAIGN_FINANCE_*
const SECONDARY_URL = process.env.SUPABASE_SECONDARY_URL || process.env.CAMPAIGN_FINANCE_SUPABASE_URL;
const SECONDARY_ANON = process.env.SUPABASE_SECONDARY_ANON_KEY || process.env.CAMPAIGN_FINANCE_SUPABASE_ANON_KEY;
const SECONDARY_SERVICE = process.env.SUPABASE_SECONDARY_SERVICE_ROLE_KEY || process.env.CAMPAIGN_FINANCE_SUPABASE_SERVICE_KEY;

export const supabaseSecondary: SupabaseClient = createClient(
  SECONDARY_URL || requireEnv("SUPABASE_SECONDARY_URL"),
  SECONDARY_ANON || requireEnv("SUPABASE_SECONDARY_ANON_KEY")
);

export const supabasePrimaryService: SupabaseClient | null = PRIMARY_SERVICE
  ? createClient(PRIMARY_URL || requireEnv("SUPABASE_PRIMARY_URL"), PRIMARY_SERVICE)
  : null;

export const supabaseSecondaryService: SupabaseClient | null = SECONDARY_SERVICE
  ? createClient(SECONDARY_URL || requireEnv("SUPABASE_SECONDARY_URL"), SECONDARY_SERVICE)
  : null;


