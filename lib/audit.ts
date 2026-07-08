import type { SupabaseClient } from "@supabase/supabase-js";

type RiskLevel = "low" | "medium" | "high" | "critical";

// Append-only audit trail (docs/SECURITY.md): every DB write / external call
// records a row. Failures are swallowed — auditing must never break the flow.
export async function writeAuditLog(
  supabase: SupabaseClient,
  entry: {
    action: string;
    entity_type?: string;
    entity_id?: string;
    user_id?: string | null;
    detail?: Record<string, unknown>;
    risk_level?: RiskLevel;
  },
) {
  try {
    await supabase.from("audit_logs").insert({
      action: entry.action,
      entity_type: entry.entity_type ?? null,
      entity_id: entry.entity_id ?? null,
      user_id: entry.user_id ?? null,
      detail: entry.detail ?? {},
      risk_level: entry.risk_level ?? "low",
    });
  } catch (e) {
    console.error("audit_log write failed", entry.action, e);
  }
}
