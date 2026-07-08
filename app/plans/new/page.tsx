import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewPlanForm from "./NewPlanForm";

// Plan creation is gated behind auth (Sprint 3): anonymous visitors are sent
// to sign-up and returned here afterwards. Demo plans stay public.
export default async function NewPlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/signup?next=${encodeURIComponent("/plans/new")}`);
  }

  return <NewPlanForm />;
}
