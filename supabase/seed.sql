-- ============================================================================
-- Pulse Gym Suite — SEED DATA (demo gym)
-- ----------------------------------------------------------------------------
-- SAFE & NON-DESTRUCTIVE: every statement is an INSERT ... ON CONFLICT DO
-- NOTHING with deterministic UUIDs. Re-running this file never deletes,
-- updates or duplicates anything. It only fills in rows that are missing.
--
-- Everything demo is clearly identifiable:
--   * gym slug contains 'demo'            -> 'pulse-demo-gym'
--   * member codes are prefixed 'DEMO-'   -> DEMO-9001 .. DEMO-9012
--   * member notes contain '[DEMO SEED]'
--   * payment receipts use 'DEMO-R....'   -> never touches public.receipt_seq
--   * QR tokens are the fixed strings demo_qr_token_01 .. demo_qr_token_12
--     (deterministic, safe for local testing — real members always get
--     random tokens from the app)
--
-- HOW TO REMOVE DEMO DATA (run manually, NOT executed here):
--   1) Sign up an owner first (see below) or use the Supabase service role.
--   2) Uncomment in dependency order and run:
-- -- delete from public.payment_records     where gym_id = 'd3a7e001-0000-4000-8000-000000000001';
-- -- delete from public.attendance_records  where gym_id = 'd3a7e001-0000-4000-8000-000000000001';
-- -- delete from public.class_enrollments   where gym_id = 'd3a7e001-0000-4000-8000-000000000001';
-- -- delete from public.notifications        where gym_id = 'd3a7e001-0000-4000-8000-000000000001';
-- -- delete from public.gym_classes          where gym_id = 'd3a7e001-0000-4000-8000-000000000001';
-- -- delete from public.member_memberships   where gym_id = 'd3a7e001-0000-4000-8000-000000000001';
-- -- delete from public.members              where gym_id = 'd3a7e001-0000-4000-8000-000000000001';
-- -- delete from public.membership_plans     where gym_id = 'd3a7e001-0000-4000-8000-000000000001';
-- -- delete from public.staff_profiles       where gym_id = 'd3a7e001-0000-4000-8000-000000000001';
-- -- delete from public.audit_logs           where gym_id = 'd3a7e001-0000-4000-8000-000000000001';
-- -- delete from public.gym_settings         where gym_id = 'd3a7e001-0000-4000-8000-000000000001';
-- -- delete from public.gyms                 where id      = 'd3a7e001-0000-4000-8000-000000000001';
--
-- ----------------------------------------------------------------------------
-- CREATING THE FIRST OWNER (no auth.users rows are ever created here):
--   1. Run migrations 0001-0004 (and optionally this seed) so the gym exists.
--   2. Sign up through Supabase Auth (app signup page or Auth dashboard) with
--      user metadata:
--        { "gym_id": "d3a7e001-0000-4000-8000-000000000001",
--          "role": "owner", "full_name": "Gym Owner" }
--      (use YOUR gym's id for a real gym, not the demo one)
--   3. The handle_new_user() trigger in 0001 creates the profiles row with
--      role 'owner' automatically. No gyms are ever auto-created.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Demo gym + settings (settings are also auto-created by trigger; the
--    explicit INSERT below only fills in the row if the trigger did not run)
-- ----------------------------------------------------------------------------
insert into public.gyms (id, name, slug, timezone, currency, address, phone, email, is_active)
values ('d3a7e001-0000-4000-8000-000000000001',
        'Pulse Fitness Studio — Demo',
        'pulse-demo-gym',
        'Asia/Kolkata',
        'INR',
        '42, Wellness Road, Bengaluru, KA 560001',
        '+918040000001',
        'demo@pulsegymsuite.example',
        true)
on conflict do nothing;

insert into public.gym_settings (gym_id, checkin_cooldown_minutes, track_checkout,
                                 expiring_soon_days, expiry_reminder_days, allow_expired_checkin)
values ('d3a7e001-0000-4000-8000-000000000001', 60, true, 7, '{7,3,1}', false)
on conflict (gym_id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Membership plans (₹1,500 / ₹4,000 / ₹7,000 / ₹12,000)
-- ----------------------------------------------------------------------------
insert into public.membership_plans (id, gym_id, name, description, price,
                                     duration_value, duration_unit, benefits, is_active, sort_order)
values
  ('d3a7e001-0000-4000-8000-000000000011', 'd3a7e001-0000-4000-8000-000000000001',
   'Monthly', 'Full gym access for 1 month. [DEMO SEED]',
   1500.00, 1, 'month', array['Gym floor access','Locker'], true, 1),
  ('d3a7e001-0000-4000-8000-000000000012', 'd3a7e001-0000-4000-8000-000000000001',
   'Quarterly', 'Full gym access for 3 months. [DEMO SEED]',
   4000.00, 3, 'month', array['Gym floor access','Locker','1 body composition scan'], true, 2),
  ('d3a7e001-0000-4000-8000-000000000013', 'd3a7e001-0000-4000-8000-000000000001',
   'Half-Yearly', 'Full gym access for 6 months. [DEMO SEED]',
   7000.00, 6, 'month', array['Gym floor access','Locker','2 body composition scans','Group classes'], true, 3),
  ('d3a7e001-0000-4000-8000-000000000014', 'd3a7e001-0000-4000-8000-000000000001',
   'Annual', 'Full gym access for 12 months. [DEMO SEED]',
   12000.00, 12, 'month', array['Gym floor access','Locker','All group classes','Guest passes x4'], true, 4)
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 3. Members (DEMO-9001 .. DEMO-9012) with deterministic demo QR tokens
-- ----------------------------------------------------------------------------
insert into public.members (id, gym_id, member_code, full_name, email, phone,
                            gender, join_date, qr_token, qr_status, status, notes)
values
  ('d3a7e001-0000-4000-8000-000000000021', 'd3a7e001-0000-4000-8000-000000000001', 'DEMO-9001', 'Aarav Sharma',  'demo01@example.com', '+919810000001', 'male',   current_date - 40, 'demo_qr_token_01', 'active', 'active', '[DEMO SEED] Regular evening member.'),
  ('d3a7e001-0000-4000-8000-000000000022', 'd3a7e001-0000-4000-8000-000000000001', 'DEMO-9002', 'Diya Patel',    'demo02@example.com', '+919810000002', 'female', current_date - 30, 'demo_qr_token_02', 'active', 'active', '[DEMO SEED] Membership expires within 7 days.'),
  ('d3a7e001-0000-4000-8000-000000000023', 'd3a7e001-0000-4000-8000-000000000001', 'DEMO-9003', 'Rohan Verma',   'demo03@example.com', '+919810000003', 'male',   current_date - 100, 'demo_qr_token_03', 'active', 'active', '[DEMO SEED] Membership expired — renewal pending.'),
  ('d3a7e001-0000-4000-8000-000000000024', 'd3a7e001-0000-4000-8000-000000000001', 'DEMO-9004', 'Ananya Iyer',   'demo04@example.com', '+919810000004', 'female', current_date - 30, 'demo_qr_token_04', 'active', 'active', '[DEMO SEED] Membership suspended for non-payment.'),
  ('d3a7e001-0000-4000-8000-000000000025', 'd3a7e001-0000-4000-8000-000000000001', 'DEMO-9005', 'Kabir Singh',   'demo05@example.com', '+919810000005', 'male',   current_date - 40, 'demo_qr_token_05', 'active', 'active', '[DEMO SEED] Bought at a discounted price.'),
  ('d3a7e001-0000-4000-8000-000000000026', 'd3a7e001-0000-4000-8000-000000000001', 'DEMO-9006', 'Meera Nair',    'demo06@example.com', '+919810000006', 'female', current_date - 100, 'demo_qr_token_06', 'active', 'active', '[DEMO SEED] Annual member.'),
  ('d3a7e001-0000-4000-8000-000000000027', 'd3a7e001-0000-4000-8000-000000000001', 'DEMO-9007', 'Aditya Rao',    'demo07@example.com', '+919810000007', 'male',   current_date - 27, 'demo_qr_token_07', 'active', 'active', '[DEMO SEED] Expiring very soon (3 days).'),
  ('d3a7e001-0000-4000-8000-000000000028', 'd3a7e001-0000-4000-8000-000000000001', 'DEMO-9008', 'Ishita Bose',   'demo08@example.com', '+919810000008', 'female', current_date - 20, 'demo_qr_token_08', 'active', 'active', '[DEMO SEED] Partial payment pending.'),
  ('d3a7e001-0000-4000-8000-000000000029', 'd3a7e001-0000-4000-8000-000000000001', 'DEMO-9009', 'Vihaan Gupta',  'demo09@example.com', '+919810000009', 'male',   current_date - 50, 'demo_qr_token_09', 'active', 'active', '[DEMO SEED] Cancelled annual membership.'),
  ('d3a7e001-0000-4000-8000-00000000002A', 'd3a7e001-0000-4000-8000-000000000001', 'DEMO-9010', 'Sara Khan',     'demo10@example.com', '+919810000010', 'female', current_date - 120, 'demo_qr_token_10', 'active', 'active', '[DEMO SEED] Long-expired quarterly member.'),
  ('d3a7e001-0000-4000-8000-00000000002B', 'd3a7e001-0000-4000-8000-000000000001', 'DEMO-9011', 'Arjun Mehta',   'demo11@example.com', '+919810000011', 'male',   current_date - 5,  'demo_qr_token_11', 'active', 'active', '[DEMO SEED] Fresh renewal, payment still pending.'),
  ('d3a7e001-0000-4000-8000-00000000002C', 'd3a7e001-0000-4000-8000-000000000001', 'DEMO-9012', 'Nisha Reddy',   'demo12@example.com', '+919810000012', 'female', current_date - 28, 'demo_qr_token_12', 'active', 'active', '[DEMO SEED] Expiring in 2 days, small discount applied.')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 4. Memberships in mixed states
--    41 active comfortable | 42 expiring +5d | 43 expired | 44 suspended
--    45 active (discounted) | 46 active annual | 47 expiring +3d
--    48 active half-yearly | 49 cancelled | 4A expired | 4B active (no payment)
--    4C expiring +2d (discounted)
-- ----------------------------------------------------------------------------
insert into public.member_memberships (id, gym_id, member_id, plan_id, start_date, end_date,
                                       status, price, discount, source, notes)
values
  ('d3a7e001-0000-4000-8000-000000000041', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000021', 'd3a7e001-0000-4000-8000-000000000011', current_date - 10, current_date + 20, 'active',    1500.00,    0.00, 'new', '[DEMO SEED]'),
  ('d3a7e001-0000-4000-8000-000000000042', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000022', 'd3a7e001-0000-4000-8000-000000000011', current_date - 25, current_date + 5,  'active',    1500.00,    0.00, 'new', '[DEMO SEED] Expiring within 7 days.'),
  ('d3a7e001-0000-4000-8000-000000000043', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000023', 'd3a7e001-0000-4000-8000-000000000012', current_date - 100, current_date - 10, 'active',   4000.00,    0.00, 'new', '[DEMO SEED] Expired 10 days ago.'),
  ('d3a7e001-0000-4000-8000-000000000044', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000024', 'd3a7e001-0000-4000-8000-000000000013', current_date - 30, current_date + 150, 'suspended', 7000.00,    0.00, 'new', '[DEMO SEED] Suspended for non-payment.'),
  ('d3a7e001-0000-4000-8000-000000000045', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000025', 'd3a7e001-0000-4000-8000-000000000012', current_date - 40, current_date + 50, 'active',    4000.00,  500.00, 'new', '[DEMO SEED] Festive discount ₹500.'),
  ('d3a7e001-0000-4000-8000-000000000046', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000026', 'd3a7e001-0000-4000-8000-000000000014', current_date - 100, current_date + 265, 'active',   12000.00,   0.00, 'new', '[DEMO SEED]'),
  ('d3a7e001-0000-4000-8000-000000000047', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000027', 'd3a7e001-0000-4000-8000-000000000011', current_date - 27, current_date + 3,  'active',    1500.00,    0.00, 'new', '[DEMO SEED] Expiring in 3 days.'),
  ('d3a7e001-0000-4000-8000-000000000048', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000028', 'd3a7e001-0000-4000-8000-000000000013', current_date - 20, current_date + 160, 'active',    7000.00,    0.00, 'new', '[DEMO SEED]'),
  ('d3a7e001-0000-4000-8000-000000000049', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000029', 'd3a7e001-0000-4000-8000-000000000014', current_date - 50, current_date + 315, 'cancelled', 12000.00,   0.00, 'new', '[DEMO SEED] Cancelled by member.'),
  ('d3a7e001-0000-4000-8000-00000000004A', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-00000000002A', 'd3a7e001-0000-4000-8000-000000000012', current_date - 120, current_date - 30, 'active',    4000.00,    0.00, 'new', '[DEMO SEED] Expired 30 days ago.'),
  ('d3a7e001-0000-4000-8000-00000000004B', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-00000000002B', 'd3a7e001-0000-4000-8000-000000000012', current_date - 5,  current_date + 85, 'active',    4000.00,    0.00, 'renewal', '[DEMO SEED] Pending payment case.'),
  ('d3a7e001-0000-4000-8000-00000000004C', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-00000000002C', 'd3a7e001-0000-4000-8000-000000000011', current_date - 28, current_date + 2,  'active',    1500.00,  100.00, 'renewal', '[DEMO SEED] Expiring in 2 days.')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 5. Attendance — last 14 days. Timestamps are deterministic (relative to
--    current_date) so re-runs hit the unique (member, minute) index and skip.
--    NOTE: timestamp literals are interpreted in the session timezone
--    (UTC on Supabase) — fine for demo data.
-- ----------------------------------------------------------------------------
insert into public.attendance_records (id, gym_id, member_id, membership_id, check_in, check_out, status, method, notes)
values
  ('d3a7e001-0000-4000-8000-000000000051', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000021', 'd3a7e001-0000-4000-8000-000000000041', (current_date - 10)::timestamp + interval '18 hours 30 minutes', (current_date - 10)::timestamp + interval '20 hours', 'checked_out', 'qr',    '[DEMO SEED]'),
  ('d3a7e001-0000-4000-8000-000000000052', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000021', 'd3a7e001-0000-4000-8000-000000000041', (current_date - 3)::timestamp + interval '6 hours 30 minutes',  (current_date - 3)::timestamp + interval '7 hours 45 minutes', 'checked_out', 'qr',    '[DEMO SEED]'),
  ('d3a7e001-0000-4000-8000-000000000053', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000021', 'd3a7e001-0000-4000-8000-000000000041', (current_date)::timestamp + interval '6 hours 30 minutes',      null,                                             'checked_in',  'qr',    '[DEMO SEED] Still checked in.'),
  ('d3a7e001-0000-4000-8000-000000000054', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000022', 'd3a7e001-0000-4000-8000-000000000042', (current_date - 7)::timestamp + interval '19 hours',          (current_date - 7)::timestamp + interval '20 hours', 'checked_out', 'qr',    '[DEMO SEED]'),
  ('d3a7e001-0000-4000-8000-000000000055', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000022', 'd3a7e001-0000-4000-8000-000000000042', (current_date - 2)::timestamp + interval '19 hours',          (current_date - 2)::timestamp + interval '20 hours', 'checked_out', 'qr',    '[DEMO SEED]'),
  ('d3a7e001-0000-4000-8000-000000000056', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000025', 'd3a7e001-0000-4000-8000-000000000045', (current_date - 6)::timestamp + interval '7 hours 15 minutes', (current_date - 6)::timestamp + interval '8 hours',    'checked_out', 'manual', '[DEMO SEED] Front-desk manual entry.'),
  ('d3a7e001-0000-4000-8000-000000000057', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000025', 'd3a7e001-0000-4000-8000-000000000045', (current_date - 1)::timestamp + interval '7 hours 15 minutes', (current_date - 1)::timestamp + interval '8 hours',    'checked_out', 'qr',    '[DEMO SEED]'),
  ('d3a7e001-0000-4000-8000-000000000058', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000026', 'd3a7e001-0000-4000-8000-000000000046', (current_date - 9)::timestamp + interval '20 hours',          (current_date - 9)::timestamp + interval '21 hours 10 minutes', 'checked_out', 'qr', '[DEMO SEED]'),
  ('d3a7e001-0000-4000-8000-000000000059', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000026', 'd3a7e001-0000-4000-8000-000000000046', (current_date - 4)::timestamp + interval '20 hours',          (current_date - 4)::timestamp + interval '21 hours 10 minutes', 'checked_out', 'qr', '[DEMO SEED]'),
  ('d3a7e001-0000-4000-8000-00000000005A', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000027', 'd3a7e001-0000-4000-8000-000000000047', (current_date - 5)::timestamp + interval '18 hours',          (current_date - 5)::timestamp + interval '19 hours', 'checked_out', 'qr',    '[DEMO SEED]'),
  ('d3a7e001-0000-4000-8000-00000000005B', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000027', 'd3a7e001-0000-4000-8000-000000000047', (current_date - 1)::timestamp + interval '18 hours',          (current_date - 1)::timestamp + interval '19 hours', 'checked_out', 'qr',    '[DEMO SEED]'),
  ('d3a7e001-0000-4000-8000-00000000005C', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000028', 'd3a7e001-0000-4000-8000-000000000048', (current_date - 8)::timestamp + interval '17 hours 30 minutes', (current_date - 8)::timestamp + interval '18 hours 30 minutes', 'checked_out', 'qr', '[DEMO SEED]'),
  ('d3a7e001-0000-4000-8000-00000000005D', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-00000000002B', 'd3a7e001-0000-4000-8000-00000000004B', (current_date - 4)::timestamp + interval '8 hours',           (current_date - 4)::timestamp + interval '8 hours 50 minutes', 'checked_out', 'qr', '[DEMO SEED]'),
  ('d3a7e001-0000-4000-8000-00000000005E', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-00000000002C', 'd3a7e001-0000-4000-8000-00000000004C', (current_date - 2)::timestamp + interval '19 hours 30 minutes', (current_date - 2)::timestamp + interval '20 hours 30 minutes', 'checked_out', 'qr', '[DEMO SEED]')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 6. Payments — mostly paid; one partial (R0008) and one pending (R0011).
--    Receipt numbers use the DEMO-R prefix so the real receipt_seq is untouched.
-- ----------------------------------------------------------------------------
insert into public.payment_records (id, gym_id, member_id, membership_id, amount, payment_date,
                                    method, status, transaction_ref, notes, receipt_no)
values
  ('d3a7e001-0000-4000-8000-000000000061', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000021', 'd3a7e001-0000-4000-8000-000000000041', 1500.00, current_date - 10, 'cash',         'paid',    'UPI-DEMO-6001', '[DEMO SEED]', 'DEMO-R0001'),
  ('d3a7e001-0000-4000-8000-000000000062', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000022', 'd3a7e001-0000-4000-8000-000000000042', 1500.00, current_date - 25, 'upi',          'paid',    'UPI-DEMO-6002', '[DEMO SEED]', 'DEMO-R0002'),
  ('d3a7e001-0000-4000-8000-000000000063', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000023', 'd3a7e001-0000-4000-8000-000000000043', 4000.00, current_date - 100, 'card',         'paid',    'CARD-DEMO-6003', '[DEMO SEED]', 'DEMO-R0003'),
  ('d3a7e001-0000-4000-8000-000000000064', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000024', 'd3a7e001-0000-4000-8000-000000000044', 7000.00, current_date - 30, 'bank_transfer','paid',    'NEFT-DEMO-6004', '[DEMO SEED] Payment later reversed -> membership suspended.', 'DEMO-R0004'),
  ('d3a7e001-0000-4000-8000-000000000065', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000025', 'd3a7e001-0000-4000-8000-000000000045', 3500.00, current_date - 40, 'upi',          'paid',    'UPI-DEMO-6005', '[DEMO SEED] ₹500 discount applied.', 'DEMO-R0005'),
  ('d3a7e001-0000-4000-8000-000000000066', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000026', 'd3a7e001-0000-4000-8000-000000000046', 12000.00, current_date - 100, 'bank_transfer','paid',   'NEFT-DEMO-6006', '[DEMO SEED]', 'DEMO-R0006'),
  ('d3a7e001-0000-4000-8000-000000000067', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000027', 'd3a7e001-0000-4000-8000-000000000047', 1500.00, current_date - 27, 'cash',         'paid',    null,             '[DEMO SEED]', 'DEMO-R0007'),
  ('d3a7e001-0000-4000-8000-000000000068', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000028', 'd3a7e001-0000-4000-8000-000000000048', 3000.00, current_date - 20, 'upi',          'partial', 'UPI-DEMO-6008', '[DEMO SEED] ₹4,000 of ₹7,000 still due.', 'DEMO-R0008'),
  ('d3a7e001-0000-4000-8000-000000000069', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000029', 'd3a7e001-0000-4000-8000-000000000049', 12000.00, current_date - 50, 'card',         'paid',    'CARD-DEMO-6009', '[DEMO SEED] Refund handled offline.', 'DEMO-R0009'),
  ('d3a7e001-0000-4000-8000-00000000006A', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-00000000002A', 'd3a7e001-0000-4000-8000-00000000004A', 4000.00, current_date - 120, 'cash',         'paid',    null,             '[DEMO SEED]', 'DEMO-R0010'),
  ('d3a7e001-0000-4000-8000-00000000006B', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-00000000002B', 'd3a7e001-0000-4000-8000-00000000004B', 4000.00, current_date - 5,  'upi',          'pending', null,             '[DEMO SEED] Renewal taken, payment promised.', 'DEMO-R0011'),
  ('d3a7e001-0000-4000-8000-00000000006C', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-00000000002C', 'd3a7e001-0000-4000-8000-00000000004C', 1400.00, current_date - 28, 'upi',          'paid',    'UPI-DEMO-6012', '[DEMO SEED] ₹100 discount applied.', 'DEMO-R0012')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 7. Staff / trainers
-- ----------------------------------------------------------------------------
insert into public.staff_profiles (id, gym_id, profile_id, full_name, email, phone,
                                   role, specialization, employment_status, joining_date, notes)
values
  ('d3a7e001-0000-4000-8000-000000000071', 'd3a7e001-0000-4000-8000-000000000001', null, 'Ananya Rao',  'ananya.trainer@example.com',  '+919820000001', 'trainer', 'Yoga & mobility',        'active', current_date - 200, '[DEMO SEED]'),
  ('d3a7e001-0000-4000-8000-000000000072', 'd3a7e001-0000-4000-8000-000000000001', null, 'Vikram Singh', 'vikram.trainer@example.com', '+919820000002', 'trainer', 'Strength & conditioning', 'active', current_date - 150, '[DEMO SEED]'),
  ('d3a7e001-0000-4000-8000-000000000073', 'd3a7e001-0000-4000-8000-000000000001', null, 'Meera Iyer',   'meera.trainer@example.com',   '+919820000003', 'trainer', 'Cardio & HIIT',          'on_leave', current_date - 90, '[DEMO SEED]')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 8. Upcoming classes + enrollments
-- ----------------------------------------------------------------------------
insert into public.gym_classes (id, gym_id, name, description, trainer_id, starts_at,
                                duration_minutes, capacity, status)
values
  ('d3a7e001-0000-4000-8000-000000000081', 'd3a7e001-0000-4000-8000-000000000001', 'Sunset Yoga Flow',   'Relaxing vinyasa flow to end the day. [DEMO SEED]', 'd3a7e001-0000-4000-8000-000000000071', date_trunc('day', now()) + interval '2 days' + interval '17 hours 30 minutes', 60, 20, 'scheduled'),
  ('d3a7e001-0000-4000-8000-000000000082', 'd3a7e001-0000-4000-8000-000000000001', 'Strength Bootcamp',  'Full-body barbell circuit. [DEMO SEED]',            'd3a7e001-0000-4000-8000-000000000072', date_trunc('day', now()) + interval '3 days' + interval '7 hours',        45, 15, 'scheduled'),
  ('d3a7e001-0000-4000-8000-000000000083', 'd3a7e001-0000-4000-8000-000000000001', 'HIIT Blast',         'High-intensity intervals, all levels. [DEMO SEED]', 'd3a7e001-0000-4000-8000-000000000073', date_trunc('day', now()) + interval '5 days' + interval '19 hours',        45, 25, 'scheduled')
on conflict do nothing;

insert into public.class_enrollments (id, gym_id, class_id, member_id, status, enrolled_at)
values
  ('d3a7e001-0000-4000-8000-000000000091', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000081', 'd3a7e001-0000-4000-8000-000000000021', 'enrolled', now() - interval '2 days'),
  ('d3a7e001-0000-4000-8000-000000000092', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000081', 'd3a7e001-0000-4000-8000-000000000022', 'enrolled', now() - interval '1 day'),
  ('d3a7e001-0000-4000-8000-000000000093', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000081', 'd3a7e001-0000-4000-8000-000000000025', 'enrolled', now() - interval '1 day'),
  ('d3a7e001-0000-4000-8000-000000000094', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000082', 'd3a7e001-0000-4000-8000-000000000023', 'enrolled', now() - interval '3 hours'),
  ('d3a7e001-0000-4000-8000-000000000095', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000082', 'd3a7e001-0000-4000-8000-000000000024', 'cancelled', now() - interval '5 hours'),
  ('d3a7e001-0000-4000-8000-000000000096', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000082', 'd3a7e001-0000-4000-8000-000000000026', 'enrolled', now() - interval '6 hours'),
  ('d3a7e001-0000-4000-8000-000000000097', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000083', 'd3a7e001-0000-4000-8000-000000000027', 'enrolled', now() - interval '12 hours'),
  ('d3a7e001-0000-4000-8000-000000000098', 'd3a7e001-0000-4000-8000-000000000001', 'd3a7e001-0000-4000-8000-000000000083', 'd3a7e001-0000-4000-8000-000000000028', 'enrolled', now() - interval '12 hours')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 9. Notifications (dedupe keys match the RPC convention, so running
--    generate_expiry_notifications() later will not duplicate these)
-- ----------------------------------------------------------------------------
insert into public.notifications (id, gym_id, user_id, member_id, type, title, body, severity, is_read, dedupe_key, link)
values
  ('d3a7e001-0000-4000-8000-0000000000A1', 'd3a7e001-0000-4000-8000-000000000001', null, 'd3a7e001-0000-4000-8000-000000000022', 'expiry_warning', 'Membership expiring soon', 'Diya Patel (DEMO-9002) — membership ends within a week.', 'warning', false, 'd3a7e001-0000-4000-8000-000000000022:d3a7e001-0000-4000-8000-000000000042:expiry_warning', '/members/d3a7e001-0000-4000-8000-000000000022'),
  ('d3a7e001-0000-4000-8000-0000000000A2', 'd3a7e001-0000-4000-8000-000000000001', null, 'd3a7e001-0000-4000-8000-000000000027', 'expiry_warning', 'Membership expiring soon', 'Aditya Rao (DEMO-9007) — membership ends in 3 days.', 'warning', false, 'd3a7e001-0000-4000-8000-000000000027:d3a7e001-0000-4000-8000-000000000047:expiry_warning', '/members/d3a7e001-0000-4000-8000-000000000027'),
  ('d3a7e001-0000-4000-8000-0000000000A3', 'd3a7e001-0000-4000-8000-000000000001', null, null, 'general', 'Welcome to Pulse Gym Suite', 'This is demo data — see supabase/README.md to remove it.', 'info', false, 'demo-seed:welcome', '/settings')
on conflict do nothing;

-- ============================================================================
-- End of seed. Re-running is always safe.
-- ============================================================================
