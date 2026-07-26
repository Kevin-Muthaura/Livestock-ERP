# Livestock ERP — Phase 1 MVP

Offline-first dairy farm management PWA. Built with Next.js, Supabase, and Dexie (IndexedDB).

See `SETUP_GUIDE.docx` (provided alongside this project) for full, non-technical, step-by-step
instructions to get this running — creating your free Supabase project, running the database
schema, deploying to Vercel, and installing it on a phone.

## What's implemented (Phase 1, per the architecture doc's roadmap)

- Phone + OTP sign-in, once, then offline PIN unlock on that device
- Farm onboarding wizard
- Animal registration (birth / purchase / transfer-in)
- Offline-capable daily milk entry (stepper UI, morning/evening shifts)
- Health logging from a Swahili/English diagnosis picklist
- Feed logging with automatic cost posting
- Manual cost/revenue entry with a live profit dashboard
- Team/role management (Admin, Manager, Worker, Vet, Accountant)
- Installable PWA (works on any Android phone via Chrome, no app store)
- Full offline write queue with tiered sync priority (financial/health -> milk -> reference data)

## What's next (Phase 2/3, per Section I of the architecture doc)

Breeding & calving calendar, per-animal profitability engine, customer/debtor invoicing,
animal-group milking, SMS fallback alerts, M-Pesa integration, data export for SACCO loans.

## Local development

```bash
npm install
cp .env.local.example .env.local   # fill in your Supabase URL + anon key
npm run dev
```

## Project structure

```
app/                  Next.js App Router pages (worker screens, manager dashboard)
components/           Shared UI (BigButton, PendingBadge, SyncInit)
lib/                   auth.js, db.js (Dexie), sync.js (offline queue), refreshCache.js
supabase/schema.sql    Full Postgres schema + Row Level Security -- run this in Supabase
supabase/functions/    Edge Function(s) for server-side logic (profitability, Phase 2+)
public/manifest.json   PWA manifest (installable home-screen app)
public/sw.js           Service worker
```
