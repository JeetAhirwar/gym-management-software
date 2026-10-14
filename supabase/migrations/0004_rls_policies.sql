-- ============================================================================
-- Pulse Gym Suite — Migration 0004: Privileges + Row Level Security
-- ----------------------------------------------------------------------------
-- Runs after 0001–0003.
--
-- SECURITY MODEL (read me first):
--   * DEFAULT DENY. There is NO permissive "to public using (true)" policy on
--     any table anywhere in this schema. Every table is tenant-scoped by
--     gym_id = public.current_gym_id() and, where relevant, by role.
--   * anon and the PUBLIC pseudo-role get NOTHING: no table privileges, no
--     function EXECUTE, no sequences.
--   * Clients never insert attendance or payments directly — only the
--     security-definer RPCs (record_attendance / record_payment) do.
--   * attendance_records and payment_records have NO delete policy at all:
--     corrections are done via UPDATE (which is audited by triggers).
--   * audit_logs has no client insert/update/delete policy: it is written only
--     by trigger functions and security-definer RPCs.
--   * membership_plans has no delete policy: archive with is_active = false.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DEFAULT DENY — strip everything from anon and PUBLIC
-- ----------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, public;
revoke all on all sequences in schema public from anon, public;
revoke execute on all functions in schema public from anon, public;

-- Supabase normally grants USAGE on schema public to authenticated; make it explicit.
grant usage on schema public to authenticated;

-- ----------------------------------------------------------------------------
-- 2. TABLE GRANTS — authenticated only, per-table, minimum needed
--    (Row-level policies below further restrict these table-wide grants.)
-- ----------------------------------------------------------------------------
-- gyms: read + settings-ish update (policies restrict to own gym / owner+admin)
grant select, update on table public.gyms to authenticated;

-- profiles: read own/gym, owner+admin can add staff, users can edit own row
grant select, insert, update on table public.profiles to authenticated;

-- gym_settings: read + owner/admin update
grant select, update on table public.gym_settings to authenticated;

-- members: CRUD (delete restricted to owner/admin by policy)
grant select, insert, update, delete on table public.members to authenticated;

-- membership_plans: no delete grant — archive via is_active
grant select, insert, update on table public.membership_plans to authenticated;

-- member_memberships: no delete grant — history must not vanish
grant select, insert, update on table public.member_memberships to authenticated;

-- attendance_records: no insert (RPC only), no delete (corrections via update)
grant select, update on table public.attendance_records to authenticated;

-- payment_records: no insert (RPC only), no delete (financial history)
grant select, update on table public.payment_records to authenticated;

-- staff_profiles: CRUD within gym (owner/admin by policy)
grant select, insert, update, delete on table public.staff_profiles to authenticated;

-- gym_classes: CRUD within gym (owner/admin by policy)
grant select, insert, update, delete on table public.gym_classes to authenticated;

-- class_enrollments: CRUD within gym (delete owner/admin by policy)
grant select, insert, update, delete on table public.class_enrollments to authenticated;

-- notifications: read + mark-own-as-read only; no client insert
grant select, update on table public.notifications to authenticated;

-- audit_logs: read-only for owner/admin (policies below)
grant select on table public.audit_logs to authenticated;

-- ----------------------------------------------------------------------------
-- 3. FUNCTION GRANTS — EXECUTE for authenticated (and service_role for
--    server-side/API usage). Everything else stays revoked.
-- ----------------------------------------------------------------------------
grant execute on function public.current_gym_id() to authenticated, service_role;
grant execute on function public.current_user_role() to authenticated, service_role;
grant execute on function public.current_profile_id() to authenticated, service_role;
grant execute on function public.record_attendance(text, text, text) to authenticated, service_role;
grant execute on function public.rotate_qr_token(uuid) to authenticated, service_role;
grant execute on function public.renew_membership(uuid, uuid, date, numeric, text, text) to authenticated, service_role;
grant execute on function public.record_payment(uuid, uuid, numeric, text, date, text, text, text) to authenticated, service_role;
grant execute on function public.generate_expiry_notifications() to authenticated, service_role;

-- ============================================================================
-- 4. ROW LEVEL SECURITY — enabled on EVERY table
-- ============================================================================
alter table public.gyms               enable row level security;
alter table public.profiles           enable row level security;
alter table public.gym_settings       enable row level security;
alter table public.members            enable row level security;
alter table public.membership_plans   enable row level security;
alter table public.member_memberships enable row level security;
alter table public.attendance_records enable row level security;
alter table public.payment_records    enable row level security;
alter table public.staff_profiles     enable row level security;
alter table public.gym_classes        enable row level security;
alter table public.class_enrollments  enable row level security;
alter table public.notifications      enable row level security;
alter table public.audit_logs         enable row level security;

-- ----------------------------------------------------------------------------
-- 4.1 gyms
-- ----------------------------------------------------------------------------
create policy gyms_select_own
  on public.gyms for select
  using (id = public.current_gym_id());

create policy gyms_update_owner_admin
  on public.gyms for update
  using (id = public.current_gym_id() and public.current_user_role() in ('owner','admin'))
  with check (id = public.current_gym_id() and public.current_user_role() in ('owner','admin'));
-- No insert policy (gyms are provisioned by ops/service role), no delete policy.

-- ----------------------------------------------------------------------------
-- 4.2 profiles
-- ----------------------------------------------------------------------------
create policy profiles_select_self_or_gym
  on public.profiles for select
  using (id = auth.uid() or gym_id = public.current_gym_id());

create policy profiles_insert_owner_admin
  on public.profiles for insert
  with check (gym_id = public.current_gym_id() and public.current_user_role() in ('owner','admin'));

-- Users may edit their OWN row, but may not move themselves to another gym or
-- escalate their own role (both are compared against the pre-update values via
-- the stable helper functions). Owner/admin may edit anyone in their gym.
create policy profiles_update_self_or_owner_admin
  on public.profiles for update
  using (
    id = auth.uid()
    or (gym_id = public.current_gym_id() and public.current_user_role() in ('owner','admin'))
  )
  with check (
    ( id = auth.uid()
      and gym_id = public.current_gym_id()
      and role  = public.current_user_role() )
    or ( gym_id = public.current_gym_id()
         and public.current_user_role() in ('owner','admin') )
  );
-- No delete policy: staff accounts are deactivated (is_active = false).

-- ----------------------------------------------------------------------------
-- 4.3 gym_settings
-- ----------------------------------------------------------------------------
create policy gym_settings_select_gym
  on public.gym_settings for select
  using (gym_id = public.current_gym_id());

create policy gym_settings_update_owner_admin
  on public.gym_settings for update
  using (gym_id = public.current_gym_id() and public.current_user_role() in ('owner','admin'))
  with check (gym_id = public.current_gym_id() and public.current_user_role() in ('owner','admin'));
-- Rows are auto-created by trigger; no client insert/delete policies.

-- ----------------------------------------------------------------------------
-- 4.4 members
-- ----------------------------------------------------------------------------
create policy members_select_gym
  on public.members for select
  using (gym_id = public.current_gym_id());

create policy members_insert_staff
  on public.members for insert
  with check (gym_id = public.current_gym_id()
              and public.current_user_role() in ('owner','admin','front_desk'));

create policy members_update_staff
  on public.members for update
  using (gym_id = public.current_gym_id()
         and public.current_user_role() in ('owner','admin','front_desk'))
  with check (gym_id = public.current_gym_id()
              and public.current_user_role() in ('owner','admin','front_desk'));

create policy members_delete_owner_admin
  on public.members for delete
  using (gym_id = public.current_gym_id() and public.current_user_role() in ('owner','admin'));
-- NOTE: even owner/admin deletion will fail at the FK level once the member
-- has payment history (payment_records.member_id is ON DELETE RESTRICT).

-- ----------------------------------------------------------------------------
-- 4.5 membership_plans — archive via is_active, never delete from the app
-- ----------------------------------------------------------------------------
create policy membership_plans_select_gym
  on public.membership_plans for select
  using (gym_id = public.current_gym_id());

create policy membership_plans_insert_owner_admin
  on public.membership_plans for insert
  with check (gym_id = public.current_gym_id() and public.current_user_role() in ('owner','admin'));

create policy membership_plans_update_owner_admin
  on public.membership_plans for update
  using (gym_id = public.current_gym_id() and public.current_user_role() in ('owner','admin'))
  with check (gym_id = public.current_gym_id() and public.current_user_role() in ('owner','admin'));
-- NO delete policy (and no delete grant): sold plans are archived, not removed.

-- ----------------------------------------------------------------------------
-- 4.6 member_memberships — no delete policy (history)
-- ----------------------------------------------------------------------------
create policy member_memberships_select_gym
  on public.member_memberships for select
  using (gym_id = public.current_gym_id());

create policy member_memberships_insert_staff
  on public.member_memberships for insert
  with check (gym_id = public.current_gym_id()
              and public.current_user_role() in ('owner','admin','front_desk'));

-- Corrections (e.g. suspensions, status fixes) are owner/admin decisions.
create policy member_memberships_update_owner_admin
  on public.member_memberships for update
  using (gym_id = public.current_gym_id() and public.current_user_role() in ('owner','admin'))
  with check (gym_id = public.current_gym_id() and public.current_user_role() in ('owner','admin'));
-- NO delete policy: renewals insert new rows, old rows are kept forever.

-- ----------------------------------------------------------------------------
-- 4.7 attendance_records — reads yes; INSERT only via record_attendance() RPC
--     (which runs security-definer and bypasses RLS); UPDATE for corrections;
--     NO delete policy at all.
-- ----------------------------------------------------------------------------
create policy attendance_select_gym
  on public.attendance_records for select
  using (gym_id = public.current_gym_id());

-- deliberately NO insert policy — clients must call public.record_attendance()

create policy attendance_update_staff
  on public.attendance_records for update
  using (gym_id = public.current_gym_id()
         and public.current_user_role() in ('owner','admin','front_desk'))
  with check (gym_id = public.current_gym_id()
              and public.current_user_role() in ('owner','admin','front_desk'));

-- deliberately NO delete policy — history is corrected via audited updates

-- ----------------------------------------------------------------------------
-- 4.8 payment_records — reads yes; INSERT only via record_payment() RPC;
--     corrections via audited UPDATE; NO delete policy (financial history).
-- ----------------------------------------------------------------------------
create policy payment_records_select_gym
  on public.payment_records for select
  using (gym_id = public.current_gym_id());

-- deliberately NO insert policy — clients must call public.record_payment()

create policy payment_records_update_staff
  on public.payment_records for update
  using (gym_id = public.current_gym_id()
         and public.current_user_role() in ('owner','admin','front_desk'))
  with check (gym_id = public.current_gym_id()
              and public.current_user_role() in ('owner','admin','front_desk'));

-- deliberately NO delete policy — financial history is never hard-deleted

-- ----------------------------------------------------------------------------
-- 4.9 staff_profiles
-- ----------------------------------------------------------------------------
create policy staff_profiles_select_gym
  on public.staff_profiles for select
  using (gym_id = public.current_gym_id());

create policy staff_profiles_insert_owner_admin
  on public.staff_profiles for insert
  with check (gym_id = public.current_gym_id() and public.current_user_role() in ('owner','admin'));

create policy staff_profiles_update_owner_admin
  on public.staff_profiles for update
  using (gym_id = public.current_gym_id() and public.current_user_role() in ('owner','admin'))
  with check (gym_id = public.current_gym_id() and public.current_user_role() in ('owner','admin'));

create policy staff_profiles_delete_owner_admin
  on public.staff_profiles for delete
  using (gym_id = public.current_gym_id() and public.current_user_role() in ('owner','admin'));

-- ----------------------------------------------------------------------------
-- 4.10 gym_classes
-- ----------------------------------------------------------------------------
create policy gym_classes_select_gym
  on public.gym_classes for select
  using (gym_id = public.current_gym_id());

create policy gym_classes_insert_owner_admin
  on public.gym_classes for insert
  with check (gym_id = public.current_gym_id() and public.current_user_role() in ('owner','admin'));

create policy gym_classes_update_owner_admin
  on public.gym_classes for update
  using (gym_id = public.current_gym_id() and public.current_user_role() in ('owner','admin'))
  with check (gym_id = public.current_gym_id() and public.current_user_role() in ('owner','admin'));

create policy gym_classes_delete_owner_admin
  on public.gym_classes for delete
  using (gym_id = public.current_gym_id() and public.current_user_role() in ('owner','admin'));

-- ----------------------------------------------------------------------------
-- 4.11 class_enrollments
-- ----------------------------------------------------------------------------
create policy class_enrollments_select_gym
  on public.class_enrollments for select
  using (gym_id = public.current_gym_id());

create policy class_enrollments_insert_staff
  on public.class_enrollments for insert
  with check (gym_id = public.current_gym_id()
              and public.current_user_role() in ('owner','admin','front_desk'));

create policy class_enrollments_update_staff
  on public.class_enrollments for update
  using (gym_id = public.current_gym_id()
         and public.current_user_role() in ('owner','admin','front_desk'))
  with check (gym_id = public.current_gym_id()
              and public.current_user_role() in ('owner','admin','front_desk'));

create policy class_enrollments_delete_owner_admin
  on public.class_enrollments for delete
  using (gym_id = public.current_gym_id() and public.current_user_role() in ('owner','admin'));

-- ----------------------------------------------------------------------------
-- 4.12 notifications — broadcasts (user_id is null) + own rows;
--      users may only mark their OWN rows read; no client inserts.
-- ----------------------------------------------------------------------------
create policy notifications_select_broadcast_or_own
  on public.notifications for select
  using (gym_id = public.current_gym_id()
         and (user_id is null or user_id = auth.uid()));

create policy notifications_update_own
  on public.notifications for update
  using (gym_id = public.current_gym_id() and user_id = auth.uid())
  with check (gym_id = public.current_gym_id() and user_id = auth.uid());
-- deliberately NO insert policy — rows are created by generate_expiry_notifications()
-- and other security-definer code paths.

-- ----------------------------------------------------------------------------
-- 4.13 audit_logs — owner/admin read-only; written only by triggers/RPCs
-- ----------------------------------------------------------------------------
create policy audit_logs_select_owner_admin
  on public.audit_logs for select
  using (gym_id = public.current_gym_id() and public.current_user_role() in ('owner','admin'));
-- deliberately NO insert / update / delete policies for clients.

-- ============================================================================
-- End of 0004. Remember: NO permissive "using (true)" policy exists anywhere.
-- ============================================================================
