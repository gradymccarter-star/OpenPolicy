import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { OverallScore } from '@/lib/utils/types';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
    }
    client = createClient(url, key, {
      auth: { persistSession: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      },
    });
  }
  return client;
}

// Supabase embeds FK relations as arrays; this pulls out the single-row overall_scores embed
export function extractOverallScore(row: any): OverallScore | null {
  if (!row.overall_scores) return null;
  const os = Array.isArray(row.overall_scores) ? row.overall_scores[0] : row.overall_scores;
  return os ?? null;
}
