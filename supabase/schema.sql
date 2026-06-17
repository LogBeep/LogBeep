-- F.A.S.T Padaria Inteligente — schema inicial Supabase
-- Execute este arquivo no SQL Editor do Supabase.
-- Observação: para produção, habilite autenticação, RLS por usuário/empresa e políticas restritivas.

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists products (
  id text primary key,
  name text not null,
  category text,
  type text,
  qty numeric not null default 0,
  min_qty numeric not null default 0,
  unit text,
  price numeric not null default 0,
  lot_code text,
  expires_at date,
  supplier_name text,
  location text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists suppliers (
  id text primary key,
  name text not null,
  category text,
  lead_time_text text,
  reliability numeric,
  last_purchase_text text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recipes (
  id text primary key,
  name text not null,
  yield_qty numeric,
  yield_unit text,
  loss_avg numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recipe_ingredients (
  id text primary key,
  recipe_id text references recipes(id) on delete cascade,
  product_id text references products(id) on delete restrict,
  qty numeric not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(recipe_id, product_id)
);

create table if not exists lots (
  id text primary key,
  product_id text references products(id) on delete set null,
  lot_code text not null,
  qty numeric not null default 0,
  unit text,
  expires_at date,
  supplier_name text,
  location text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists production_orders (
  id text primary key,
  title text not null,
  status text,
  status_label text,
  responsible text,
  eta text,
  lot_code text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists losses (
  id text primary key,
  reason text,
  item text,
  sku text,
  qty numeric not null default 0,
  cost numeric not null default 0,
  lot_code text,
  occurred_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stock_movements (
  id text primary key,
  type text not null,
  item text,
  sku text,
  qty numeric not null default 0,
  lot_code text,
  reference_code text,
  note text,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists inventory_positions (
  id text primary key,
  label text not null,
  zone text,
  product_id text references products(id) on delete set null,
  lot_code text,
  capacity numeric,
  used numeric,
  expires_at date,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists products_updated_at on products;
drop trigger if exists suppliers_updated_at on suppliers;
drop trigger if exists recipes_updated_at on recipes;
drop trigger if exists lots_updated_at on lots;
drop trigger if exists production_orders_updated_at on production_orders;
drop trigger if exists losses_updated_at on losses;
drop trigger if exists inventory_positions_updated_at on inventory_positions;

create trigger products_updated_at before update on products for each row execute function set_updated_at();
create trigger suppliers_updated_at before update on suppliers for each row execute function set_updated_at();
create trigger recipes_updated_at before update on recipes for each row execute function set_updated_at();
create trigger lots_updated_at before update on lots for each row execute function set_updated_at();
create trigger production_orders_updated_at before update on production_orders for each row execute function set_updated_at();
create trigger losses_updated_at before update on losses for each row execute function set_updated_at();
create trigger inventory_positions_updated_at before update on inventory_positions for each row execute function set_updated_at();
