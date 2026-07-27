-- =====================================================================
-- LIVESTOCK ERP — SUPABASE SCHEMA (Phase 1 MVP + Phase 2 tables ready)
-- Multi-tenant via farm_id + Row Level Security
-- Run this ONCE in Supabase SQL Editor (Project > SQL Editor > New query)
-- =====================================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------
-- CORE TENANCY
-- ---------------------------------------------------------------------

create table farms (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  location text,
  currency text default 'KES',
  timezone text default 'Africa/Nairobi',
  settings jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- users mirrors auth.users (Supabase auth) 1:1, plus app-specific fields
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text unique not null,
  name text,
  pin_hash text,                 -- for offline PIN unlock after one-time OTP verification
  preferred_language text default 'en', -- 'en' or 'sw'
  created_at timestamptz default now()
);

create type user_role as enum ('admin','manager','vet','worker','accountant');
create type membership_status as enum ('invited','active','revoked');

create table farm_users (
  id uuid primary key default uuid_generate_v4(),
  farm_id uuid references farms(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  role user_role not null default 'worker',
  status membership_status not null default 'invited',
  invited_by uuid references users(id),
  created_at timestamptz default now(),
  unique(farm_id, user_id)
);

-- ---------------------------------------------------------------------
-- ANIMAL LIFECYCLE
-- ---------------------------------------------------------------------

create type animal_status as enum ('calf','heifer','lactating','dry','sold','dead');
create type acquisition_type as enum ('birth','purchase','transfer_in');

create table animals (
  id uuid primary key default uuid_generate_v4(),
  farm_id uuid references farms(id) on delete cascade,
  tag_id text not null,
  name text,
  breed text,
  sex text check (sex in ('male','female')),
  date_of_birth date,
  sire_id uuid references animals(id),
  dam_id uuid references animals(id),
  status animal_status not null default 'calf',
  current_location text,
  photo_url text,
  acquisition_type acquisition_type not null default 'birth',
  client_uuid uuid, -- for offline dedupe (set by device on creation)
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(farm_id, tag_id)
);

create table animal_groups (
  id uuid primary key default uuid_generate_v4(),
  farm_id uuid references farms(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz default now()
);

create table animal_group_members (
  group_id uuid references animal_groups(id) on delete cascade,
  animal_id uuid references animals(id) on delete cascade,
  added_date date default current_date,
  removed_date date,
  primary key (group_id, animal_id)
);

create table lifecycle_events (
  id uuid primary key default uuid_generate_v4(),
  animal_id uuid references animals(id) on delete cascade,
  event_type text not null, -- birth, weaning, first_heat, status_change, sold, dead, etc
  event_date date not null default current_date,
  notes text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- BREEDING
-- ---------------------------------------------------------------------

create table breeding_records (
  id uuid primary key default uuid_generate_v4(),
  farm_id uuid references farms(id) on delete cascade,
  animal_id uuid references animals(id) on delete cascade,
  heat_date date,
  service_date date,
  bull_or_semen_id text,
  technician_id uuid references users(id),
  pregnancy_confirmed boolean,
  expected_calving_date date,
  actual_calving_date date,
  calf_id uuid references animals(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- HEALTH & VET
-- ---------------------------------------------------------------------

create table diagnosis_catalogue (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  name_sw text, -- Swahili label
  category text, -- disease / vaccination / injury / reproductive / other
  icon_url text
);

create table health_records (
  id uuid primary key default uuid_generate_v4(),
  farm_id uuid references farms(id) on delete cascade,
  animal_id uuid references animals(id) on delete cascade,
  event_date date not null default current_date,
  type text check (type in ('vaccination','disease','treatment','checkup')),
  diagnosis_id uuid references diagnosis_catalogue(id),
  diagnosis_note text,
  medicine_id uuid,
  vet_id uuid references users(id),
  cost numeric(12,2) default 0,
  next_due_date date,
  client_uuid uuid,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- FEED & INVENTORY
-- ---------------------------------------------------------------------

create table feed_types (
  id uuid primary key default uuid_generate_v4(),
  farm_id uuid references farms(id) on delete cascade,
  name text not null,
  unit text default 'kg',
  cost_per_unit numeric(12,2) default 0,
  nutritional_info jsonb default '{}'::jsonb
);

create table feed_inventory (
  farm_id uuid references farms(id) on delete cascade,
  feed_type_id uuid references feed_types(id) on delete cascade,
  quantity numeric(12,2) default 0,
  reorder_level numeric(12,2) default 0,
  last_updated timestamptz default now(),
  primary key (farm_id, feed_type_id)
);

create table feeding_logs (
  id uuid primary key default uuid_generate_v4(),
  farm_id uuid references farms(id) on delete cascade,
  animal_id uuid references animals(id),
  group_id uuid references animal_groups(id),
  feed_type_id uuid references feed_types(id),
  quantity numeric(12,2) not null,
  date date not null default current_date,
  cost numeric(12,2) default 0,
  client_uuid uuid,
  created_at timestamptz default now(),
  check (animal_id is not null or group_id is not null)
);

create table inventory_items (
  id uuid primary key default uuid_generate_v4(),
  farm_id uuid references farms(id) on delete cascade,
  name text not null,
  type text check (type in ('medicine','equipment','tool')),
  quantity numeric(12,2) default 0,
  reorder_level numeric(12,2) default 0,
  unit_cost numeric(12,2) default 0
);

create table inventory_transactions (
  id uuid primary key default uuid_generate_v4(),
  item_id uuid references inventory_items(id) on delete cascade,
  quantity_change numeric(12,2) not null,
  reason text,
  related_record_id uuid,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- MILK PRODUCTION
-- ---------------------------------------------------------------------

create table milk_records (
  id uuid primary key default uuid_generate_v4(),
  farm_id uuid references farms(id) on delete cascade,
  animal_id uuid references animals(id),
  group_id uuid references animal_groups(id),
  session_date date not null default current_date,
  shift text check (shift in ('morning','evening')),
  yield_litres numeric(8,2) not null,
  fat_pct numeric(5,2),
  snf_pct numeric(5,2),
  temperature numeric(5,2),
  milker_id uuid references users(id),
  wastage_litres numeric(8,2) default 0,
  client_uuid uuid,
  created_at timestamptz default now(),
  check (animal_id is not null or group_id is not null)
);

-- ---------------------------------------------------------------------
-- FINANCE
-- ---------------------------------------------------------------------

create table customers (
  id uuid primary key default uuid_generate_v4(),
  farm_id uuid references farms(id) on delete cascade,
  name text not null,
  phone text,
  type text check (type in ('processor','retailer','individual'))
);

create table costs (
  id uuid primary key default uuid_generate_v4(),
  farm_id uuid references farms(id) on delete cascade,
  category text check (category in ('feed','vet','labour','other')),
  amount numeric(12,2) not null,
  date date not null default current_date,
  animal_id uuid references animals(id),
  description text,
  client_uuid uuid,
  created_at timestamptz default now()
);

create table revenues (
  id uuid primary key default uuid_generate_v4(),
  farm_id uuid references farms(id) on delete cascade,
  type text check (type in ('milk_sale','animal_sale')),
  amount numeric(12,2) not null,
  date date not null default current_date,
  customer_id uuid references customers(id),
  quantity numeric(12,2),
  unit_price numeric(12,2),
  client_uuid uuid,
  created_at timestamptz default now()
);

create table invoices (
  id uuid primary key default uuid_generate_v4(),
  farm_id uuid references farms(id) on delete cascade,
  customer_id uuid references customers(id),
  amount numeric(12,2) not null,
  due_date date,
  status text check (status in ('pending','partial','paid','overdue')) default 'pending',
  paid_amount numeric(12,2) default 0,
  created_at timestamptz default now()
);

create table assets (
  id uuid primary key default uuid_generate_v4(),
  farm_id uuid references farms(id) on delete cascade,
  asset_type text check (asset_type in ('animal','equipment')),
  reference_id uuid,
  acquisition_value numeric(12,2),
  acquisition_date date,
  current_value numeric(12,2),
  depreciation_method text
);

-- ---------------------------------------------------------------------
-- AUDIT
-- ---------------------------------------------------------------------

create table audit_logs (
  id uuid primary key default uuid_generate_v4(),
  farm_id uuid references farms(id) on delete cascade,
  user_id uuid references users(id),
  action text,
  table_name text,
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz default now()
);

-- =====================================================================
-- ROW LEVEL SECURITY
-- Every farm-scoped table is only visible to active members of that farm.
-- =====================================================================

create or replace function is_farm_member(target_farm_id uuid)
returns boolean as $$
  select exists (
    select 1 from farm_users
    where farm_id = target_farm_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$ language sql security definer stable;

do $$
declare
  t text;
  farm_tables text[] := array[
    'animals','animal_groups','breeding_records',
    'health_records','feed_types','feed_inventory','feeding_logs',
    'inventory_items','milk_records','customers','costs','revenues',
    'invoices','assets','audit_logs'
  ];
begin
  foreach t in array farm_tables loop
    execute format('alter table %I enable row level security;', t);
    execute format(
      'create policy farm_isolation_%1$I on %1$I for all using (is_farm_member(farm_id)) with check (is_farm_member(farm_id));',
      t
    );
  end loop;
end $$;

-- lifecycle_events has no farm_id column of its own (it's keyed off animal_id),
-- so it needs its own policy scoped through the parent animal's farm.
alter table lifecycle_events enable row level security;
create policy lifecycle_events_isolation on lifecycle_events for all using (
  exists (select 1 from animals a where a.id = lifecycle_events.animal_id and is_farm_member(a.farm_id))
) with check (
  exists (select 1 from animals a where a.id = lifecycle_events.animal_id and is_farm_member(a.farm_id))
);

-- farms: visible if you are any member (any status) of that farm
alter table farms enable row level security;
create policy farm_visible_to_members on farms for select using (
  exists (select 1 from farm_users where farm_id = farms.id and user_id = auth.uid())
);
create policy farm_update_by_admin on farms for update using (
  exists (select 1 from farm_users where farm_id = farms.id and user_id = auth.uid() and role = 'admin' and status = 'active')
);

-- farm_users: visible to members of the same farm
alter table farm_users enable row level security;
create policy farm_users_visible on farm_users for select using (
  exists (select 1 from farm_users fu where fu.farm_id = farm_users.farm_id and fu.user_id = auth.uid())
);
create policy farm_users_managed_by_admin on farm_users for insert with check (
  exists (select 1 from farm_users fu where fu.farm_id = farm_users.farm_id and fu.user_id = auth.uid() and fu.role in ('admin','manager') and fu.status = 'active')
);
create policy farm_users_updated_by_admin on farm_users for update using (
  exists (select 1 from farm_users fu where fu.farm_id = farm_users.farm_id and fu.user_id = auth.uid() and fu.role in ('admin','manager') and fu.status = 'active')
);

-- users: a user can see their own row, plus co-members of any shared farm
alter table users enable row level security;
create policy users_self on users for select using (id = auth.uid());
create policy users_self_update on users for update using (id = auth.uid());

-- indexes (per Section D.1 — high volume tables)
create index idx_milk_farm_animal_date on milk_records(farm_id, animal_id, session_date);
create index idx_health_farm_animal_date on health_records(farm_id, animal_id, event_date);
create index idx_animals_farm_status on animals(farm_id, status);
create index idx_costs_farm_date on costs(farm_id, date);
create index idx_revenues_farm_date on revenues(farm_id, date);

-- seed a starter diagnosis catalogue (common cattle conditions — East Africa)
insert into diagnosis_catalogue (name, name_sw, category) values
  ('Mastitis', 'Ugonjwa wa kiwele', 'disease'),
  ('Foot and Mouth Disease', 'Ugonjwa wa Miguu na Mdomo', 'disease'),
  ('East Coast Fever', 'Homa ya Pwani', 'disease'),
  ('Bloat', 'Uvimbe wa tumbo', 'disease'),
  ('Retained Placenta', 'Kondo lililobaki', 'reproductive'),
  ('Lameness', 'Ulemavu wa miguu', 'injury'),
  ('Diarrhea', 'Kuharisha', 'disease'),
  ('Tick-borne disease (general)', 'Ugonjwa wa kupe', 'disease'),
  ('FMD Vaccination', 'Chanjo ya FMD', 'vaccination'),
  ('Anthrax Vaccination', 'Chanjo ya Kimeta', 'vaccination'),
  ('Deworming', 'Dawa ya minyoo', 'treatment'),
  ('Wound / Injury', 'Jeraha', 'injury'),
  ('Difficult calving (Dystocia)', 'Ugumu wa kuzaa', 'reproductive'),
  ('Reduced appetite', 'Kupungua hamu ya kula', 'disease'),
  ('Other (describe below)', 'Nyingine (eleza chini)', 'other')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- BREEDING & CALVING REMINDERS (Phase 2, Module A) — in-app only for now
-- ---------------------------------------------------------------------

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

create index if not exists idx_breeding_animal_open
  on breeding_records(animal_id, created_at desc)
  where actual_calving_date is null;

-- ---------------------------------------------------------------------
-- IN-APP NOTIFICATION ENGINE (Phase 2, Module D)
-- No SMS/Twilio/external API involved — notifications are generated by a
-- Postgres function called opportunistically by the client whenever it's
-- online (see lib/notifications.js), and read entirely from the local
-- offline cache the rest of the time.
-- ---------------------------------------------------------------------

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
  -- Placeholder for future delivery channels (not implemented yet — only
  -- 'in_app' is ever written by this version of the system).
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

create or replace function generate_notifications(p_farm_id uuid)
returns void as $$
begin
  if not is_farm_member(p_farm_id) then
    raise exception 'not a member of this farm';
  end if;

  -- BREEDING: reuse the upcoming_breeding_events view above
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

-- ---------------------------------------------------------------------
-- CUSTOMER / DEBTOR LEDGER (Phase 2, Module C)
-- ---------------------------------------------------------------------

create table milk_deliveries (
  id uuid primary key default uuid_generate_v4(),
  farm_id uuid references farms(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  date date not null default current_date,
  quantity_litres numeric(10,2) not null,
  unit_price numeric(12,2) not null,
  amount numeric(12,2) generated always as (quantity_litres * unit_price) stored,
  notes text,
  revenue_id uuid references revenues(id),
  created_at timestamptz default now()
);

create table customer_payments (
  id uuid primary key default uuid_generate_v4(),
  farm_id uuid references farms(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  date date not null default current_date,
  amount numeric(12,2) not null,
  method text check (method in ('cash','mpesa','bank','other')) default 'cash',
  notes text,
  created_at timestamptz default now()
);

create or replace function post_delivery_to_revenue()
returns trigger as $$
declare
  new_revenue_id uuid;
begin
  insert into revenues (farm_id, type, amount, date, customer_id, quantity, unit_price)
  values (new.farm_id, 'milk_sale', new.amount, new.date, new.customer_id, new.quantity_litres, new.unit_price)
  returning id into new_revenue_id;

  update milk_deliveries set revenue_id = new_revenue_id where id = new.id;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_post_delivery_to_revenue
after insert on milk_deliveries
for each row execute function post_delivery_to_revenue();

create or replace view customer_balances
with (security_invoker = true) as
select
  c.id as customer_id,
  c.farm_id,
  c.name,
  c.phone,
  c.type,
  coalesce(d.total_delivered, 0) as total_delivered,
  coalesce(p.total_paid, 0) as total_paid,
  coalesce(d.total_delivered, 0) - coalesce(p.total_paid, 0) as balance
from customers c
left join (
  select customer_id, sum(amount) as total_delivered from milk_deliveries group by customer_id
) d on d.customer_id = c.id
left join (
  select customer_id, sum(amount) as total_paid from customer_payments group by customer_id
) p on p.customer_id = c.id;

grant select on customer_balances to authenticated;

alter table milk_deliveries enable row level security;
create policy farm_isolation_milk_deliveries on milk_deliveries for all
  using (is_farm_member(farm_id)) with check (is_farm_member(farm_id));

alter table customer_payments enable row level security;
create policy farm_isolation_customer_payments on customer_payments for all
  using (is_farm_member(farm_id)) with check (is_farm_member(farm_id));

create index idx_deliveries_farm_customer_date on milk_deliveries(farm_id, customer_id, date);
create index idx_payments_farm_customer_date on customer_payments(farm_id, customer_id, date);

-- End of schema
