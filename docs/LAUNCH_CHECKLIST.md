# First pilot checklist

Completed locally:
- [x] React production build and syntax/client-secret checks.
- [x] Migration/RLS tests in a PostgreSQL-compatible engine.
- [x] Cross-business access denial and service-only job mutation checks.
- [x] MYT quiet hours, weekdays, lease and retry-window tests.
- [x] Money validation, template validation and reminder cancellation.
- [x] Signed webhook acceptance/rejection with fictional payloads.
- [x] DOM-based customer/quote creation, navigation, reply recording, rules and account checks.

Before a real pilot:
- [ ] Interview five renovation business owners; record evidence and validate email usefulness.
- [ ] Create the actual Supabase project in Singapore and apply the migration.
- [ ] Test signup, confirmation, login, logout and account recovery with hosted Supabase.
- [ ] Verify tenant isolation with two actual signed-in accounts.
- [ ] Deploy Express and the always-on hourly worker; configure health monitoring and restarts.
- [ ] Configure sending/receiving DNS and webhook secrets; test only your own email first.
- [ ] Confirm provider acceptance, reply cancellation, bounce suppression and failed delivery behavior.
- [ ] Test crash after provider acceptance but before DB completion, and two concurrent workers.
- [ ] Check operator handling of `failed` and `needs_review` without blind resend.
- [ ] Inspect desktop/mobile layouts, keyboard focus and native dialogs in actual browsers. Browser preview was interrupted during this build.
- [ ] Confirm reminders stay inside Malaysian business hours and overdue messages do not bunch up.
- [ ] Define privacy notice, customer permission process, retention, deletion and support contact.
- [ ] Review dependency advisories, Supabase/email hosting costs and backup/recovery policy.
- [ ] Add pagination and SQL dashboard aggregates before larger datasets.
- [ ] Select project license and finalize branding before public release.

Later: WhatsApp integration and approved templates, team memberships, reporting, attachments/PDF generation, billing, queue scaling. These are not included in v0.1 and should not be advertised as implemented.
