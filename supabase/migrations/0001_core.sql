-- ============================================================================
-- Pulse Gym Suite — Migration 0001: Core
-- ----------------------------------------------------------------------------
-- Extensions, shared trigger helpers, tenancy core:
--   gyms, profiles, gym_settings, audit_logs
-- plus bootstrap trigger functions (new gym -> settings, new auth user -> profile)
-- and the RLS security helper functions.
--
-- Target: Supabase PostgreSQL 15+. Safe to run top-to-bottom in the SQL editor.
-- NOTE: audit_logs lives here (not with the domain tables) because triggers and
-- RPC functions in later migrations write to it — it must exist before them.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;  -- gen_random_uuid(), gen_random_bytes()
create extension if not exists pg_trgm;   -- fuzzy ILIKE/trigram GIN indexes (used in 0002)
-- btree_gist is intentionally NOT installed: no exclusion constraint needs it.

-- ----------------------------------------------------------------------------
-- Shared trigger function: updated_at maintenance
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger function used by every table with updated_at: stamps updated_at = now().';

-- ============================================================================
-- TABLE: gyms — the top-level tenant
-- ============================================================================
create table public.gyms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  timezone   text not null default 'Asia/Kolkata',
  currency   text not null default 'INR',
  logo_url   text,
  address    text,
  phone      text,
  email      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table  public.gyms        is 'Top-level tenant. One row per gym/club. Deleting a gym cascades to operational data but is blocked by financial history (see 0003 FK notes) — deactivate with is_active = false instead.';
comment on column public.gyms.slug   is 'URL-safe identifier, unique across all gyms (e.g. pulse-demo-gym).';
comment on column public.gyms.timezone is 'IANA timezone used for day-boundary logic (check-ins, expiry notifications).';

create trigger gyms_set_updated_at
  before update on public.gyms
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TABLE: profiles — staff users of a gym, linked to auth.users
-- ============================================================================
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  full_name     text,
  email         text,
  phone         text,
  role          text not null default 'front_desk'
                check (role in ('owner','admin','front_desk','trainer')),
  avatar_url    text,
  is_active     boolean not null default true,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is 'One row per authenticated staff user, scoped to exactly one gym. Rows are created by the handle_new_user() trigger on auth.users (never by clients directly).';

create index profiles_gym_id_idx   on public.profiles (gym_id);
create index profiles_gym_role_idx on public.profiles (gym_id, role);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TABLE: gym_settings — 1:1 with gyms
-- ============================================================================
create table public.gym_settings (
  gym_id                    uuid primary key references public.gyms(id) on delete cascade,
  checkin_cooldown_minutes  integer not null default 60 check (checkin_cooldown_minutes between 0 and 1440),
  track_checkout            boolean not null default false,
  expiring_soon_days        integer not null default 7 check (expiring_soon_days between 1 and 90),
  expiry_reminder_days      integer[] not null default '{7,3,1}',
  allow_expired_checkin     boolean not null default false,
  enable_email              boolean not null default false,
  enable_sms                boolean not null default false,
  enable_whatsapp           boolean not null default false,
  enable_push               boolean not null default false,
  attendance_retention_days integer not null default 365,
  updated_at                timestamptz not null default now()
);

comment on table  public.gym_settings is 'Per-gym configuration. Auto-created by trigger when a gym row is inserted. No created_at column: the row is machine-generated at gym creation (spec).';
comment on column public.gym_settings.expiry_reminder_days is 'Preferred reminder offsets (days before expiry) used by the notification scheduler, e.g. {7,3,1}.';

create trigger gym_settings_set_updated_at
  before update on public.gym_settings
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Trigger: auto-create gym_settings when a gym is inserted
-- (function must exist BEFORE the trigger that uses it)
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_gym()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.gym_settings (gym_id)
  values (new.id)
  on conflict (gym_id) do nothing;
  return new;
end;
$$;
comment on function public.handle_new_gym() is
  'AFTER INSERT on public.gyms: creates the default gym_settings row for the new gym.';

create trigger gyms_autocreate_settings
  after insert on public.gyms
  for each row execute function public.handle_new_gym();

-- ============================================================================
-- TABLE: audit_logs — append-only trail (cross-cutting, used by 0002/0003)
-- ============================================================================
create table public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  actor_id   uuid references public.profiles(id) on delete set null,
  entity     text not null,          -- logical table name, e.g. 'attendance_records'
  entity_id  uuid,                   -- id of the affected row (no FK: rows may be purged)
  action     text not null,          -- e.g. 'create', 'update', 'rotate_qr'
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
  -- no updated_at: append-only table (spec column list).
);

comment on table public.audit_logs is
  'Append-only audit trail. Written ONLY by trigger functions and security-definer RPCs — clients have no insert policy. No updated_at (append-only).';

create index audit_logs_gym_created_idx  on public.audit_logs (gym_id, created_at desc);
create index audit_logs_gym_entity_idx   on public.audit_logs (gym_id, entity, entity_id);

-- ============================================================================
-- SECURITY HELPER FUNCTIONS
-- SECURITY DEFINER so they can read profiles without tripping profiles RLS
-- (avoids infinite policy recursion). search_path pinned for safety.
-- EXECUTE is revoked from anon/PUBLIC and granted to authenticated in 0004.
-- ============================================================================
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid();
$$;
comment on function public.current_profile_id() is 'Returns auth.uid() — the calling user''s profile id.';

create or replace function public.current_gym_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.gym_id from public.profiles p where p.id = auth.uid() limit 1;
$$;
comment on function public.current_gym_id() is
  'Returns the gym_id of the calling user''s profile, or null when the user has no profile. Used by every RLS policy.';

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role from public.profiles p where p.id = auth.uid() limit 1;
$$;
comment on function public.current_user_role() is
  'Returns the role (''owner''/''admin''/''front_desk''/''trainer'') of the calling user''s profile, or null.';

-- ============================================================================
-- TRIGGER: create a profile whenever a user signs up in auth.users
-- ----------------------------------------------------------------------------
-- Bootstrap: NO gyms are auto-created. The signup must carry
--   raw_user_meta_data = { "gym_id": "<uuid>", "role": "owner", "full_name": "..." }
-- If gym_id is missing (or the gym does not exist), nothing is created and the
-- account simply has no profile — see supabase/README.md for the first-owner flow.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_gym_id uuid;
  v_role   text := 'front_desk';
  v_name   text;
begin
  -- gym_id from metadata (tolerate malformed uuid instead of breaking signup)
  begin
    v_gym_id := (new.raw_user_meta_data ->> 'gym_id')::uuid;
  exception
    when invalid_text_representation then
      v_gym_id := null;
  end;

  if v_gym_id is null then
    return new;  -- no gym supplied: create nothing (bootstrap via README)
  end if;

  if not exists (select 1 from public.gyms g where g.id = v_gym_id) then
    return new;  -- unknown gym: create nothing rather than failing the signup
  end if;

  if new.raw_user_meta_data ->> 'role' in ('owner','admin','front_desk','trainer') then
    v_role := new.raw_user_meta_data ->> 'role';
  end if;

  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(new.email, ''), '@', 1)
  );

  insert into public.profiles (id, gym_id, full_name, email, phone, role)
  values (
    new.id,
    v_gym_id,
    v_name,
    new.email,
    new.raw_user_meta_data ->> 'phone',
    v_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
comment on function public.handle_new_user() is
  'AFTER INSERT on auth.users: creates the matching profiles row when raw_user_meta_data contains a valid gym_id. Never auto-creates gyms.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- End of 0001
-- ============================================================================
