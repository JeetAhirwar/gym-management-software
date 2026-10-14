# Pulse Gym Suite

A premium, responsive gym management system with **QR-code attendance** at its core — memberships, payments & receipts, trainers, classes, reports and notifications, all backed by your own Supabase (Postgres + Auth + RLS) project.

Dark graphite UI with volt-yellow accents, paper-inspired editorial textures and subtle motion — built for a real front desk, not a demo reel.

## Tech stack

| Layer | Choice |
| --- | --- |
| App | React 19 + TypeScript (strict) + Vite 7 |
| Styling | Tailwind CSS v4 + shadcn/ui + design tokens in `src/index.css` |
| Data | Supabase (Postgres, Auth, RLS) behind a single `DataService` interface |
| Forms | React Hook Form + Zod |
| Charts / motion / icons | Recharts, Motion (`motion/react`), Lucide |
| QR | `qrcode` (cards) + `html5-qrcode` (camera scanning) |
| Routing / toasts / dates | React Router, Sonner, date-fns |

## Features

- **QR attendance end-to-end** — opaque random tokens (no personal data in the QR), server-side validation via the `record_attendance` RPC (advisory lock + unique minute index for concurrency), cooldown / duplicate prevention, explicit rejection reasons, printable membership cards, QR revoke & regenerate.
- **Members** — directory with search/filter/sort, profiles, membership history, renewals, attendance and payment trails.
- **Membership plans** — pricing in INR, durations, benefits, archive/reactivate.
- **Payments & fees** — record payments, dues ledger, printable receipts, refunds, revenue summaries.
- **Trainers & staff** — directory, roles, employment status.
- **Classes & schedule** — weekly planner, capacity, enrolments.
- **Reports & analytics** — attendance summary, peak hours, top members, revenue, plan mix, CSV export.
- **Notifications** — expiry warnings, pending dues, check-in events, one-click rebuild.
- **Settings** — gym profile, check-in policy (cooldown, checkout tracking, reminders), audit trail.
- **Roles** — owner / admin / front desk / trainer. Client-side gating is UX only; the real enforcement lives in Postgres RLS policies and `SECURITY DEFINER` RPCs.

## Getting started

```bash
npm install
cp .env.example .env   # then fill in your Supabase values
npm run dev            # http://localhost:5173
```

### Environment (`.env`)

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon/publishable key>
VITE_DEMO_MODE=false
VITE_GYM_TIMEZONE=Asia/Kolkata
VITE_GYM_NAME=Pulse Fitness Studio
```

All `VITE_*` values are **public** (bundled into the browser build). Never put a service-role key in this project — RLS is the security boundary.

### Database

Migrations live in `supabase/migrations/` (idempotent, safe to re-run):

```bash
npx supabase@latest link --project-ref <project-ref>
npx supabase db push
```

Optional demo seed (clearly labelled `DEMO-*` records):

```bash
npx supabase db reset   # or run supabase/seed.sql from the SQL editor
```

See [`supabase/README.md`](supabase/README.md) for the first-owner bootstrap and security notes.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Typecheck + production build (`dist/`) |
| `npm run preview` | Preview the production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest suite |

## Deployment (Vercel)

1. Import the repository — Vercel detects Vite automatically.
2. Add the environment variables from `.env.example` (project URL + anon key, `VITE_DEMO_MODE=false`, timezone, gym name).
3. Deploy. `vercel.json` already contains the SPA rewrite required by React Router.

## Project structure

```
src/
  components/   # layout shell, shared pieces, shadcn/ui primitives
  pages/        # one folder per module (members, attendance, plans, ...)
  data/         # DataService contract + Supabase & offline demo implementations
  auth/         # session provider and route guards
  lib/          # formatting, validation, permissions, QR, membership math
  types/        # shared domain models
supabase/
  migrations/   # schema, RPCs, RLS policies
  seed.sql      # optional demo data
```

## Security notes

- Row-level security is enabled on every table; there are no permissive policies.
- Attendance is written **only** through the `record_attendance` RPC — clients cannot insert attendance rows.
- QR tokens are opaque random hex; rotating a token revokes the old one instantly.
- `numeric` for money (never float), `timestamptz` for time, gym-timezone-aware “today”.
