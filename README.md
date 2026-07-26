# Livestock ERP — Phase 1 + Phase 2 MVP

Offline-first dairy farm management PWA. Built with Next.js, Supabase, and Dexie (IndexedDB).

See `SETUP_GUIDE.docx` for full, non-technical, step-by-step instructions to deploy this
(Supabase project, schema, Twilio SMS login, Vercel hosting, installing on a phone).

## Database setup

Run, in order, in the Supabase SQL Editor:
1. `supabase/schema.sql` — full schema (Phase 1 + Phase 2, all in one file for fresh installs)

If you already deployed Phase 1 previously and are only now adding Phase 2, instead run just:
2. `supabase/migrations/002_breeding_reminders.sql`
3. `supabase/migrations/003_customer_ledger.sql`

## What's implemented

### Phase 1
- Phone + OTP sign-in, once, then offline PIN unlock on that device
- Farm onboarding wizard, animal registration
- Offline milk entry, health logging (Swahili/English picklist), feed logging
- Manual cost/revenue entry with a live profit dashboard
- Team/role management, installable PWA, tiered offline sync queue

### Phase 2 (this update)
- **Breeding & Calving Calendar** — offline heat/service/pregnancy-check logging from
  Worker → Breeding; Manager → Breeding dashboard shows in-app reminders (next heat window,
  overdue pregnancy check, calving due within 14 days). When the calf is registered from
  Worker → Animal → Birth, the app auto-suggests the dam from confirmed pregnancies and, on
  save, closes her breeding record and flips her status to lactating — no separate step needed.
  Manager → Breeding also has a manual "record calving" fallback for stillbirths or phoned-in
  reports where no calf is being tagged.
- **Per-Animal Profitability** — Manager → Profitability ranks every animal by profit over the
  last 30/90 days (feed + vet costs are exact per-animal; milk revenue is fairly allocated by
  litres produced, since milk is usually sold in bulk).
- **Customer/Debtor Ledger** — Manager → Customers tracks milk buyers, deliveries, payments,
  running balances, and a per-customer statement. Deliveries auto-post to the revenue table via
  a database trigger, so the finance dashboard and profitability numbers stay in sync automatically.

## What's still postponed (per current scope)

SMS alerts, M-Pesa integration, multi-farm support, advanced analytics.

## Local development

```bash
npm install
cp .env.local.example .env.local   # fill in your Supabase URL + anon key
npm run dev
```

## Project structure

```
app/manager/breeding/            Breeding & calving reminders dashboard
app/manager/profitability/       Per-animal profit ranking
app/manager/customers/           Debtor ledger (list + per-customer statement)
app/worker/breeding/             Offline heat / service / pregnancy-check entry
supabase/schema.sql              Full schema (run this for a fresh install)
supabase/migrations/             Incremental migrations (for upgrading an existing install)
```
