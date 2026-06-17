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


create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'operador',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists company_members (
  company_id uuid references companies(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text not null default 'operador',
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create table if not exists products (
  id text primary key,
  company_id uuid references companies(id) on delete set null,
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
  company_id uuid references companies(id) on delete set null,
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
  company_id uuid references companies(id) on delete set null,
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
  company_id uuid references companies(id) on delete set null,
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
  company_id uuid references companies(id) on delete set null,
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
  company_id uuid references companies(id) on delete set null,
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
  company_id uuid references companies(id) on delete set null,
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
  company_id uuid references companies(id) on delete set null,
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

drop trigger if exists companies_updated_at on companies;
drop trigger if exists profiles_updated_at on profiles;
drop trigger if exists products_updated_at on products;
drop trigger if exists suppliers_updated_at on suppliers;
drop trigger if exists recipes_updated_at on recipes;
drop trigger if exists lots_updated_at on lots;
drop trigger if exists production_orders_updated_at on production_orders;
drop trigger if exists losses_updated_at on losses;
drop trigger if exists inventory_positions_updated_at on inventory_positions;

create trigger companies_updated_at before update on companies for each row execute function set_updated_at();
create trigger profiles_updated_at before update on profiles for each row execute function set_updated_at();
create trigger products_updated_at before update on products for each row execute function set_updated_at();
create trigger suppliers_updated_at before update on suppliers for each row execute function set_updated_at();
create trigger recipes_updated_at before update on recipes for each row execute function set_updated_at();
create trigger lots_updated_at before update on lots for each row execute function set_updated_at();
create trigger production_orders_updated_at before update on production_orders for each row execute function set_updated_at();
create trigger losses_updated_at before update on losses for each row execute function set_updated_at();
create trigger inventory_positions_updated_at before update on inventory_positions for each row execute function set_updated_at();


-- Base de autenticação/RLS para a próxima etapa.
-- Em produção, habilite RLS nas tabelas operacionais e filtre por company_id.
alter table companies enable row level security;
alter table profiles enable row level security;
alter table company_members enable row level security;

drop policy if exists companies_select_member on companies;
create policy companies_select_member on companies
  for select using (exists (select 1 from company_members m where m.company_id = companies.id and m.user_id = auth.uid()));

drop policy if exists profiles_select_self on profiles;
create policy profiles_select_self on profiles
  for select using (id = auth.uid());

drop policy if exists company_members_select_self on company_members;
create policy company_members_select_self on company_members
  for select using (user_id = auth.uid());
