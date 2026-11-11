# QuoteFollow

**Automatic follow-up emails for quotations.**

Small businesses (for example, renovation contractors in Malaysia) send quotations and then forget to follow up. QuoteFollow records each quotation you send and emails the customer polite reminders on a schedule (for example, Day 3, Day 7 and Day 14). When the customer replies, the remaining reminders stop by themselves.

> Status: working MVP (v0.1). Tested end to end with real emails in a local test setup. Not deployed to production yet.

---

## Contents

1. [Features](#features)
2. [How it works](#how-it-works)
3. [Tech stack](#tech-stack)
4. [Option A: Try the demo (2 minutes, no accounts needed)](#option-a-try-the-demo)
5. [Option B: Full setup with real emails](#option-b-full-setup-with-real-emails)
6. [Test that everything works](#test-that-everything-works)
7. [Run the automated tests](#run-the-automated-tests)
8. [Project structure](#project-structure)
9. [Limits and next steps](#limits-and-next-steps)

---

## Features

- **Sign up and log in** (Supabase Auth). Each business only sees its own data.
- **Customers**: add and edit contacts, with an "agreed to receive emails" checkbox.
- **Quotations**: line items, quantities and prices, with the total calculated automatically. Statuses are Pending, Accepted, Rejected and No reply.
- **Follow-up schedule**: up to 5 reminders, each with its own day and message. Templates come in English, Bahasa Melayu and Chinese.
- **Automatic sending**: emails go out only during business hours in Malaysia time (default Monday to Friday, 9:00 to 18:00).
- **Reply detection**: when the customer replies to a follow-up email, the reply is recorded and the remaining reminders are cancelled.
- **Auto stop**: marking a quote Accepted, Rejected or No reply also cancels its remaining reminders.
- **Archive**: works for any quotation. It cancels pending reminders and moves the quote to the "Archived" tab. Unarchive brings the quote back, but cancelled reminders stay cancelled.
- **Delete**: only allowed for quotations with no sent emails, so email history is never lost.
- **WhatsApp button**: each reminder has a green WhatsApp button. It opens WhatsApp with the customer's number and the follow-up message already typed in, and you press Send yourself. This is free and needs no Meta account. Malaysian numbers like `012-345 6789` are converted to `60123456789` automatically.
- **Bounce protection**: if an email bounces or is marked as spam, no more emails go to that contact.
- **Dashboard**: pending value, follow-ups due today, accepted work and customer count.

## How it works

```
 Browser (React)  ──reads/writes──▶  Supabase (database + login)
                                          ▲
 Worker (runs every hour) ─── finds due reminders ───┘
        │
        └──sends email──▶ Resend ──▶ Customer inbox
                                          │ customer clicks "Reply"
 Express API ◀──webhook── Resend ◀────────┘
        │
        └── records reply + cancels remaining reminders in Supabase
```

- **Frontend** (`src/`): the website you click around in.
- **Database** (`supabase/migrations/`): tables, security rules and functions. Each business can only access its own rows.
- **Worker** (`server/worker.js`): runs at the start of every hour and sends reminders that are due.
- **API** (`server/app.js`): receives "customer replied" and "email bounced" events from Resend.

## Tech stack

| Part | Tool |
|---|---|
| Frontend | React 19 + Vite |
| Database and login | Supabase (PostgreSQL + Auth) |
| Backend API | Node.js 22 + Express |
| Email sending and receiving | Resend |
| Scheduler | node-cron |
| Public URL for local testing | Cloudflare Quick Tunnel |
| Tests | Node test runner, PGlite (in-memory PostgreSQL), jsdom |

---

## Option A: Try the demo

No accounts or keys needed. It uses made-up data and **never sends real emails**.

**You need:** [Node.js 22 or newer](https://nodejs.org)

```bash
git clone https://github.com/YOUR_USERNAME/quotefollow.git
```

```bash
cd quotefollow
```

```bash
npm ci
```

```bash
npm run dev
```

Open **http://localhost:4173**. The demo starts automatically.

---

## Option B: Full setup with real emails

This setup sends real emails and detects real replies. It takes about 30 minutes.

**You need:**
- Node.js 22 or newer
- A free [Supabase](https://supabase.com) account
- A free [Resend](https://resend.com) account
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) installed (free, no Cloudflare account needed for a Quick Tunnel)

### Step 1: Download and install

```bash
git clone https://github.com/YOUR_USERNAME/quotefollow.git
```

```bash
cd quotefollow
```

```bash
npm ci
```

```bash
cp .env.example .env
```

You will fill in `.env` in the next steps. **Never upload `.env` to GitHub.** It holds secret keys, and `.gitignore` already keeps it out.

### Step 2: Set up Supabase (database + login)

1. In Supabase, click **New project**. Pick the **Singapore** region.
2. Open **SQL Editor**, then **New query**. Paste in all of `supabase/migrations/001_initial.sql` and click **Run**.
3. Do the same with `supabase/migrations/002_archive_delete.sql`. Run each file **once**, in order.
4. Go to **Authentication**, then **URL Configuration**. Set **Site URL** to `http://localhost:4173`.
5. Go to **Project Settings**, then **API**. Copy the values into `.env`:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

> The `service_role` key has full access to the database. Only put it in `SUPABASE_SERVICE_ROLE_KEY`. Never put it in a variable that starts with `VITE_`.

### Step 3: Set up Resend (email)

1. In Resend, go to **API Keys** and create a key. Put it in `.env`:
   ```
   RESEND_API_KEY=re_xxxxxxxx
   ```
2. **Sender address.** For testing, use Resend's test sender:
   ```
   EMAIL_FROM=QuoteFollow <onboarding@resend.dev>
   ```
   With the test sender, Resend only delivers to **your own Resend account email**. So for testing, give the customer that email address. To email real customers, verify your own domain in Resend (**Domains**, then **Add Domain**) and use an address on it.
3. **Receiving replies.** Go to **Receiving** in Resend and copy your free inbound address domain (it looks like `something.resend.app`). Put **only the domain part** in `.env`:
   ```
   REPLY_DOMAIN=something.resend.app
   ```
   Each quotation gets its own reply address, `quote+<random-id>@something.resend.app`. That is how a reply gets matched to the right quotation.

### Step 4: Start the API and open a public tunnel

Resend has to reach your computer to report replies. A Cloudflare Quick Tunnel gives your local API a temporary public URL.

**Terminal 1**, start the API (port 3001):
```bash
npm run start:api
```

**Terminal 2**, start the tunnel:
```bash
cloudflared tunnel --url http://localhost:3001
```

It prints a URL like `https://random-words.trycloudflare.com`. Copy it.

> A Quick Tunnel URL **changes every time you restart cloudflared**. When it changes, update the webhook URL in Step 5.

### Step 5: Connect the Resend webhook

1. In Resend, go to **Webhooks**, then **Add Webhook**.
2. URL: `https://random-words.trycloudflare.com/api/webhooks/email`
3. Events: tick `email.received`, `email.bounced` and `email.complained`.
4. Save, then copy the **Signing secret** into `.env`:
   ```
   RESEND_WEBHOOK_SECRET=whsec_xxxxxxxx
   ```
5. Turn sending on in `.env`:
   ```
   EMAIL_SEND_ENABLED=true
   ```
6. Stop the API (Ctrl + C in Terminal 1) and start it again so it loads the new values:
   ```bash
   npm run start:api
   ```

### Step 6: Start the worker and the website

**Terminal 3**, the email worker:
```bash
npm run start:worker
```

**Terminal 4**, the website:
```bash
npm run dev
```

Open **http://localhost:4173**, sign up, confirm your email, log in and enter a business name.

**Summary: 4 terminals stay open while testing.**

| Terminal | Command | What it does |
|---|---|---|
| 1 | `npm run start:api` | Receives reply and bounce events |
| 2 | `cloudflared tunnel --url http://localhost:3001` | Public URL for the API |
| 3 | `npm run start:worker` | Sends due emails every hour |
| 4 | `npm run dev` | The website |

### Your finished `.env` should look like this

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_URL=http://localhost:3001
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
APP_ORIGIN=http://localhost:4173
PORT=3001
RESEND_API_KEY=re_...
EMAIL_FROM=QuoteFollow <onboarding@resend.dev>
REPLY_DOMAIN=something.resend.app
RESEND_WEBHOOK_SECRET=whsec_...
EMAIL_SEND_ENABLED=true
```

---

## Test that everything works

### Test 1: A follow-up email is sent
1. Go to **Account settings**, tick **Enable automatic follow-ups for this business**, and save.
2. Go to **Customers** and add a customer with **your own email**. Tick the permission box.
3. Go to **Quotations**, then **New quotation**. Set the **sent date** to a date in the past (for example, 7 days ago) so that a reminder is already due. Turn follow-ups on and save.
4. Wait for the next full hour (for example, 10:00). The worker only runs **at the start of each hour**, and only **inside business hours** (default Monday to Friday, 9:00 to 18:00 Malaysia time).
5. ✅ The email arrives in your inbox, and the quotation's **Message history** shows it.

### Test 2: A reply stops the remaining reminders
1. Reply to that email from the same inbox.
2. Click **Refresh** in the app.
3. ✅ **Message history** shows "Reply received", and the remaining reminders show **cancelled**.

### Test 3: WhatsApp button
1. Give a customer your own phone number (for example, `012-345 6789`) and tick the permission box.
2. Open one of their quotations and click the green **WhatsApp** icon next to a reminder.
3. ✅ WhatsApp opens with the follow-up message already typed in.

### Test 4: Archive and Delete
1. Open a quotation that has sent an email. ✅ Only **Archive** shows. There is no Delete button.
2. Click **Archive**. ✅ The remaining reminders become **cancelled**, and the quote moves to the **Archived** tab.
3. Create a new quotation dated today (no emails sent yet). ✅ **Delete** shows. Click it, and the quote is removed.

---

## Run the automated tests

```bash
npm run check
```

```bash
npm test
```

```bash
npm run build
```

There are 23 tests. They cover:
- Database security: one business cannot read or change another business's data.
- Money and date rules: Malaysia time, business hours and weekends.
- Email sending: retries, no duplicate sends, failure handling.
- Webhooks: fake (unsigned) events are rejected, and replies cancel reminders.
- Archive and Delete: archiving cancels reminders, and deleting is blocked once emails were sent.
- WhatsApp links: phone number conversion and message encoding.
- The user interface: creating customers and quotes, replies, archive and delete, settings.

The tests use fake data and never send real emails. GitHub Actions runs them on every push (`.github/workflows/verify.yml`).

---

## Project structure

| Path | What it is |
|---|---|
| `src/App.jsx` | Main app: pages, navigation and actions |
| `src/components/` | Screens: quote details, forms, settings, login |
| `src/data.js` | Loads data from Supabase |
| `src/demo.js` | Fake data for demo mode |
| `shared/domain.js` | Money, dates and template rules |
| `shared/followUpTemplates.js` | English, Malay and Chinese message templates |
| `server/app.js` | Express API and webhook handling |
| `server/delivery.js` | Sends emails through Resend |
| `server/worker.js` | Hourly scheduler |
| `supabase/migrations/001_initial.sql` | Tables, security rules and core functions |
| `supabase/migrations/002_archive_delete.sql` | Archive and Delete functions |
| `tests/` | Automated tests |
| `docs/` | Architecture notes and launch checklist |

---

## Limits and next steps

**Current limits**
- Automatic sending is email only. WhatsApp is a manual click-to-send button.
- One user per business, MYR currency only.
- The app records quotations you already sent. It does not create or send the quotation PDF itself.
- The Quick Tunnel URL changes on every restart, so it is only for testing.
- Supabase free projects pause after about 7 days of no activity.

**Next steps to go live**
1. Buy a domain and verify it in Resend, so emails can go to any customer.
2. Use a fixed URL for the API (a Cloudflare named tunnel or a hosting service) instead of a Quick Tunnel.
3. Host the API and worker on an always-on server, and the website on a static host (`npm run build` puts the website in `dist/`).
4. Automatic WhatsApp sending through the WhatsApp Business API (needs Meta business verification and approved message templates).

See `docs/LAUNCH_CHECKLIST.md` for the full pre-launch checklist.
