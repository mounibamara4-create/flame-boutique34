-- Flame Boutique34: database for Supabase.
-- Run once in Supabase: SQL Editor > New query > paste this file > Run.

-- ---------- tables ----------
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1) on conflict do nothing;

create table if not exists products (
  id text primary key,
  name jsonb not null,               -- {"ar": "...", "fr": "..."}
  description jsonb not null default '{}',
  category text not null,
  type text not null default 'abaya', -- drawing shown while there is no photo
  price int not null check (price >= 0),
  compare_price int,                 -- old price shown crossed out
  badge text,                        -- 'new' | 'best' | null
  colors jsonb not null default '[]',-- [{"ar","fr","hex","image"}]
  sizes jsonb not null default '[]', -- ["S","M",...]
  stock jsonb,                       -- {"S": 3, ...}; null = not tracked
  image text not null default '',
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- purchase cost is kept apart so the public can never read it
create table if not exists product_costs (
  product_id text primary key references products(id) on delete cascade,
  cost int not null default 0
);

create table if not exists orders (
  id bigint generated always as identity primary key,
  code text unique not null,
  created_at timestamptz not null default now(),
  status text not null default 'new'
    check (status in ('new','confirmed','shipped','delivered','cancelled','returned')),
  customer_name text not null,
  phone text not null,
  wilaya_code int not null,
  wilaya_name text,
  commune text,
  delivery text not null,
  address text,
  note text,
  lang text,
  items jsonb not null,
  subtotal int not null,
  shipping int not null,
  total int not null,
  cost_total int not null default 0,
  admin_note text not null default ''
);
create index if not exists orders_created_idx on orders (created_at desc);

create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ---------- access rules ----------
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;
grant execute on function is_admin() to anon, authenticated;

alter table settings      enable row level security;
alter table products      enable row level security;
alter table product_costs enable row level security;
alter table orders        enable row level security;
alter table admins        enable row level security;

drop policy if exists "settings read"  on settings;
drop policy if exists "settings write" on settings;
create policy "settings read"  on settings for select using (true);
create policy "settings write" on settings for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "products read"  on products;
drop policy if exists "products write" on products;
create policy "products read"  on products for select using (active or is_admin());
create policy "products write" on products for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "costs admin" on product_costs;
create policy "costs admin" on product_costs for all to authenticated using (is_admin()) with check (is_admin());

-- customers never read or write orders directly; they go through place_order()
drop policy if exists "orders admin" on orders;
create policy "orders admin" on orders for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "admins read" on admins;
create policy "admins read" on admins for select to authenticated using (is_admin());

-- ---------- placing an order ----------
-- Prices, stock and delivery fees are taken from the database, never from the browser.
create or replace function place_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s jsonb; ship jsonb; it jsonb; prod products;
  w int := (p->>'wilaya')::int;
  mode text := p->>'delivery';
  phone text; sz text; ci int; qty int; c int; fee int;
  lines jsonb := '[]'; sub int := 0; cst int := 0; new_code text;
begin
  phone := regexp_replace(coalesce(p->>'phone', ''), '[\s.-]', '', 'g');
  phone := regexp_replace(phone, '^\+?213', '0');
  if phone !~ '^0[567][0-9]{8}$' then raise exception 'bad_phone'; end if;
  if length(trim(coalesce(p->>'name', ''))) < 3 then raise exception 'bad_name'; end if;
  if mode is null or mode not in ('home', 'desk') then raise exception 'bad_delivery'; end if;

  select data into s from settings where id = 1;
  ship := s->'shipping'->(w::text);
  if ship is null or coalesce((ship->>'on')::boolean, true) = false then raise exception 'bad_wilaya'; end if;
  fee := case when mode = 'home' then (ship->>'h')::int else (ship->>'d')::int end;

  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') not between 1 and 20 then
    raise exception 'bad_items';
  end if;

  for it in select * from jsonb_array_elements(p->'items') loop
    qty := (it->>'qty')::int; sz := it->>'size'; ci := coalesce((it->>'color')::int, 0);
    if qty is null or qty < 1 or qty > 10 then raise exception 'bad_items'; end if;

    select * into prod from products where id = it->>'id' and active for update;
    if not found then raise exception 'unavailable:%', it->>'id'; end if;
    if not (prod.sizes ? sz) then raise exception 'bad_items'; end if;
    if ci < 0 or ci >= jsonb_array_length(prod.colors) then raise exception 'bad_items'; end if;

    if prod.stock is not null and prod.stock ? sz then
      if (prod.stock->>sz)::int < qty then raise exception 'out_of_stock:%', prod.id; end if;
      update products set stock = jsonb_set(stock, array[sz], to_jsonb((stock->>sz)::int - qty)) where id = prod.id;
    end if;

    c := null;
    select cost into c from product_costs where product_id = prod.id;
    c := coalesce(c, 0);
    lines := lines || jsonb_build_object('id', prod.id, 'name', prod.name, 'size', sz, 'color', prod.colors->ci,
                                         'qty', qty, 'price', prod.price, 'cost', c);
    sub := sub + prod.price * qty;
    cst := cst + c * qty;
  end loop;

  new_code := 'FB34-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  insert into orders (code, customer_name, phone, wilaya_code, wilaya_name, commune, delivery, address, note, lang,
                      items, subtotal, shipping, total, cost_total)
  values (new_code, left(trim(p->>'name'), 80), phone, w, left(p->>'wilaya_name', 60), left(trim(coalesce(p->>'commune', '')), 80),
          mode, left(coalesce(p->>'address', ''), 200), left(coalesce(p->>'note', ''), 500), left(coalesce(p->>'lang', 'ar'), 2),
          lines, sub, fee, sub + fee, cst);

  return jsonb_build_object('code', new_code, 'subtotal', sub, 'shipping', fee, 'total', sub + fee);
end;
$$;
grant execute on function place_order(jsonb) to anon, authenticated;

-- cancelling or returning an order puts its pieces back in stock (and the reverse)
create or replace function orders_stock_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  was_active boolean := old.status not in ('cancelled', 'returned');
  now_active boolean := new.status not in ('cancelled', 'returned');
  sign int; it jsonb;
begin
  if was_active = now_active then return new; end if;
  sign := case when now_active then -1 else 1 end;
  for it in select * from jsonb_array_elements(new.items) loop
    update products
       set stock = jsonb_set(stock, array[it->>'size'],
                             to_jsonb(greatest(0, (stock->>(it->>'size'))::int + sign * (it->>'qty')::int)))
     where id = it->>'id' and stock is not null and stock ? (it->>'size');
  end loop;
  return new;
end;
$$;
drop trigger if exists orders_stock_sync on orders;
create trigger orders_stock_sync before update of status on orders
  for each row execute function orders_stock_sync();

-- ---------- product photos ----------
insert into storage.buckets (id, name, public) values ('products', 'products', true) on conflict do nothing;
drop policy if exists "product photos admin insert" on storage.objects;
drop policy if exists "product photos admin update" on storage.objects;
drop policy if exists "product photos admin delete" on storage.objects;
create policy "product photos admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'products' and is_admin());
create policy "product photos admin update" on storage.objects for update to authenticated
  using (bucket_id = 'products' and is_admin());
create policy "product photos admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'products' and is_admin());

-- ---------- owner account ----------
-- After creating the owner user (Authentication > Users > Add user), run this with the owner's email:
-- insert into admins (user_id) select id from auth.users where email = 'owner@example.com';
