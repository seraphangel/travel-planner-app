import { isDemoPlan } from "@/lib/types";

/**
 * Admin accounts are identified by email against the ADMIN_EMAILS env var
 * (comma-separated). Admins bypass paid gates for testing — the free-plan
 * quota and the AI-poster purchase requirement. This is the single source of
 * truth; layouts and pages should call this rather than re-parsing the env.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}

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
