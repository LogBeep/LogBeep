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
  role text not null default 'operador' check (role in ('dono','admin','gerente','operador','auditor')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create table if not exists products (
  id text primary key,
  company_id uuid references companies(id) on delete set null,
  name text not null,
  category text,
  type text,
  qty numeric not null default 0 check (qty >= 0),
  min_qty numeric not null default 0 check (min_qty >= 0),
  unit text,
  price numeric not null default 0 check (price >= 0),
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
  reliability numeric check (reliability between 0 and 100),
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
  qty numeric not null default 0 check (qty >= 0),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(recipe_id, product_id)
);

create table if not exists lots (
  id text primary key,
  company_id uuid references companies(id) on delete set null,
  product_id text references products(id) on delete set null,
  lot_code text not null,
  qty numeric not null default 0 check (qty >= 0),
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
  qty numeric not null default 0 check (qty >= 0),
  cost numeric not null default 0 check (cost >= 0),
  lot_code text,
  occurred_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stock_movements (
  id text primary key,
  product_id text references products(id) on delete restrict,
  company_id uuid references companies(id) on delete set null,
  user_id uuid references profiles(id) on delete set null,
  action_type text not null,
  type text not null,
  item text,
  sku text,
  qty numeric not null default 0,
  quantity_before numeric not null default 0,
  quantity_changed numeric not null default 0,
  quantity_after numeric not null default 0,
  reason text,
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
  capacity numeric check (capacity is null or capacity >= 0),
  used numeric check (used is null or used >= 0),
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


-- Protege integridade: movimentações são append-only e qty deve ser alterado por fluxo auditável.
create or replace function prevent_stock_movement_mutation()
returns trigger as $$
begin
  raise exception 'stock_movements is append-only; create a reversing movement instead';
end;
$$ language plpgsql;

drop trigger if exists stock_movements_no_update on stock_movements;
drop trigger if exists stock_movements_no_delete on stock_movements;
create trigger stock_movements_no_update before update on stock_movements for each row execute function prevent_stock_movement_mutation();
create trigger stock_movements_no_delete before delete on stock_movements for each row execute function prevent_stock_movement_mutation();

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

-- RLS operacional por empresa. Requer que cada registro tenha company_id e que o usuário
-- esteja vinculado em company_members. Para recipe_ingredients, a empresa vem da receita.
alter table products enable row level security;
alter table suppliers enable row level security;
alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;
alter table lots enable row level security;
alter table production_orders enable row level security;
alter table losses enable row level security;
alter table stock_movements enable row level security;
alter table inventory_positions enable row level security;

drop policy if exists products_company_access on products;
create policy products_company_access on products for all
  using (exists (select 1 from company_members m where m.company_id = products.company_id and m.user_id = auth.uid()))
  with check (exists (select 1 from company_members m where m.company_id = products.company_id and m.user_id = auth.uid()));

drop policy if exists suppliers_company_access on suppliers;
create policy suppliers_company_access on suppliers for all
  using (exists (select 1 from company_members m where m.company_id = suppliers.company_id and m.user_id = auth.uid()))
  with check (exists (select 1 from company_members m where m.company_id = suppliers.company_id and m.user_id = auth.uid()));

drop policy if exists recipes_company_access on recipes;
create policy recipes_company_access on recipes for all
  using (exists (select 1 from company_members m where m.company_id = recipes.company_id and m.user_id = auth.uid()))
  with check (exists (select 1 from company_members m where m.company_id = recipes.company_id and m.user_id = auth.uid()));

drop policy if exists recipe_ingredients_company_access on recipe_ingredients;
create policy recipe_ingredients_company_access on recipe_ingredients for all
  using (exists (select 1 from recipes r join company_members m on m.company_id = r.company_id where r.id = recipe_ingredients.recipe_id and m.user_id = auth.uid()))
  with check (exists (select 1 from recipes r join company_members m on m.company_id = r.company_id where r.id = recipe_ingredients.recipe_id and m.user_id = auth.uid()));

drop policy if exists lots_company_access on lots;
create policy lots_company_access on lots for all
  using (exists (select 1 from company_members m where m.company_id = lots.company_id and m.user_id = auth.uid()))
  with check (exists (select 1 from company_members m where m.company_id = lots.company_id and m.user_id = auth.uid()));

drop policy if exists production_orders_company_access on production_orders;
create policy production_orders_company_access on production_orders for all
  using (exists (select 1 from company_members m where m.company_id = production_orders.company_id and m.user_id = auth.uid()))
  with check (exists (select 1 from company_members m where m.company_id = production_orders.company_id and m.user_id = auth.uid()));

drop policy if exists losses_company_access on losses;
create policy losses_company_access on losses for all
  using (exists (select 1 from company_members m where m.company_id = losses.company_id and m.user_id = auth.uid()))
  with check (exists (select 1 from company_members m where m.company_id = losses.company_id and m.user_id = auth.uid()));

drop policy if exists stock_movements_company_access on stock_movements;
drop policy if exists stock_movements_company_select on stock_movements;
drop policy if exists stock_movements_company_insert on stock_movements;
create policy stock_movements_company_select on stock_movements for select
  using (exists (select 1 from company_members m where m.company_id = stock_movements.company_id and m.user_id = auth.uid()));
drop policy if exists inventory_positions_company_access on inventory_positions;
create policy inventory_positions_company_access on inventory_positions for all
  using (exists (select 1 from company_members m where m.company_id = inventory_positions.company_id and m.user_id = auth.uid()))
  with check (exists (select 1 from company_members m where m.company_id = inventory_positions.company_id and m.user_id = auth.uid()));

-- Onboarding: permite que usuário autenticado crie a própria empresa/perfil/vínculo inicial.
drop policy if exists companies_insert_authenticated on companies;
create policy companies_insert_authenticated on companies for insert
  with check (auth.uid() is not null);

drop policy if exists profiles_insert_self on profiles;
create policy profiles_insert_self on profiles for insert
  with check (id = auth.uid());

drop policy if exists company_members_insert_self on company_members;
create policy company_members_insert_self on company_members for insert
  with check (user_id = auth.uid());

-- Bloqueia alteração direta de products.qty. Use apply_stock_movement para ajustes auditáveis.
create or replace function prevent_direct_product_qty_update()
returns trigger as $$
begin
  if old.qty is distinct from new.qty and coalesce(current_setting('app.stock_movement_context', true), '') <> 'allowed' then
    raise exception 'products.qty cannot be updated directly; use apply_stock_movement';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists products_no_direct_qty_update on products;
create trigger products_no_direct_qty_update before update on products
  for each row execute function prevent_direct_product_qty_update();

drop function if exists apply_stock_movement(text, text, numeric, text, text, text, boolean, text);

create or replace function apply_stock_movement(
  p_product_id text,
  p_action_type text,
  p_quantity_changed numeric,
  p_reason text,
  p_reference_code text default null,
  p_lot_code text default null,
  p_movement_id text default null
)
returns stock_movements as $$
declare
  v_product products%rowtype;
  v_before numeric;
  v_after numeric;
  v_company uuid;
  v_movement stock_movements%rowtype;
begin
  select * into v_product from products where id = p_product_id for update;
  if not found then
    raise exception 'product not found';
  end if;
  v_company := v_product.company_id;
  if not exists (select 1 from company_members m where m.company_id = v_company and m.user_id = auth.uid()) then
    raise exception 'access denied';
  end if;
  if not (p_action_type = any(array['entrada_lote','entrada_scan','saida_producao','entrada_producao','perda','ajuste'])) then
    raise exception 'unsupported stock movement action';
  end if;
  if p_action_type = 'ajuste' and not has_company_role(v_company, array['dono','admin','gerente']) then
    raise exception 'insufficient role for manual stock adjustment';
  end if;
  if p_action_type in ('entrada_lote','entrada_scan','saida_producao','entrada_producao','perda') and not has_company_role(v_company, array['dono','admin','gerente','operador']) then
    raise exception 'insufficient role for stock movement';
  end if;
  v_before := v_product.qty;
  v_after := v_before + p_quantity_changed;
  if v_after < 0 then
    raise exception 'insufficient stock';
  end if;
  perform set_config('app.stock_movement_context', 'allowed', true);
  update products set qty = v_after where id = p_product_id;
  insert into stock_movements (
    id, product_id, company_id, user_id, action_type, type, item, sku, qty,
    quantity_before, quantity_changed, quantity_after, reason, lot_code, reference_code, note, occurred_at, payload
  ) values (
    coalesce(p_movement_id, 'MOV-' || extract(epoch from now())::bigint || '-' || substr(gen_random_uuid()::text, 1, 8)),
    p_product_id, v_company, auth.uid(), p_action_type, p_action_type, v_product.name, p_product_id, p_quantity_changed,
    v_before, p_quantity_changed, v_after, p_reason, coalesce(p_lot_code, v_product.lot_code), p_reference_code, p_reason, now(), '{}'::jsonb
  ) returning * into v_movement;
  return v_movement;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function apply_stock_movement(text, text, numeric, text, text, text, text) to authenticated;

-- RBAC helpers e hardening incremental pós-auditoria.
create or replace function has_company_role(p_company_id uuid, p_allowed_roles text[])
returns boolean as $$
begin
  return exists (
    select 1 from company_members m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.role = any(p_allowed_roles)
  );
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function has_company_role(uuid, text[]) to authenticated;

create table if not exists security_events (
  id text primary key,
  company_id uuid references companies(id) on delete set null,
  user_id uuid references profiles(id) on delete set null,
  event_type text not null,
  resource_type text,
  resource_id text,
  result text not null default 'success',
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table security_events enable row level security;

drop policy if exists security_events_company_select on security_events;
drop policy if exists security_events_company_insert on security_events;
create policy security_events_company_select on security_events for select
  using (has_company_role(security_events.company_id, array['dono','admin','gerente']));
create policy security_events_company_insert on security_events for insert
  with check (exists (select 1 from company_members m where m.company_id = security_events.company_id and m.user_id = auth.uid()));

-- Evita que qualquer usuário se adicione manualmente a uma empresa existente.
drop policy if exists company_members_insert_self on company_members;
create policy company_members_insert_self on company_members for insert
  with check (
    user_id = auth.uid()
    and (
      (not exists (select 1 from company_members existing where existing.company_id = company_members.company_id) and role = 'dono')
      or (has_company_role(company_members.company_id, array['dono','admin']) and role in ('admin','gerente','operador','auditor'))
    )
  );

drop policy if exists company_members_update_admin on company_members;
drop policy if exists company_members_delete_admin on company_members;
create policy company_members_update_admin on company_members for update
  using (has_company_role(company_id, array['dono','admin']))
  with check (has_company_role(company_id, array['dono','admin']));
create policy company_members_delete_admin on company_members for delete
  using (has_company_role(company_id, array['dono','admin']));

-- A tabela de movimentações não deve aceitar INSERT direto do cliente; use apply_stock_movement.
drop policy if exists stock_movements_company_insert on stock_movements;

create or replace function log_security_event(
  p_company_id uuid,
  p_event_type text,
  p_resource_type text default null,
  p_resource_id text default null,
  p_result text default 'success',
  p_reason text default null,
  p_payload jsonb default '{}'::jsonb,
  p_event_id text default null
)
returns security_events as $$
declare
  v_event security_events%rowtype;
begin
  if not exists (select 1 from company_members m where m.company_id = p_company_id and m.user_id = auth.uid()) then
    raise exception 'access denied';
  end if;
  insert into security_events (id, company_id, user_id, event_type, resource_type, resource_id, result, reason, payload)
  values (coalesce(p_event_id, 'EVT-' || extract(epoch from now())::bigint || '-' || substr(gen_random_uuid()::text, 1, 8)), p_company_id, auth.uid(), p_event_type, p_resource_type, p_resource_id, p_result, p_reason, p_payload)
  returning * into v_event;
  return v_event;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function log_security_event(uuid, text, text, text, text, text, jsonb, text) to authenticated;
