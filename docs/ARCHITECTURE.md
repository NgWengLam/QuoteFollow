# Architecture and trust boundaries

React uses Supabase Auth and a public anon key. RLS filters reads to the signed-in owner's business. Customers have restricted column grants; quotations, rules and status changes use authenticated SQL functions that verify ownership. The server-only service key is held by Express and the scheduler and never included in the browser bundle.

## Data flow

1. Owner signs in; `onboard_business` creates one business bound to `auth.uid()`.
2. Customer insert/update uses RLS. The customer must be in the same business as a quote (composite foreign key).
3. `save_quote` validates items and computes the amount in cents, then atomically creates reminder snapshots.
4. The hourly Node worker claims the earliest eligible step per quote with `FOR UPDATE SKIP LOCKED` and a claim token/lease. Failed/uncertain earlier steps block later ones.
5. The worker builds plain-text content; `prepare_reminder` rechecks state and freezes the provider payload. Subsequent attempts retain the original payload and idempotency key.
6. Resend accepts or rejects the send; `finish_reminder` atomically updates the reminder and inserts one log. Timeouts are treated as unknown outcomes.
7. Signed inbound webhooks match the random quote reply address and sender, deduplicate by event ID, record a reply summary, and cancel pending jobs.
8. Accepted/rejected/no-reply/manual-reply transitions cancel future jobs in the same database transaction.

## Source-to-deployment boundaries

- Static React frontend: private hosted demo supplied; live builds need Supabase public settings.
- Express API: separate Node process/host, authenticates readiness endpoint and handles raw signed webhook bodies.
- Worker: separate long-lived Node process using node-cron. It has no public trigger endpoint.
- Supabase: Auth plus PostgreSQL in Singapore selected by the owner.
- Resend: verified sending/receiving domain; provider stores emails independently from this application's database.

The current v1 is single-owner multi-tenant. Adding teammates needs a membership table and membership-based RLS, not a frontend-only role flag. Payment entitlements should be implemented server-side; they must not alter tenant isolation.

## Reliability limits

Database locks prevent two workers from claiming the same active job, but the email API and database cannot commit atomically. The 10-minute claim lease permits recovery, and the provider key deduplicates attempts during its retention window. The app stops retries before 24 hours and requires operator reconciliation. A signed delivery event can arrive before the outbound log exists; the v1 bounce handler should be monitored and reconciled against provider records. Stronger event inbox reconciliation is a next hardening step before a larger rollout.

Stopping a quote cannot retract an already submitted email. A reply from an alternate address cannot automatically be trusted as the original recipient; use manual recording. A scheduler outage delays messages until recovery; it never bypasses quiet hours. Supabase or provider outages are not concealed as successful deliveries.

## Data handling

Real workspace data stays in Supabase and the configured email provider. Demo data stays in browser session storage. There are no analytics scripts, file uploads or customer-data logs in server console output. The UI font stylesheet currently loads from Google Fonts; remove or self-host it if you require no third-party font requests. Define retention/deletion, customer notice and operational access before real deployment.
