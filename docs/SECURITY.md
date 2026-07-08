# Security — Travel Planner App

## Secret Handling
- `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` — server-side only, stored in Vercel environment variables, never in client bundle or committed to git
- Frontend only receives `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (safe by design)
- Stripe webhook endpoint verifies signature before processing any payload

## Permission Model
- **v1 (demo):** Permissive RLS — all rows readable and writable without auth; safe because no PII and no user-specific secrets yet
- **Lock-down sprint:** RLS policies replaced with `auth.uid() = user_id` — users can only read/write their own plans, recommendations, and subscriptions
- **Admin role:** Separate Supabase role with service-key access; admin pages server-rendered with role check
- Agents (API routes) inherit the calling user's session — no elevated permissions beyond what the user holds

## Approved Tools Rule
- Only named tools in `AGENTIC_LAYER.md` may be called from API routes
- No `eval`, no dynamic `run_any`, no raw shell execution
- All outbound calls (OpenAI, Stripe) go through typed server-side wrappers

## Audit Principle
- Every action that writes to the DB or calls an external API inserts a row into `audit_logs`
- `risk_level` field gates human review: `high` and `critical` entries surfaced in admin panel
- Logs are append-only; no application-level delete on `audit_logs`

## Stop and Get Help
- Refunds, account deletion, and GDPR requests: do not build app-side automation — handle manually in Stripe dashboard and Supabase until a compliance review is done
