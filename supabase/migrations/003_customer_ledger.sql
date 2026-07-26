-- =====================================================================
-- MIGRATION 003 — Customer / Debtor Ledger (Phase 2, Module C)
-- Run this in Supabase SQL Editor AFTER schema.sql (and 002, if run separately).
-- =====================================================================

create table if not exists milk_deliveries (
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

create table if not exists customer_payments (
  id uuid primary key default uuid_generate_v4(),
  farm_id uuid references farms(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  date date not null default current_date,
  amount numeric(12,2) not null,
  method text check (method in ('cash','mpesa','bank','other')) default 'cash',
  notes text,
  created_at timestamptz default now()
);

-- Every delivery automatically posts to the farm-wide revenues table, so the
-- finance dashboard and per-animal profitability numbers (Module B) stay
-- consistent with the debtor ledger, without double-entry in the app code.
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

drop trigger if exists trg_post_delivery_to_revenue on milk_deliveries;
create trigger trg_post_delivery_to_revenue
after insert on milk_deliveries
for each row execute function post_delivery_to_revenue();

-- Outstanding balance per customer = total delivered - total paid.
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
drop policy if exists farm_isolation_milk_deliveries on milk_deliveries;
create policy farm_isolation_milk_deliveries on milk_deliveries for all
  using (is_farm_member(farm_id)) with check (is_farm_member(farm_id));

alter table customer_payments enable row level security;
drop policy if exists farm_isolation_customer_payments on customer_payments;
create policy farm_isolation_customer_payments on customer_payments for all
  using (is_farm_member(farm_id)) with check (is_farm_member(farm_id));

alter table customers enable row level security;
drop policy if exists farm_isolation_customers on customers;
create policy farm_isolation_customers on customers for all
  using (is_farm_member(farm_id)) with check (is_farm_member(farm_id));

create index if not exists idx_deliveries_farm_customer_date on milk_deliveries(farm_id, customer_id, date);
create index if not exists idx_payments_farm_customer_date on customer_payments(farm_id, customer_id, date);
