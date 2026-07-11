import { isDemoPlan } from "@/lib/types";

/**
 * A plan is editable by its owner. Plans created before auth existed
 * (user_id null) stay editable by anyone holding the link — consistent with
 * the v1 permissive model. Seeded demo plans are never editable.
 */
export function canEditPlan(
  plan: { id: string; user_id: string | null },
  userId: string | null | undefined,
): boolean {
  if (isDemoPlan(plan.id)) return false;
  if (plan.user_id === null) return true;
  return plan.user_id === userId;
}
