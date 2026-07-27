-- =====================================================================
-- MIGRATION 004 — IN-APP NOTIFICATION ENGINE (replaces SMS/Twilio path)
-- Run this AFTER 002_breeding_reminders.sql and 003_customer_ledger.sql
-- on any farm that already deployed those. Fresh installs get this
-- automatically because it's folded into supabase/schema.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Replace the old notifications table.
--    The old table was a stub for an SMS/push delivery log (channel,
--    delivery_status, sent_at) that nothing ever wrote to — no code in
--    the app called it, and no Twilio dispatch code existed anywhere.
--    This is a clean redesign for the real in-app engine.
-- ---------------------------------------------------------------------

drop table if exists notifications cascade;

create type notification_type as enum ('alert', 'reminder', 'warning');

create table notifications (
  id uuid primary key default uuid_generate_v4(),
  farm_id uuid references farms(id) on delete cascade not null,
  user_id uuid references users(id) on delete cascade, -- null = broadcast to every active member of the farm
  title text not null,
  message text not null,
  type notification_type not null default 'reminder',
  category text not null, -- 'breeding' | 'health' | 'inventory' | 'finance' | 'general' — powers the filter UI
  related_table text,      -- e.g. 'animals', 'breeding_records' — lets the UI deep-link
  related_id uuid,
  read_status boolean not null default false,
  read_at timestamptz,
  -- Placeholder for future delivery channels (Section D: "must support future
  -- addition of SMS/email, but do not implement them now"). Only 'in_app' is
  -- ever written by this version of the system.
  channel text not null default 'in_app' check (channel in ('in_app', 'sms', 'email')),
  created_at timestamptz default now()
);

-- One active (unread) notification per distinct condition, so re-running
-- the generator doesn't spam duplicates every time it's called.
create unique index notifications_dedup_key
  on notifications (farm_id, category, coalesce(related_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where read_status = false;

create index idx_notifications_farm_created on notifications (farm_id, created_at desc);
create index idx_notifications_user on notifications (farm_id, user_id, read_status);

alter table notifications enable row level security;

-- Visible to any active farm member, but only their own personal
-- notifications OR broadcast ones (user_id is null) — tighter than the
-- generic farm_isolation policy used for other tables.
create policy notifications_select on notifications for select using (
  is_farm_member(farm_id) and (user_id is null or user_id = auth.uid())
);
create policy notifications_update on notifications for update using (
  is_farm_member(farm_id) and (user_id is null or user_id = auth.uid())
);
create policy notifications_insert on notifications for insert with check (
  is_farm_member(farm_id)
);

-- ---------------------------------------------------------------------
-- 2. Trigger-generation function.
--    Called opportunistically from the client (on dashboard load, and
--    periodically while online — see lib/notifications.js) rather than
--    on a server-side cron, so it needs no external scheduler and keeps
--    working the moment connectivity returns, satisfying the "no
--    external APIs, works in low-connectivity environments" constraint.
-- ---------------------------------------------------------------------

create or replace function generate_notifications(p_farm_id uuid)
returns void as $$
begin
  if not is_farm_member(p_farm_id) then
    raise exception 'not a member of this farm';
  end if;

  -- BREEDING: reuse the upcoming_breeding_events view (migration 002)
  insert into notifications (farm_id, title, message, type, category, related_table, related_id)
  select
    p_farm_id,
    case event_type
      when 'calving_due' then
        case when expected_calving_date < current_date then 'Calving overdue' else 'Calving due soon' end
      when 'pregnancy_check_due' then 'Pregnancy check needed'
      else 'Heat window expected'
    end,
    case event_type
      when 'calving_due' then
        case when expected_calving_date < current_date
          then format('%s was due to calve on %s — check on her', tag_id, expected_calving_date)
          else format('%s is expected to calve on %s', tag_id, expected_calving_date)
        end
      when 'pregnancy_check_due' then format('%s was serviced on %s — confirm pregnancy status', tag_id, service_date)
      else format('%s may be back in heat soon (last heat noted %s)', tag_id, heat_date)
    end,
    (case
      when event_type = 'calving_due' and expected_calving_date < current_date then 'alert'
      when event_type = 'calving_due' then 'reminder'
      when event_type = 'pregnancy_check_due' then 'warning'
      else 'reminder'
    end)::notification_type,
    'breeding',
    'breeding_records',
    breeding_record_id
  from upcoming_breeding_events
  where farm_id = p_farm_id
  on conflict (farm_id, category, coalesce(related_id, '00000000-0000-0000-0000-000000000000'::uuid)) where read_status = false
  do update set title = excluded.title, message = excluded.message, type = excluded.type
  where notifications.title is distinct from excluded.title
     or notifications.message is distinct from excluded.message;

  -- HEALTH: vaccinations / treatments with a next_due_date that has arrived or passed
  insert into notifications (farm_id, title, message, type, category, related_table, related_id)
  select
    p_farm_id,
    case when hr.next_due_date < current_date then 'Vaccination overdue' else 'Vaccination due soon' end,
    format('%s: %s due on %s', a.tag_id, coalesce(dc.name, hr.diagnosis_note, 'follow-up'), hr.next_due_date),
    case when hr.next_due_date < current_date then 'alert'::notification_type else 'reminder'::notification_type end,
    'health',
    'health_records',
    hr.id
  from health_records hr
  join animals a on a.id = hr.animal_id
  left join diagnosis_catalogue dc on dc.id = hr.diagnosis_id
  where hr.farm_id = p_farm_id
    and hr.next_due_date is not null
    and hr.next_due_date <= current_date + interval '7 days'
  on conflict (farm_id, category, coalesce(related_id, '00000000-0000-0000-0000-000000000000'::uuid)) where read_status = false
  do update set title = excluded.title, message = excluded.message, type = excluded.type
  where notifications.title is distinct from excluded.title
     or notifications.message is distinct from excluded.message;

  -- INVENTORY: feed stock at or below its reorder level
  insert into notifications (farm_id, title, message, type, category, related_table, related_id)
  select
    p_farm_id,
    'Feed stock low',
    format('%s: %s %s left (reorder at %s)', ft.name, fi.quantity, ft.unit, fi.reorder_level),
    'warning',
    'inventory',
    'feed_types',
    ft.id
  from feed_inventory fi
  join feed_types ft on ft.id = fi.feed_type_id
  where fi.farm_id = p_farm_id
    and fi.quantity <= fi.reorder_level
  on conflict (farm_id, category, coalesce(related_id, '00000000-0000-0000-0000-000000000000'::uuid)) where read_status = false
  do update set title = excluded.title, message = excluded.message, type = excluded.type
  where notifications.title is distinct from excluded.title
     or notifications.message is distinct from excluded.message;

  -- FINANCE: (a) invoices overdue, (b) a simple cost-spike anomaly check
  insert into notifications (farm_id, title, message, type, category, related_table, related_id)
  select
    p_farm_id,
    'Invoice overdue',
    format('%s owes %s, due %s', c.name, i.amount - coalesce(i.paid_amount, 0), i.due_date),
    'alert',
    'finance',
    'invoices',
    i.id
  from invoices i
  join customers c on c.id = i.customer_id
  where i.farm_id = p_farm_id
    and i.status <> 'paid'
    and i.due_date < current_date
  on conflict (farm_id, category, coalesce(related_id, '00000000-0000-0000-0000-000000000000'::uuid)) where read_status = false
  do update set title = excluded.title, message = excluded.message, type = excluded.type
  where notifications.title is distinct from excluded.title
     or notifications.message is distinct from excluded.message;

  -- Simple anomaly heuristic (kept deliberately lightweight — "advanced
  -- analytics" is explicitly out of scope for this phase): flag if
  -- today's total cost is more than double the trailing 30-day daily average.
  insert into notifications (farm_id, title, message, type, category, related_table, related_id)
  select
    p_farm_id,
    'Unusual spending today',
    format('Today''s recorded costs (%s) are more than double your recent daily average (%s)', round(today_total), round(avg_daily)),
    'warning',
    'finance',
    null,
    null
  from (
    select
      (select coalesce(sum(amount), 0) from costs where farm_id = p_farm_id and date = current_date) as today_total,
      (select coalesce(avg(daily_sum), 0) from (
          select sum(amount) as daily_sum
          from costs
          where farm_id = p_farm_id and date >= current_date - interval '30 days' and date < current_date
          group by date
        ) d) as avg_daily
  ) calc
  where today_total > 0 and avg_daily > 0 and today_total > avg_daily * 2
  on conflict (farm_id, category, coalesce(related_id, '00000000-0000-0000-0000-000000000000'::uuid)) where read_status = false
  do update set title = excluded.title, message = excluded.message, type = excluded.type
  where notifications.title is distinct from excluded.title
     or notifications.message is distinct from excluded.message;

end;
$$ language plpgsql security definer;

comment on function generate_notifications is
  'Scans breeding/health/inventory/finance conditions for the given farm and upserts in-app notification rows. Call via supabase.rpc("generate_notifications", { p_farm_id }) whenever the app is online -- see lib/notifications.js.';
