-- =====================================================================
-- MIGRATION 005 — FIX FARM CREATION (RLS recursion + missing policies)
-- Run this on any farm that already deployed an earlier version and is
-- hitting "infinite recursion detected in policy for relation farm_users"
-- or "new row violates row-level security policy" when creating a farm.
-- Fresh installs get this automatically — it's folded into supabase/schema.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Root causes (three separate bugs, all in how farm creation is guarded):
--
--    a) farm_users' own SELECT/INSERT/UPDATE policies queried farm_users
--       directly from within their own policy bodies. Postgres cannot
--       resolve a policy on a table that queries that same table from
--       inside itself, and fails with "infinite recursion detected in
--       policy for relation farm_users".
--
--    b) Even without (a), the very first farm_users row for a brand-new
--       farm could never satisfy an "already an admin of this farm" check,
--       since no such row exists yet at that moment (bootstrap problem).
--
--    c) The `users` table had no INSERT policy at all (only SELECT/UPDATE),
--       which would block a genuinely new user's very first onboarding step.
--
--    Fix: route every self-check through SECURITY DEFINER helper functions
--    (which bypass RLS as the table owner, breaking the recursion cycle),
--    and explicitly allow the bootstrap case.
-- ---------------------------------------------------------------------

create or replace function is_farm_admin_or_manager(target_farm_id uuid)
returns boolean as $$
  select exists (
    select 1 from farm_users
    where farm_id = target_farm_id
      and user_id = auth.uid()
      and status = 'active'
      and role in ('admin', 'manager')
  );
$$ language sql security definer stable;

create or replace function is_farm_admin(target_farm_id uuid)
returns boolean as $$
  select exists (
    select 1 from farm_users
    where farm_id = target_farm_id
      and user_id = auth.uid()
      and status = 'active'
      and role = 'admin'
  );
$$ language sql security definer stable;

create or replace function farm_has_no_members(target_farm_id uuid)
returns boolean as $$
  select not exists (select 1 from farm_users where farm_id = target_farm_id);
$$ language sql security definer stable;

-- --- farms ---
drop policy if exists farm_visible_to_members on farms;
drop policy if exists farm_update_by_admin on farms;
drop policy if exists farm_insert_by_any_signed_in_user on farms;

create policy farm_visible_to_members on farms for select using (is_farm_member(id));
create policy farm_update_by_admin on farms for update using (is_farm_admin(id));
create policy farm_insert_by_any_signed_in_user on farms for insert with check (auth.uid() is not null);

-- --- farm_users ---
drop policy if exists farm_users_visible on farm_users;
drop policy if exists farm_users_managed_by_admin on farm_users;
drop policy if exists farm_users_insert on farm_users;
drop policy if exists farm_users_updated_by_admin on farm_users;

create policy farm_users_visible on farm_users for select using (is_farm_member(farm_id));
create policy farm_users_insert on farm_users for insert with check (
  (user_id = auth.uid() and role = 'admin' and farm_has_no_members(farm_id))
  or is_farm_admin_or_manager(farm_id)
);
create policy farm_users_updated_by_admin on farm_users for update using (is_farm_admin_or_manager(farm_id));

-- --- users (missing INSERT policy) ---
drop policy if exists users_self_insert on users;
create policy users_self_insert on users for insert with check (id = auth.uid());

comment on function is_farm_admin_or_manager is
  'SECURITY DEFINER helper — checks farm_users without triggering RLS recursion on farm_users itself.';
comment on function is_farm_admin is
  'SECURITY DEFINER helper — checks farm_users without triggering RLS recursion on farm_users itself.';
comment on function farm_has_no_members is
  'Lets the very first farm_users row for a brand-new farm be created (bootstrap case).';
