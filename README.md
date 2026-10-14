# Pulse Gym Suite

A premium, responsive gym management system with **QR-code attendance** at its core — memberships, payments & receipts, trainers, classes, reports and notifications.

**MERN stack**: MongoDB Atlas + Express + React 19 (Vite, TypeScript) + Node.js.

Dark graphite UI with volt-yellow accents, paper-inspired editorial textures and subtle motion — built for a real front desk, not a demo reel.

## Structure

```
backend-server/   # Express + Mongoose REST API (JWT auth, port 4000)
frontend/         # React + Vite + TypeScript SPA
```

## Features

- **QR attendance end-to-end** — opaque random tokens (no personal data in the QR), server-side validation with cooldown / duplicate prevention and explicit rejection reasons, printable membership cards, QR revoke & regenerate, camera scanner with manual fallback.
- **Members** — directory with search/filter/sort, profiles, membership history, renewals, attendance and payment trails.
- **Membership plans** — pricing in INR, durations, benefits, archive/reactivate.
- **Payments & fees** — record payments, dues ledger, printable receipts, refunds, revenue summaries.
- **Trainers & staff** — directory, roles, employment status.
- **Classes & schedule** — weekly planner, capacity, enrolments.
- **Reports & analytics** — attendance summary, peak hours, top members, revenue, plan mix, CSV export.
- **Notifications** — expiry warnings, pending dues, check-in events, one-click rebuild.
- **Settings** — gym profile, check-in policy (cooldown, checkout tracking, reminders), audit trail.
- **Roles** — owner / admin / front desk / trainer. The API re-checks every capability server-side.

## Tech

| Layer | Choice |
| --- | --- |
| Frontend | React 19, TypeScript (strict), Vite 7, Tailwind v4, shadcn/ui, React Hook Form + Zod, Recharts, Motion, Lucide, html5-qrcode, Sonner |
| Backend | Node.js (ESM), Express, Mongoose, JSON Web Tokens, bcryptjs, Zod |
| Database | MongoDB Atlas |

## Local development

```bash
# backend (port 4000)
cd backend-server
npm install
cp .env.example .env      # MONGODB_URI, JWT_SECRET, PORT, CLIENT_ORIGIN
node scripts/seed.js      # demo gym, plans, members, payments, classes + login accounts
npm run dev

# frontend (port 5173/5174)
cd ../frontend
npm install
cp .env.example .env      # VITE_API_URL=http://localhost:4000/api
npm run dev
```

Seeded login accounts (demo data, `test@123`): `admin@gmail.com` (owner), `member1@gmail.com`, `member2@gmail.com` (front desk).

### Environment

`backend-server/.env`

```bash
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>/?appName=<app>
JWT_SECRET=<long random string>
PORT=4000
CLIENT_ORIGIN=http://localhost:5173,http://localhost:5174
```

`frontend/.env`

```bash
VITE_API_URL=http://localhost:4000/api
VITE_GYM_TIMEZONE=Asia/Kolkata
VITE_GYM_NAME=Pulse Fitness Studio
```

Never commit `.env` files. The backend talks to Mongo with its own credentials — the browser only ever holds a JWT and the public API URL.

## API

All routes are mounted under `/api` and require `Authorization: Bearer <token>` except `POST /api/auth/login`.

| Group | Endpoints |
| --- | --- |
| Auth | `login`, `me` |
| Gym | `gym`, `settings` |
| Dashboard | `stats`, `attendance-trend`, `revenue-trend`, `plan-distribution`, `recent-checkins`, `recent-members`, `upcoming-expiries` |
| Members | CRUD, status, memberships, `renew`, `rotate-qr`, attendance, payments |
| Plans | CRUD + archive/activate |
| Attendance | `checkin`, `checkin-code`, `checkout`, history, corrections, `summary`, `peak-hours`, `frequencies` |
| Payments | list/record, `refund`, `dues`, `revenue` |
| Staff | CRUD + archive |
| Classes | CRUD, cancel, enrolments |
| Notifications | list, unread count, mark read/all, `rebuild` |
| Audit | recent activity |

Business rules (QR eligibility, cooldowns, renewal math, balances) live in the backend — see `backend-server/src/`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` (backend) | API with auto-reload |
| `npm start` (backend) | Production API |
| `node scripts/seed.js` | Seed / re-seed demo data |
| `npm run dev` (frontend) | Vite dev server |
| `npm run build` (frontend) | Typecheck + production build |

## Deployment

- **Backend → Render**: Node service pointing at `backend-server/` (build `npm install`, start `npm start`). Set `MONGODB_URI`, `JWT_SECRET`, `CLIENT_ORIGIN` (your Vercel URL) in the dashboard. Render's health check hits `/api/health`. Free tier sleeps when idle — first request takes ~50s.
- **Frontend → Vercel**: project root `frontend/`, Vite auto-detected. Set `VITE_API_URL=https://<your-render-service>.onrender.com/api`. `vercel.json` contains the SPA rewrite required by React Router.
- **Database → MongoDB Atlas** free M0 cluster. Allow network access (`0.0.0.0/0` for Render + local dev) and create a DB user.

## Security notes

- Passwords bcrypt-hashed; JWTs expire (7 days).
- Every mutation re-checks the caller's role server-side and writes an audit log row.
- QR tokens are opaque 64-char hex (no personal data); rotating a token revokes the old one instantly.
- Attendance writes go through the check-in endpoint with per-member locking so concurrent scans cannot double-record.
