import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Regeneration cost caps. Every AI generation is audit-logged per plan, so
 * enforcement is a count against env-tunable limits:
 *
 *   REGEN_DAY_FREE  (default 3)  single-day drafts on a locked (unpaid) plan
 *   REGEN_DAY_PAID  (default 15) single-day drafts on an unlocked plan
 *   REGEN_FULL_FREE (default 2)  full generations on a locked plan (incl. the first)
 *   REGEN_FULL_PAID (default 5)  full generations on an unlocked plan
 *
 * Worst-case COGS at defaults: free plan ≈ $0.57, paid plan ≈ $1.50 against
 * $19 revenue. Admin accounts (ADMIN_EMAILS) bypass all caps for testing.
 */

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function dayRegenLimit(unlocked: boolean): number {
  return unlocked ? envInt("REGEN_DAY_PAID", 15) : envInt("REGEN_DAY_FREE", 3);
}

export function fullRegenLimit(unlocked: boolean): number {
  return unlocked ? envInt("REGEN_FULL_PAID", 5) : envInt("REGEN_FULL_FREE", 2);
}

/** Count audit entries of one action for a plan (audit_logs is append-only). */
export async function countPlanAudits(
  supabase: SupabaseClient,
  planId: string,
  action: string,
): Promise<number> {
  const { count } = await supabase
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("entity_id", planId)
    .eq("action", action);
  return count ?? 0;
}
