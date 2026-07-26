-- =====================================================================
-- MIGRATION 002 — Breeding & Calving reminders (Phase 2, Module A)
-- Run this in Supabase SQL Editor AFTER schema.sql.
-- Adds a read-only view the app polls for in-app reminders.
-- No SMS/push here yet — Phase 2 is in-app only, per current scope.
-- =====================================================================

-- Reminder logic (tune the day thresholds later as you learn your herd):
--   next_heat_expected     -> a logged heat with no service ~18+ days later
--                              (average bovine cycle is ~21 days, so this
--                              flags "watch for the next heat window")
--   pregnancy_check_due    -> serviced 45+ days ago, not yet confirmed pregnant
--   calving_due            -> expected calving date within the next 14 days
create or replace view upcoming_breeding_events
with (security_invoker = true) as
select * from (
  select
    br.id as breeding_record_id,
    br.farm_id,
    br.animal_id,
    a.tag_id,
    a.name as animal_name,
    case
      when br.expected_calving_date is not null
           and br.actual_calving_date is null
           and br.expected_calving_date <= current_date + interval '14 days'
        then 'calving_due'
      when br.service_date is not null
           and br.pregnancy_confirmed is null
           and br.service_date <= current_date - interval '45 days'
        then 'pregnancy_check_due'
      when br.heat_date is not null
           and br.service_date is null
           and br.heat_date <= current_date - interval '18 days'
        then 'next_heat_expected'
      else null
    end as event_type,
    br.heat_date,
    br.service_date,
    br.pregnancy_confirmed,
    br.expected_calving_date
  from breeding_records br
  join animals a on a.id = br.animal_id
  where a.status not in ('sold', 'dead')
) events
where event_type is not null;

grant select on upcoming_breeding_events to authenticated;

-- Helpful index for finding "the open breeding record" for an animal
-- (the app looks this up every time a worker logs a service or pregnancy check).
create index if not exists idx_breeding_animal_open
  on breeding_records(animal_id, created_at desc)
  where actual_calving_date is null;
