-- ============================================================================
-- Pulse Gym Suite — Migration 0003: Payments, Staff, Classes, Notifications + RPCs
-- ----------------------------------------------------------------------------
-- Tables: payment_records, staff_profiles, gym_classes, class_enrollments,
--         notifications
-- RPCs:   record_attendance, rotate_qr_token, renew_membership,
--         record_payment, generate_expiry_notifications
-- Runs after 0002. (EXECUTE grants/revokes for these functions happen in 0004.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Global receipt sequence (shared across gyms; formatted per-year in RPCs)
-- ----------------------------------------------------------------------------
create sequence public.receipt_seq increment 1 start with 1;
comment on sequence public.receipt_seq is
  'Global counter used by record_payment() to build receipt_no values like PGS-2026-000042. Demo seed uses DEMO-Rxxxx and never touches this sequence.';

-- ============================================================================
-- TABLE: payment_records — financial history (never hard-deleted by clients)
-- ============================================================================
create table public.payment_records (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete restrict,
  membership_id   uuid references public.member_memberships(id) on delete set null,
  amount          numeric(12,2) not null check (amount > 0),
  payment_date    date not null default current_date,
  method          text not null check (method in ('cash','upi','card','bank_transfer','other')),
  status          text not null default 'paid' check (status in ('paid','partial','pending','refunded','failed')),
  transaction_ref text,
  notes           text,
  receipt_no      text not null,
  recorded_by     uuid references public.profiles(id) on delete set null,
  refund_of       uuid references public.payment_records(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table  public.payment_records is
  'Financial history. Rows are inserted ONLY via the record_payment() RPC (no client insert policy) and are never deleted by clients (no delete policy).';
comment on column public.payment_records.member_id     is 'ON DELETE RESTRICT: a member with payment history cannot be deleted — deactivate the member instead. This also intentionally blocks hard-deleting a gym with payments; use gyms.is_active = false.';
comment on column public.payment_records.membership_id is 'ON DELETE SET NULL: if the membership row disappears the payment survives with a null link (history must not silently vanish).';
comment on column public.payment_records.receipt_no    is 'Unique receipt number, e.g. PGS-2026-000042 (built from receipt_seq).';

create unique index payment_records_gym_receipt_uq  on public.payment_records (gym_id, receipt_no);
create index payment_records_gym_date_idx           on public.payment_records (gym_id, payment_date desc);
create index payment_records_member_date_idx        on public.payment_records (member_id, payment_date desc);
create index payment_records_gym_status_idx         on public.payment_records (gym_id, status);

create trigger payment_records_set_updated_at
  before update on public.payment_records
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Trigger: audit trail for payment corrections
-- (function must exist BEFORE the trigger that uses it)
-- ----------------------------------------------------------------------------
create or replace function public.log_payment_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
     and (new.amount         is distinct from old.amount
       or new.payment_date   is distinct from old.payment_date
       or new.method         is distinct from old.method
       or new.status         is distinct from old.status
       or new.transaction_ref is distinct from old.transaction_ref
       or new.notes          is distinct from old.notes) then
    insert into public.audit_logs (gym_id, actor_id, entity, entity_id, action, old_values, new_values)
    values (
      new.gym_id,
      auth.uid(),
      'payment_records',
      new.id,
      'update',
      jsonb_build_object('amount', old.amount, 'payment_date', old.payment_date, 'method', old.method,
                         'status', old.status, 'transaction_ref', old.transaction_ref, 'notes', old.notes),
      jsonb_build_object('amount', new.amount, 'payment_date', new.payment_date, 'method', new.method,
                         'status', new.status, 'transaction_ref', new.transaction_ref, 'notes', new.notes)
    );
  end if;
  return new;
end;
$$;
comment on function public.log_payment_change() is
  'AFTER UPDATE on payment_records: writes old/new values to audit_logs when financial fields change.';

create trigger payment_records_audit_log
  after update on public.payment_records
  for each row execute function public.log_payment_change();

-- ============================================================================
-- TABLE: staff_profiles — trainer/staff directory (separate from login profiles)
-- ============================================================================
create table public.staff_profiles (
  id                uuid primary key default gen_random_uuid(),
  gym_id            uuid not null references public.gyms(id) on delete cascade,
  profile_id        uuid references public.profiles(id) on delete set null,  -- link to login account, if any
  full_name         text not null,
  email             text,
  phone             text,
  role              text not null default 'trainer' check (role in ('owner','admin','front_desk','trainer')),
  specialization    text,
  employment_status text not null default 'active' check (employment_status in ('active','on_leave','resigned')),
  joining_date      date,
  photo_url         text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.staff_profiles is
  'Staff/trainer directory. profile_id links to a login profiles row when the staff member also uses the app (set null if that account is removed).';

create index staff_profiles_gym_status_idx on public.staff_profiles (gym_id, employment_status);

create trigger staff_profiles_set_updated_at
  before update on public.staff_profiles
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TABLE: gym_classes
-- ============================================================================
create table public.gym_classes (
  id                uuid primary key default gen_random_uuid(),
  gym_id            uuid not null references public.gyms(id) on delete cascade,
  name              text not null,
  description       text,
  trainer_id        uuid references public.staff_profiles(id) on delete set null,
  starts_at         timestamptz not null default now(),
  duration_minutes  integer not null default 60 check (duration_minutes > 0),
  capacity          integer not null default 20 check (capacity > 0),
  status            text not null default 'scheduled' check (status in ('scheduled','cancelled','completed')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.gym_classes is 'Group class schedule. Deleting a class cascades its enrollments; cancel via status = ''cancelled'' to keep history.';

create index gym_classes_gym_starts_idx on public.gym_classes (gym_id, starts_at desc);

create trigger gym_classes_set_updated_at
  before update on public.gym_classes
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TABLE: class_enrollments
-- ============================================================================
create table public.class_enrollments (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  class_id    uuid not null references public.gym_classes(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  status      text not null default 'enrolled' check (status in ('enrolled','cancelled','attended','no_show')),
  enrolled_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint class_enrollments_class_member_uq unique (class_id, member_id)
);

comment on table public.class_enrollments is 'Member sign-ups for group classes. One enrollment per member per class (unique).';

create index class_enrollments_gym_class_idx  on public.class_enrollments (gym_id, class_id);
create index class_enrollments_gym_member_idx on public.class_enrollments (gym_id, member_id);

create trigger class_enrollments_set_updated_at
  before update on public.class_enrollments
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TABLE: notifications — in-app feed (written by functions/triggers only)
-- ============================================================================
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete cascade,  -- null = broadcast to whole gym
  member_id  uuid references public.members(id) on delete set null,
  type       text not null check (type in ('expiry_warning','membership_expired','payment_pending',
                                           'checkin_success','checkin_rejected','class_reminder','general')),
  title      text not null,
  body       text not null,
  severity   text not null default 'info' check (severity in ('info','success','warning','error')),
  is_read    boolean not null default false,
  dedupe_key text,          -- idempotency key, e.g. '<member_id>:<membership_id>:expiry_warning'
  link       text,
  created_at timestamptz not null default now()
  -- no updated_at / no created_by: rows are machine-generated (spec column list).
);

comment on table  public.notifications          is 'In-app notifications. Broadcast rows have user_id = null. Clients can only mark their own rows read — inserts happen via security-definer functions.';
comment on column public.notifications.dedupe_key is 'Idempotency key. Unique per (gym_id, type, dedupe_key) when not null — generators upsert with ON CONFLICT DO NOTHING.';

create unique index notifications_gym_type_dedupe_uq
  on public.notifications (gym_id, type, dedupe_key) where dedupe_key is not null;
create index notifications_gym_read_idx on public.notifications (gym_id, is_read, created_at desc);
create index notifications_user_idx    on public.notifications (user_id, is_read) where user_id is not null;

-- ============================================================================
-- RPC: record_attendance — the only way attendance rows are created
-- ============================================================================
create or replace function public.record_attendance(
  p_qr_token text,
  p_method   text default 'qr',
  p_notes    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member             public.members%rowtype;
  v_gym                public.gyms%rowtype;
  v_settings           public.gym_settings%rowtype;
  v_membership         public.member_memberships%rowtype;
  v_membership_status  text;
  v_plan_name          text;
  v_today              date;
  v_last_check_in      timestamptz;
  v_attendance_id      uuid;
  v_check_in           timestamptz;
  v_method             text;
  v_warn               text := null;
begin
  v_method := case when p_method in ('qr','manual','class') then p_method else 'qr' end;

  -- 1. Resolve member by token ---------------------------------------------
  select * into v_member
    from public.members
   where qr_token = trim(coalesce(p_qr_token, ''));

  if not found then
    return jsonb_build_object('status', 'rejected', 'reason', 'invalid_qr');
  end if;

  -- A revoked token keeps its value so scanners can distinguish
  -- 'revoked_qr' from 'invalid_qr' (rotation issues a brand-new token).
  if v_member.qr_status <> 'active' then
    return jsonb_build_object('status', 'rejected', 'reason', 'revoked_qr');
  end if;

  -- 2. Tenancy check: caller's gym must match the member's gym --------------
  if public.current_gym_id() is distinct from v_member.gym_id then
    return jsonb_build_object('status', 'rejected', 'reason', 'forbidden');
  end if;

  -- 3. Serialise concurrent scans of the same member (advisory txn lock) ----
  perform pg_advisory_xact_lock(hashtext('attendance:' || v_member.id::text));

  select * into v_gym      from public.gyms         where id = v_member.gym_id;
  select * into v_settings from public.gym_settings where gym_id = v_member.gym_id;

  v_today := (now() at time zone coalesce(v_gym.timezone, 'Asia/Kolkata'))::date;

  -- 4. Member active? (rejection order per spec: inactive first) ------------
  if v_member.status <> 'active' then
    return jsonb_build_object('status', 'rejected', 'reason', 'member_inactive');
  end if;

  -- 5. Find the governing membership (prefer active, then most recent) ------
  select * into v_membership
    from public.member_memberships
   where gym_id = v_member.gym_id
     and member_id = v_member.id
     and start_date <= v_today
   order by (status = 'active') desc, end_date desc
   limit 1;

  if not found then
    return jsonb_build_object('status', 'rejected', 'reason', 'no_membership');
  end if;

  v_membership_status := v_membership.status;

  -- 6. Expired? (checked before suspended, per spec ordering)
  if v_membership.end_date < v_today then
    if coalesce(v_settings.allow_expired_checkin, false) then
      v_warn := 'expired';                       -- allow, but flag it
      v_membership_status := 'expired';
    else
      return jsonb_build_object('status', 'rejected', 'reason', 'expired');
    end if;
  end if;

  -- 7. Suspended / cancelled / inactive membership?
  if v_membership.status in ('suspended', 'cancelled', 'inactive') then
    return jsonb_build_object('status', 'rejected', 'reason', 'suspended');
  end if;

  -- 8. Cooldown: applies whenever the last check-in is within
  --    checkin_cooldown_minutes, regardless of calendar day.
  if coalesce(v_settings.checkin_cooldown_minutes, 0) > 0 then
    select max(check_in) into v_last_check_in
      from public.attendance_records
     where member_id = v_member.id;

    if v_last_check_in is not null
       and (now() - v_last_check_in) < make_interval(mins => v_settings.checkin_cooldown_minutes) then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'cooldown',
        'next_check_in_at', v_last_check_in + make_interval(mins => v_settings.checkin_cooldown_minutes)
      );
    end if;
  end if;

  select name into v_plan_name from public.membership_plans where id = v_membership.plan_id;

  -- 9. Insert — unique_violation is the concurrent-duplicate safety net ----
  begin
    insert into public.attendance_records (gym_id, member_id, membership_id, method, scanner_id, notes)
    values (v_member.gym_id, v_member.id, v_membership.id, v_method, public.current_profile_id(), p_notes)
    returning id, check_in into v_attendance_id, v_check_in;
  exception
    when unique_violation then
      return jsonb_build_object('status', 'rejected', 'reason', 'duplicate');
  end;

  return jsonb_build_object(
    'status',        'ok',
    'attendance_id', v_attendance_id,
    'check_in',      v_check_in,
    'member', jsonb_build_object(
      'id',                v_member.id,
      'member_code',       v_member.member_code,
      'full_name',         v_member.full_name,
      'photo_url',         v_member.photo_url,
      'membership_status', v_membership_status,
      'plan_name',         v_plan_name,
      'end_date',          v_membership.end_date
    ),
    'warn', v_warn
  );
end;
$$;
comment on function public.record_attendance(text, text, text) is
  'Check a member in by QR token. Rejects with reasons: invalid_qr, revoked_qr, forbidden, member_inactive, no_membership, expired, suspended, cooldown, duplicate. Insert-only path for attendance_records.';

-- ============================================================================
-- RPC: rotate_qr_token — issue a fresh QR token for a member
-- ============================================================================
create or replace function public.rotate_qr_token(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member public.members%rowtype;
  v_token  text;
begin
  if coalesce(public.current_user_role(), '') not in ('owner', 'admin', 'front_desk') then
    return jsonb_build_object('status', 'error', 'reason', 'forbidden');
  end if;

  select * into v_member from public.members where id = p_member_id;
  if not found then
    return jsonb_build_object('status', 'error', 'reason', 'member_not_found');
  end if;

  if v_member.gym_id is distinct from public.current_gym_id() then
    return jsonb_build_object('status', 'error', 'reason', 'forbidden');
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  update public.members
     set qr_token      = v_token,
         qr_rotated_at = now(),
         qr_status     = 'active'
   where id = p_member_id;

  -- Audit the rotation event, but never store the token value itself.
  insert into public.audit_logs (gym_id, actor_id, entity, entity_id, action, new_values)
  values (v_member.gym_id, public.current_profile_id(), 'member', p_member_id, 'rotate_qr',
          jsonb_build_object('qr_rotated_at', now()));

  return jsonb_build_object('status', 'ok', 'qr_token', v_token, 'member_id', p_member_id);
end;
$$;
comment on function public.rotate_qr_token(uuid) is
  'Replaces a member''s QR token with a fresh random hex token and marks it active. Roles: owner/admin/front_desk, same gym only. Writes an audit_logs row (token value not logged).';

-- ============================================================================
-- RPC: renew_membership — insert a NEW membership row (never mutates old ones)
-- ============================================================================
create or replace function public.renew_membership(
  p_member_id  uuid,
  p_plan_id    uuid,
  p_start_date date   default null,
  p_discount   numeric default 0,
  p_notes      text   default null,
  p_source     text   default 'renewal'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member public.members%rowtype;
  v_plan   public.membership_plans%rowtype;
  v_start  date;
  v_end    date;
  v_row    public.member_memberships%rowtype;
begin
  if coalesce(public.current_user_role(), '') not in ('owner', 'admin', 'front_desk') then
    return jsonb_build_object('status', 'error', 'reason', 'forbidden');
  end if;

  select * into v_member from public.members where id = p_member_id;
  if not found then
    return jsonb_build_object('status', 'error', 'reason', 'member_not_found');
  end if;
  if v_member.gym_id is distinct from public.current_gym_id() then
    return jsonb_build_object('status', 'error', 'reason', 'forbidden');
  end if;

  select * into v_plan
    from public.membership_plans
   where id = p_plan_id
     and gym_id = v_member.gym_id
     and is_active = true;
  if not found then
    return jsonb_build_object('status', 'error', 'reason', 'invalid_plan');
  end if;

  if coalesce(p_discount, 0) < 0 or coalesce(p_discount, 0) > v_plan.price then
    return jsonb_build_object('status', 'error', 'reason', 'invalid_discount');
  end if;

  v_start := coalesce(p_start_date, current_date);
  v_end   := (v_start + (v_plan.duration_value * case v_plan.duration_unit
               when 'day'   then interval '1 day'
               when 'week'  then interval '1 week'
               when 'month' then interval '1 month'
               when 'year'  then interval '1 year'
               else interval '1 month'
             end))::date;

  insert into public.member_memberships
    (gym_id, member_id, plan_id, start_date, end_date, status, price, discount, source, notes, created_by)
  values
    (v_member.gym_id, v_member.id, v_plan.id, v_start, v_end, 'active',
     v_plan.price, coalesce(p_discount, 0),
     case when p_source in ('new','renewal','extension','correction') then p_source else 'renewal' end,
     p_notes, public.current_profile_id())
  returning * into v_row;

  insert into public.audit_logs (gym_id, actor_id, entity, entity_id, action, new_values)
  values (v_member.gym_id, public.current_profile_id(), 'member_memberships', v_row.id, 'create',
          to_jsonb(v_row));

  return to_jsonb(v_row);
end;
$$;
comment on function public.renew_membership(uuid, uuid, date, numeric, text, text) is
  'Sells/extends a membership: validates the plan belongs to the caller''s gym, computes end_date from duration_value/duration_unit, inserts a NEW row (history preserved) and audits it. Returns the new membership as jsonb.';

-- ============================================================================
-- RPC: record_payment — the only way payment rows are created
-- ============================================================================
create or replace function public.record_payment(
  p_member_id       uuid,
  p_membership_id   uuid,
  p_amount          numeric,
  p_method          text,
  p_payment_date    date   default current_date,
  p_status          text   default 'paid',
  p_transaction_ref text   default null,
  p_notes           text   default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member      public.members%rowtype;
  v_membership  public.member_memberships%rowtype;
  v_date        date;
  v_receipt     text;
  v_row         public.payment_records%rowtype;
begin
  if coalesce(public.current_user_role(), '') not in ('owner', 'admin', 'front_desk') then
    return jsonb_build_object('status', 'error', 'reason', 'forbidden');
  end if;

  select * into v_member from public.members where id = p_member_id;
  if not found then
    return jsonb_build_object('status', 'error', 'reason', 'member_not_found');
  end if;
  if v_member.gym_id is distinct from public.current_gym_id() then
    return jsonb_build_object('status', 'error', 'reason', 'forbidden');
  end if;

  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('status', 'error', 'reason', 'invalid_amount');
  end if;
  if p_method is null or p_method not in ('cash','upi','card','bank_transfer','other') then
    return jsonb_build_object('status', 'error', 'reason', 'invalid_method');
  end if;
  if coalesce(p_status, 'paid') not in ('paid','partial','pending','refunded','failed') then
    return jsonb_build_object('status', 'error', 'reason', 'invalid_status');
  end if;

  if p_membership_id is not null then
    select * into v_membership
      from public.member_memberships
     where id = p_membership_id
       and member_id = p_member_id
       and gym_id = v_member.gym_id;
    if not found then
      return jsonb_build_object('status', 'error', 'reason', 'invalid_membership');
    end if;
  end if;

  v_date    := coalesce(p_payment_date, current_date);
  v_receipt := 'PGS-' || to_char(v_date, 'YYYY') || '-' || lpad(nextval('public.receipt_seq')::text, 6, '0');

  insert into public.payment_records
    (gym_id, member_id, membership_id, amount, payment_date, method, status,
     transaction_ref, notes, receipt_no, recorded_by)
  values
    (v_member.gym_id, p_member_id, p_membership_id, p_amount, v_date, p_method,
     coalesce(p_status, 'paid'), p_transaction_ref, p_notes, v_receipt, public.current_profile_id())
  returning * into v_row;

  insert into public.audit_logs (gym_id, actor_id, entity, entity_id, action, new_values)
  values (v_member.gym_id, public.current_profile_id(), 'payment_records', v_row.id, 'create',
          to_jsonb(v_row));

  return to_jsonb(v_row);
end;
$$;
comment on function public.record_payment(uuid, uuid, numeric, text, date, text, text, text) is
  'Records a payment for a member (optionally against a membership of that member). Builds receipt_no from receipt_seq (e.g. PGS-2026-000042), audits the insert, returns the row as jsonb. Roles: owner/admin/front_desk.';

-- ============================================================================
-- RPC: generate_expiry_notifications — idempotent per-gym notification sweep
-- ============================================================================
-- NOTE on pending dues: this computes "payment_pending" only for memberships
-- that have NO paid/partial payment row at all. Partial payments with a
-- remaining balance are intentionally not tracked here (would require
-- running-balance math across refunds/partial rows).
-- ============================================================================
create or replace function public.generate_expiry_notifications()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_gym_id  uuid := public.current_gym_id();
  v_tz      text;
  v_soon    integer;
  v_today   date;
  v_count   integer := 0;
  v_n       integer := 0;
begin
  if v_gym_id is null then
    return 0;
  end if;

  select coalesce(timezone, 'Asia/Kolkata') into v_tz from public.gyms where id = v_gym_id;
  select coalesce(expiring_soon_days, 7)   into v_soon from public.gym_settings where gym_id = v_gym_id;
  v_today := (now() at time zone coalesce(v_tz, 'Asia/Kolkata'))::date;

  -- a) Expiring soon (warning)
  with upsert as (
    insert into public.notifications (gym_id, member_id, type, title, body, severity, dedupe_key, link)
    select m.gym_id,
           m.id,
           'expiry_warning',
           'Membership expiring soon',
           m.full_name || ' (' || m.member_code || ') — membership ends on ' || to_char(mm.end_date, 'DD Mon YYYY') || '.',
           'warning',
           m.id::text || ':' || mm.id::text || ':expiry_warning',
           '/members/' || m.id::text
      from public.member_memberships mm
      join public.members m on m.id = mm.member_id
     where mm.gym_id = v_gym_id
       and mm.status = 'active'
       and mm.end_date >= v_today
       and mm.end_date <= v_today + make_interval(days => greatest(v_soon, 1))
     on conflict (gym_id, type, dedupe_key) where dedupe_key is not null do nothing
    returning 1
  ) select count(*) into v_n from upsert;
  v_count := v_count + v_n;

  -- b) Already expired (once per membership+end_date)
  with upsert as (
    insert into public.notifications (gym_id, member_id, type, title, body, severity, dedupe_key, link)
    select m.gym_id,
           m.id,
           'membership_expired',
           'Membership expired',
           m.full_name || ' (' || m.member_code || ') — membership expired on ' || to_char(mm.end_date, 'DD Mon YYYY') || '.',
           'warning',
           m.id::text || ':' || mm.id::text || ':membership_expired:' || mm.end_date::text,
           '/members/' || m.id::text
      from public.member_memberships mm
      join public.members m on m.id = mm.member_id
     where mm.gym_id = v_gym_id
       and mm.status = 'active'
       and mm.end_date < v_today
     on conflict (gym_id, type, dedupe_key) where dedupe_key is not null do nothing
    returning 1
  ) select count(*) into v_n from upsert;
  v_count := v_count + v_n;

  -- c) Memberships with no paid/partial payment at all (pending dues)
  with upsert as (
    insert into public.notifications (gym_id, member_id, type, title, body, severity, dedupe_key, link)
    select m.gym_id,
           m.id,
           'payment_pending',
           'Payment pending',
           m.full_name || ' (' || m.member_code || ') — no payment recorded for the current membership.',
           'info',
           m.id::text || ':' || mm.id::text || ':payment_pending',
           '/members/' || m.id::text
      from public.member_memberships mm
      join public.members m on m.id = mm.member_id
     where mm.gym_id = v_gym_id
       and mm.status = 'active'
       and mm.start_date <= v_today
       and not exists (
             select 1 from public.payment_records p
              where p.member_id = mm.member_id
                and p.membership_id = mm.id
                and p.status in ('paid', 'partial'))
     on conflict (gym_id, type, dedupe_key) where dedupe_key is not null do nothing
    returning 1
  ) select count(*) into v_n from upsert;
  v_count := v_count + v_n;

  return v_count;
end;
$$;
comment on function public.generate_expiry_notifications() is
  'Sweeps the CALLER''S gym only: upserts expiry_warning / membership_expired / payment_pending notifications, idempotent via dedupe_key. Returns the number of rows inserted.';

-- ============================================================================
-- End of 0003
-- ============================================================================
