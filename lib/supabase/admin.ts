import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cookie-free Supabase client for server-side jobs (webhooks, payment
 * verification) that run outside a user session. Uses the service-role key
 * when configured; falls back to the anon key, which is sufficient under the
 * permissive v1 RLS policies.
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
