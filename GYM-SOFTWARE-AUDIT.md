# Gym Management Software — Feature Audit

**Date:** 14 October 2026 · **Scope:** full codebase (`backend-server/`, `frontend/`) · **Method:** static code inspection only; every finding below was confirmed against specific routes, models, or pages.

## Technology Stack

| Layer | Technology |
|---|---|
| Backend | Node.js (ESM) · Express 4 · Mongoose 8 · MongoDB (Atlas) · JWT (`jsonwebtoken`) + bcryptjs · Zod validation · 12 route modules, 14 models |
| Frontend | React 19 SPA · Vite 7 · React Router 7 · Tailwind CSS 4 + Radix UI · react-hook-form + Zod · Recharts · html5-qrcode / qrcode · motion · Sonner |
| Deploy | Vercel serverless (both projects, `vercel.json` rewrites) · single GitHub repo · `.env` excluded from git |

## Implemented Features (verified)

1. **Authentication & RBAC** — sign-in with email *or* member code + password; stateless JWT; five roles (`owner`, `admin`, `front_desk`, `trainer`, `member`); a hard server-side gate blocks member tokens from every staff endpoint (only `/api/me/*` + `GET /api/gym` allowed).
2. **Member management** — paginated search/filter/sort, create/update, activate/deactivate, delete guarded when payment history exists, membership history, **renewal**, QR-token rotation, per-member attendance & payments; auto-generated member codes and login accounts.
3. **Membership plans** — create/update, archive/restore (never hard delete), durations (day/week/month/year), benefits, INR pricing.
4. **Attendance & QR check-in** — camera QR scanning (html5-qrcode) and manual code entry; eligibility enforcement (active/expired/suspended), check-out, corrections behind an `attendance.correct` role; revocable QR tokens; summary, peak-hours and member-frequency reports.
5. **Payments** — manual records (cash/UPI/card/bank/other) with idempotency keys, partial & pending statuses, refunds stored as rows, dues/balance computation (`membershipBalance`, shared with the member portal), revenue summaries.
6. **Group classes** — single-session scheduling with trainer + capacity, cancellation, enrollment management (enrolled/attended/no-show), capacity enforcement (`class_full` on overflow).
7. **Dashboard & reports** — live stats (active/new members, revenue, pending dues), attendance & revenue trends, plan distribution, recent check-ins/members, upcoming expiries.
8. **In-app notifications** — expiry-warning / expired / payment-pending alerts, unread badge, mark-read / read-all, manual "Rebuild" scan.
9. **Audit log** — actor/entity/action/before-after trail for staff mutations, with a viewing page.
10. **Settings & branding** — gym name, timezone, expiry window.
11. **Member self-service portal** (`/portal/*`) — membership pass with flip-out QR and billing line (due amount or "Paid in full"), attendance history + visit calendar, payments page (receipts, ledger, balance-due ticket), enrolled classes, change password.
12. **Demo mode** — seeded offline data layer with demo credentials used automatically when `VITE_API_URL` is unset; plus backend seed and demo-purge scripts.

## Partially Implemented / Verified Limitations

- **Notifications are in-app only** — no email/SMS/push channels exist (no messaging dependencies anywhere); the expiry/dues scan runs only via a manual "Rebuild" button — there is no scheduler/cron.
- **No online payments** — records are entered by staff only; no gateway (Stripe/Razorpay etc.) integration.
- **No file uploads** — member photo is a plain URL field; no upload endpoint (no multer).
- **Auth scope** — single JWT with no refresh-token rotation, no server-side logout-all, and no login rate limiting.
- **Testing** — frontend has Vitest + Testing Library configured (`npm test`) but **zero test files** exist in the repo; the backend has no test runner at all.
- **Classes are single sessions** — no recurring-class generator; no waitlist (full classes are rejected).
- **Single-gym scope** — all queries are `gymId`-scoped and no multi-gym management endpoints exist (one gym per deployment/database).
- **English-only UI** — no i18n framework.

## Planned / Unfinished Features

None identifiable: no `TODO`/`FIXME` markers, feature flags, or stubbed routes were found in the source. All features above are either complete as described or limited only by the scope notes listed in the previous section.

---
*Generated from code inspection of commit `9ef6187`. No application files were modified during this audit.*
