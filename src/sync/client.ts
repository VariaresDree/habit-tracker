import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// Sync is optional: with no credentials the app stays exactly as it was —
// fully usable, local-only. Tests run in this mode unless they mock it.
export function isSyncConfigured(): boolean {
  return !!url && !!key;
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSyncConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  client ??= createClient(url!, key!, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}
