-- Sprint 3 lock-down: replace permissive v1 policies with owner-scoped RLS.
--
-- ⚠️ APPLY ONLY AFTER SUPABASE_SERVICE_ROLE_KEY is set in the Vercel env.
-- Server-side flows that act outside a user session (Stripe webhook unlock,
-- payment verification, admin) run on the service-role client and bypass RLS;
-- without that key configured they would run on the anon key and break.
--
-- Rows created before auth existed have user_id IS NULL and stay readable so
-- previously shared plan links keep working. Demo plans are flagged is_demo.

alter table travel_plans add column if not exists is_demo boolean not null default false;

update travel_plans set is_demo = true where id in (
  'b1000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000002',
  'b1000000-0000-0000-0000-000000000003'
);

-- ── destinations ─────────────────────────────────────────────────────────────
drop policy if exists "destinations_v1_read" on destinations;
drop policy if exists "destinations_v1_write" on destinations;
create policy "destinations_read" on destinations for select
  using (user_id is null or auth.uid() = user_id);
create policy "destinations_insert" on destinations for insert
  with check (auth.uid() = user_id);

-- ── travel_plans ─────────────────────────────────────────────────────────────
drop policy if exists "travel_plans_v1_read" on travel_plans;
drop policy if exists "travel_plans_v1_write" on travel_plans;
create policy "travel_plans_read" on travel_plans for select
  using (is_demo or user_id is null or auth.uid() = user_id);
create policy "travel_plans_insert" on travel_plans for insert
  with check (auth.uid() = user_id);
create policy "travel_plans_update_own" on travel_plans for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── plan_recommendations ─────────────────────────────────────────────────────
drop policy if exists "plan_recommendations_v1_read" on plan_recommendations;
drop policy if exists "plan_recommendations_v1_write" on plan_recommendations;
create policy "plan_recommendations_read" on plan_recommendations for select
  using (exists (
    select 1 from travel_plans p
    where p.id = plan_recommendations.travel_plan_id
      and (p.is_demo or p.user_id is null or auth.uid() = p.user_id)
  ));
create policy "plan_recommendations_write_own" on plan_recommendations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── itinerary_days ───────────────────────────────────────────────────────────
drop policy if exists "itinerary_days_v1_read" on itinerary_days;
drop policy if exists "itinerary_days_v1_write" on itinerary_days;
create policy "itinerary_days_read" on itinerary_days for select
  using (exists (
    select 1 from travel_plans p
    where p.id = itinerary_days.travel_plan_id
      and (p.is_demo or p.user_id is null or auth.uid() = p.user_id)
  ));
create policy "itinerary_days_write_own" on itinerary_days for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── subscriptions ────────────────────────────────────────────────────────────
-- Reads: owner only. Writes: service role only (checkout + webhook).
drop policy if exists "subscriptions_v1_read" on subscriptions;
drop policy if exists "subscriptions_v1_write" on subscriptions;
create policy "subscriptions_read_own" on subscriptions for select
  using (auth.uid() = user_id);

-- ── audit_logs ───────────────────────────────────────────────────────────────
-- Append-only from the app; reads via service role (admin) only.
drop policy if exists "audit_logs_v1_read" on audit_logs;
drop policy if exists "audit_logs_v1_write" on audit_logs;
create policy "audit_logs_insert" on audit_logs for insert with check (true);
