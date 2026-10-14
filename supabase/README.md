# Pulse Gym Suite — Database (Supabase / PostgreSQL 15+)

Multi-tenant gym management schema: one row per gym (tenant), UUID primary
keys, strict Row Level Security, and security-definer RPCs for the
QR check-in / payments / renewals workflows.

## Files (run in this order)

| File | Contents |
|------|----------|
| `migrations/0001_core.sql` | Extensions, `set_updated_at()`, `gyms`, `profiles`, `gym_settings`, `audit_logs`, security helpers (`current_gym_id()` etc.), signup + gym bootstrap triggers |
| `migrations/0002_members_and_attendance.sql` | `members`, `membership_plans`, `member_memberships`, `attendance_records` (+ duplicate-check-in unique index, audit trigger, trigram search indexes) |
| `migrations/0003_payments_staff_classes_notifications.sql` | `receipt_seq`, `payment_records`, `staff_profiles`, `gym_classes`, `class_enrollments`, `notifications`, and the RPCs (`record_attendance`, `rotate_qr_token`, `renew_membership`, `record_payment`, `generate_expiry_notifications`) |
| `migrations/0004_rls_policies.sql` | Default-deny grants (anon/PUBLIC get nothing), grants to `authenticated`, RLS enabled + policies on **every** table. There is **no** permissive `using (true)` policy anywhere. |
| `seed.sql` | Optional, safe, idempotent demo gym `pulse-demo-gym` (plans, 12 members, memberships in mixed states, attendance, payments, staff, classes, notifications) |

## Setup

**Supabase CLI (recommended):**

```powershell
supabase link --project-ref <your-project-ref>
supabase db push          # applies migrations/ in order
# optional demo data:
psql "$env:SUPABASE_DB_URL" -f supabase/seed.sql
```

**SQL editor:** paste `0001` → `0002` → `0003` → `0004` (then `seed.sql`)
top-to-bottom, each in a fresh query. The files are written to run in order
and never reference something defined later.

## Creating the first owner account

Gyms are **never auto-created**. Bootstrap flow:

1. Insert your gym row (SQL editor or run `seed.sql` for the demo gym) and
   note its UUID. A `gym_settings` row is created automatically by trigger.
2. Sign up via Supabase Auth (your app's signup page or Auth → Users →
   *Add user* → *Define custom user metadata*):
   ```json
   { "gym_id": "<gym-uuid>", "role": "owner", "full_name": "Gym Owner" }
   ```
3. The `handle_new_user()` trigger inserts the matching `profiles` row with
   role `owner`. If `gym_id` is missing/unknown, no profile is created — the
   account simply has no access yet.

New staff users are added the same way with their own `gym_id` and a role of
`admin` / `front_desk` / `trainer` (owner/admin can also insert `profiles`
rows directly from the app).

## Key API surface (RPCs, all `security definer`, tenant-validated)

- `record_attendance(p_qr_token, p_method := 'qr', p_notes := null)` — the
  **only** way attendance rows are created. Returns `status: ok` with member
  details, or `rejected` with a reason: `invalid_qr`, `revoked_qr`,
  `forbidden`, `member_inactive`, `no_membership`, `expired`, `suspended`,
  `cooldown`, `duplicate`.
- `rotate_qr_token(p_member_id)` — owner/admin/front_desk; issues a fresh
  random token, audits the rotation (token value is not logged).
- `renew_membership(p_member_id, p_plan_id, p_start_date, p_discount,
  p_notes, p_source)` — always **inserts** a new membership row; old rows are
  never mutated.
- `record_payment(p_member_id, p_membership_id, p_amount, p_method, ...)` —
  the **only** way payment rows are created; builds `receipt_no` like
  `PGS-2026-000042` from `receipt_seq`.
- `generate_expiry_notifications()` — idempotent sweep of the caller's gym
  (`expiry_warning`, `membership_expired`, `payment_pending`). It detects
  pending dues only for memberships with **no** paid/partial payment at all.

## Security model in one paragraph

Default deny. `anon` and `PUBLIC` have no table, sequence or function access.
`authenticated` is scoped per-gym via `gym_id = current_gym_id()` and per-role.
Clients cannot insert attendance or payments (RPCs only) and cannot delete
attendance, payments or memberships — corrections are audited UPDATEs.
`audit_logs` is written only by triggers/RPCs and is readable by owner/admin.

## Design notes & caveats

- **Deleting things is deliberately hard.** `payment_records.member_id` is
  `ON DELETE RESTRICT`, so members/gyms with payment history cannot be
  hard-deleted — deactivate (`members.status`, `gyms.is_active`) instead.
  Plans with sold memberships are archived (`is_active = false`), not deleted.
- Duplicate check-ins are blocked by a unique index on
  `(member_id, floor(epoch/60))` — the immutable equivalent of "one check-in
  per UTC minute" (`date_trunc(text, timestamptz)` is `STABLE` and cannot be
  used in an index expression).
- Day boundaries (expiry, notifications) use the gym's `timezone`
  (default `Asia/Kolkata`); Postgres sessions themselves run in UTC.
- Reminder scheduling (cron/edge function calling
  `generate_expiry_notifications()` per gym), SMS/email sending and attendance
  retention purging (`attendance_retention_days`) are app/infra concerns.

## Removing the demo data

`seed.sql` never deletes or overwrites anything. To remove it, uncomment the
DELETE block at the top of `seed.sql` (dependency order is already correct:
payments → attendance → enrollments/notifications/classes → memberships →
members → plans → staff → settings → gym) and run it as a user that bypasses
RLS (SQL editor / service role).

## Frontend column mapping

All columns are `snake_case` (e.g. `full_name`, `member_code`, `qr_token`,
`check_in`, `payment_date`, `is_read`); map to the React/TS model in the
frontend layer — the database intentionally uses no camelCase.
