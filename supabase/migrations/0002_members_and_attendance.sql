-- ============================================================================
-- Pulse Gym Suite — Migration 0002: Members, Plans, Memberships, Attendance
-- ----------------------------------------------------------------------------
-- Tables: members, membership_plans, member_memberships, attendance_records
-- Runs after 0001_core.sql.
-- ============================================================================

-- ============================================================================
-- TABLE: members
-- ============================================================================
create table public.members (
  id                      uuid primary key default gen_random_uuid(),
  gym_id                  uuid not null references public.gyms(id) on delete cascade,
  member_code             text not null,                          -- e.g. 'PGS-0001' (or 'DEMO-9001' in seed)
  full_name               text not null,
  email                   text,
  phone                   text not null,
  photo_url               text,
  date_of_birth           date,
  gender                  text check (gender in ('male','female','other','prefer_not_to_say')),
  address                 text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  join_date               date not null default current_date,
  qr_token                text not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  qr_status               text not null default 'active' check (qr_status in ('active','revoked')),
  qr_rotated_at           timestamptz,
  status                  text not null default 'active' check (status in ('active','inactive')),
  notes                   text,
  created_by              uuid references public.profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint members_gym_member_code_uq unique (gym_id, member_code)
);

comment on table  public.members                is 'Gym members. Deleting a gym cascades members; deleting a member who has payment history is blocked (see 0003) — deactivate instead.';
comment on column public.members.member_code    is 'Human-facing code, format PGS-0001 style. Demo seed rows use DEMO-xxxx.';
comment on column public.members.qr_token       is 'Opaque random 64-char hex (gen_random_bytes(32)). Contains NO personal data. Revoking keeps the token so scanners can distinguish revoked vs invalid.';
comment on column public.members.qr_status      is 'active = scans accepted; revoked = scans rejected with reason ''revoked_qr''. rotate_qr_token() issues a fresh token and resets this to active.';

-- Duplicate prevention: case-insensitive unique phone / email per gym.
create unique index members_gym_phone_lower_uq on public.members (gym_id, (lower(phone)));
create unique index members_gym_email_lower_uq on public.members (gym_id, (lower(email))) where email is not null;

-- Listing / filtering
create index members_gym_status_idx on public.members (gym_id, status);

-- Fuzzy search (pg_trgm from 0001)
create index members_full_name_trgm_idx on public.members using gin (full_name gin_trgm_ops);
create index members_phone_trgm_idx     on public.members using gin (phone     gin_trgm_ops);
create index members_email_trgm_idx     on public.members using gin (email     gin_trgm_ops);

create trigger members_set_updated_at
  before update on public.members
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TABLE: membership_plans
-- ============================================================================
create table public.membership_plans (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references public.gyms(id) on delete cascade,
  name           text not null,
  description    text,
  price          numeric(12,2) not null default 0 check (price >= 0),
  duration_value integer not null check (duration_value > 0),
  duration_unit  text not null check (duration_unit in ('day','week','month','year')),
  benefits       text[] not null default '{}',
  is_active      boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.membership_plans is
  'Sellable plan templates. Plans referenced by memberships cannot be deleted (FK restrict) — archive with is_active = false instead.';

create unique index membership_plans_gym_name_lower_uq on public.membership_plans (gym_id, (lower(name)));
create index membership_plans_gym_active_idx on public.membership_plans (gym_id, is_active, sort_order);

create trigger membership_plans_set_updated_at
  before update on public.membership_plans
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TABLE: member_memberships
-- ============================================================================
create table public.member_memberships (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  plan_id    uuid not null references public.membership_plans(id) on delete restrict,
  start_date date not null default current_date,
  end_date   date not null,
  status     text not null default 'active' check (status in ('active','suspended','inactive','cancelled')),
  price      numeric(12,2) not null default 0 check (price >= 0),   -- honoured price at time of sale
  discount   numeric(12,2) not null default 0 check (discount >= 0),
  source     text not null default 'new' check (source in ('new','renewal','extension','correction')),
  notes      text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint member_memberships_dates_ck check (end_date >= start_date)
);

comment on table  public.member_memberships       is 'Concrete membership instances sold to members. Renewals always INSERT a new row (see renew_membership RPC) — old rows are never mutated, preserving history.';
comment on column public.member_memberships.plan_id is 'FK restrict: a plan with sold memberships cannot be deleted; archive it (is_active = false). When a member is deleted, memberships cascade but payment_records keep their history with membership_id set null.';

create index member_memberships_member_start_idx on public.member_memberships (member_id, start_date desc);
create index member_memberships_gym_end_idx      on public.member_memberships (gym_id, end_date);
create index member_memberships_gym_status_idx   on public.member_memberships (gym_id, status);
-- Hot path for expiry scans / generate_expiry_notifications():
create index member_memberships_active_end_idx   on public.member_memberships (gym_id, end_date) where status = 'active';

create trigger member_memberships_set_updated_at
  before update on public.member_memberships
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TABLE: attendance_records
-- ============================================================================
create table public.attendance_records (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  membership_id uuid references public.member_memberships(id) on delete set null,
  check_in      timestamptz not null default now(),
  check_out     timestamptz,
  status        text not null default 'checked_in' check (status in ('checked_in','checked_out')),
  method        text not null default 'qr' check (method in ('qr','manual','class')),
  scanner_id    uuid references public.profiles(id) on delete set null,
  notes         text,
  meta          jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint attendance_records_checkout_ck check (check_out is null or check_out >= check_in)
);

comment on table  public.attendance_records is
  'Check-in history. Rows are inserted ONLY via the record_attendance() RPC (no client insert policy). Corrections happen by UPDATE (audited); there is no delete policy.';
comment on column public.attendance_records.membership_id is 'Set null when the originating membership row is removed — the attendance history itself is preserved.';

create index attendance_records_gym_checkin_idx  on public.attendance_records (gym_id, check_in desc);
create index attendance_records_member_checkin_idx on public.attendance_records (member_id, check_in desc);

-- Duplicate-scan prevention: at most one check-in per member per minute.
--
-- NOTE: extract(epoch from timestamptz) is marked STABLE in PostgreSQL, so it
-- cannot appear directly in an index expression. The wrapper below is declared
-- IMMUTABLE, which is honest here: the epoch second count of an absolute instant
-- does NOT depend on the session timezone, so this is deterministic on every
-- node and safe to index. It is identical to the UTC minute bucket.
create or replace function public.attendance_minute_bucket(ts timestamptz)
returns bigint
language sql
immutable
parallel safe
as $$
  select floor(extract(epoch from ts) / 60)::bigint
$$;

create unique index attendance_unique_checkin_minute
  on public.attendance_records (member_id, public.attendance_minute_bucket(check_in));

create trigger attendance_records_set_updated_at
  before update on public.attendance_records
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Trigger: audit trail for attendance corrections
-- (function must exist BEFORE the trigger that uses it)
-- ----------------------------------------------------------------------------
create or replace function public.log_attendance_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
     and (new.check_out is distinct from old.check_out
       or new.status    is distinct from old.status
       or new.notes     is distinct from old.notes) then
    insert into public.audit_logs (gym_id, actor_id, entity, entity_id, action, old_values, new_values)
    values (
      new.gym_id,
      auth.uid(),
      'attendance_records',
      new.id,
      'update',
      jsonb_build_object('check_out', old.check_out, 'status', old.status, 'notes', old.notes),
      jsonb_build_object('check_out', new.check_out, 'status', new.status, 'notes', new.notes)
    );
  end if;
  return new;
end;
$$;
comment on function public.log_attendance_change() is
  'AFTER UPDATE on attendance_records: writes old/new values to audit_logs when check_out/status/notes change.';

create trigger attendance_records_audit_log
  after update on public.attendance_records
  for each row execute function public.log_attendance_change();

-- ============================================================================
-- End of 0002
-- ============================================================================
