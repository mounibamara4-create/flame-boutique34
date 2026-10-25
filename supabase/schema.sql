-- Flame Boutique34: database for Supabase (version 2).
-- Run in Supabase: SQL Editor > New query > paste this file > Run. Then run locations.sql the same way.
-- Safe to run again, and it upgrades a database created with version 1 of this file.

-- =====================================================================
-- reference data: wilayas, communes, order statuses
-- =====================================================================
create table if not exists wilayas (
  code int primary key,
  name_ar text not null,
  name_fr text not null,
  parent_code int references wilayas(code)   -- for the 11 wilayas created in 2026: the wilaya they were taken from
);

create table if not exists communes (
  id int primary key,
  wilaya_code int not null references wilayas(code),
  name_ar text not null,
  name_fr text not null
);
create index if not exists communes_wilaya_idx on communes (wilaya_code);

create table if not exists order_statuses (
  code text primary key,
  sort int not null,
  label_ar text not null,
  label_fr text not null,
  is_step boolean not null,        -- part of the normal progress bar (received ... delivered)
  releases_stock boolean not null  -- pieces go back to stock when an order reaches this status
);
insert into order_statuses (code, sort, label_ar, label_fr, is_step, releases_stock) values
  ('received',          1, 'تم استلام الطلب',              'Commande reçue',              true,  false),
  ('contacting',        2, 'قيد التأكيد والاتصال بالزبونة', 'Confirmation en cours',       true,  false),
  ('confirmed',         3, 'تم تأكيد الطلب',               'Commande confirmée',          true,  false),
  ('preparing',         4, 'قيد التحضير',                  'En préparation',              true,  false),
  ('handed_to_carrier', 5, 'تم تسليم الطلب لشركة التوصيل',  'Remise au transporteur',      true,  false),
  ('out_for_delivery',  6, 'خرج للتوصيل',                  'En cours de livraison',       true,  false),
  ('delivered',         7, 'تم التسليم',                   'Livrée',                      true,  false),
  ('cancelled',         8, 'أُلغي الطلب',                   'Annulée',                     false, true),
  ('failed',            9, 'تعذّر التسليم',                 'Livraison impossible',        false, true)
on conflict (code) do update set sort = excluded.sort, label_ar = excluded.label_ar, label_fr = excluded.label_fr,
  is_step = excluded.is_step, releases_stock = excluded.releases_stock;

-- =====================================================================
-- delivery prices
-- One row per wilaya (scope = 0) and optional rows per commune (scope = commune id) that override it.
-- A null price means "not set yet": the store shows that the price needs confirmation.
-- *_available = false means the method is not offered there.
-- =====================================================================
create table if not exists shipping_rates (
  wilaya_code int not null references wilayas(code),
  scope int not null default 0,
  home_price int check (home_price >= 0),
  desk_price int check (desk_price >= 0),
  home_available boolean not null default true,
  desk_available boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (wilaya_code, scope)
);

-- =====================================================================
-- shop
-- =====================================================================
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
  compare_price int,                 -- original price, shown crossed out when higher than price
  badge text,                        -- 'new' | 'best' | null
  colors jsonb not null default '[]',-- [{"ar","fr","hex","image"}]
  sizes jsonb not null default '[]', -- ["S","M",...]
  stock jsonb,                       -- {"S": 3, ...}; null = not tracked
  image text not null default '',
  images jsonb not null default '[]',  -- extra photos, in display order
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- purchase cost is kept apart so the public can never read it
alter table products add column if not exists images jsonb not null default '[]';  -- for databases created before it existed
-- photos without background for the rack on the home page: {"front": url, "back": url}; a colour's own one is colors[i].cutout
alter table products add column if not exists cutout jsonb not null default '{}';

create table if not exists product_costs (
  product_id text primary key references products(id) on delete cascade,
  cost int not null default 0
);

-- =====================================================================
-- orders
-- =====================================================================
create table if not exists orders (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  status text not null default 'received',
  phone text not null,
  wilaya_code int not null,
  wilaya_name text,
  delivery text not null,
  address text,
  note text,
  lang text,
  subtotal int not null,
  total int not null,
  cost_total int not null default 0,
  admin_note text not null default ''
);
-- version 2 columns (also added to a version 1 table)
alter table orders add column if not exists order_number text;
alter table orders add column if not exists tracking_code text;
alter table orders add column if not exists idempotency_key uuid;
alter table orders add column if not exists updated_at timestamptz not null default now();
alter table orders add column if not exists first_name text;
alter table orders add column if not exists last_name text;
alter table orders add column if not exists phone2 text;
alter table orders add column if not exists whatsapp text;
alter table orders add column if not exists instagram text;
alter table orders add column if not exists commune_id int;
alter table orders add column if not exists commune_name text;
alter table orders add column if not exists shipping int;
alter table orders add column if not exists shipping_pending boolean not null default false;
create unique index if not exists orders_order_number_key on orders (order_number);
create unique index if not exists orders_tracking_code_key on orders (tracking_code);
create unique index if not exists orders_idempotency_key_key on orders (idempotency_key);
create index if not exists orders_created_idx on orders (created_at desc);

create table if not exists order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references orders(id) on delete cascade,
  product_id text,
  name jsonb not null,
  size text not null,
  color jsonb not null,
  qty int not null check (qty > 0),
  unit_price int not null,
  unit_cost int not null default 0
);
create index if not exists order_items_order_idx on order_items (order_id);

create table if not exists order_status_history (
  id bigint generated always as identity primary key,
  order_id bigint not null references orders(id) on delete cascade,
  status text not null references order_statuses(code),
  note text not null default '',
  by_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists order_status_history_order_idx on order_status_history (order_id, created_at);

-- ---------- upgrade from version 1 ----------
do $$
begin
  -- version 1 kept the customer in one field and the items as JSON; both become optional legacy columns
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'customer_name') then
    alter table orders alter column customer_name drop not null;
    update orders set first_name = coalesce(first_name, customer_name) where first_name is null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'items') then
    alter table orders alter column items drop not null;
    insert into order_items (order_id, product_id, name, size, color, qty, unit_price, unit_cost)
    select o.id, i->>'id', coalesce(i->'name', '{}'::jsonb), coalesce(i->>'size', ''), coalesce(i->'color', '{}'::jsonb),
           greatest(1, coalesce((i->>'qty')::int, 1)), coalesce((i->>'price')::int, 0), coalesce((i->>'cost')::int, 0)
      from orders o cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) i
     where not exists (select 1 from order_items x where x.order_id = o.id);
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'code') then
    alter table orders alter column code drop not null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'customer_name') then
    alter table orders alter column phone set not null;
  end if;
end $$;
alter table orders drop constraint if exists orders_status_check;
update orders set status = case status when 'new' then 'received' when 'shipped' then 'handed_to_carrier' when 'returned' then 'failed' else status end
 where status in ('new', 'shipped', 'returned');
alter table orders alter column status set default 'received';
alter table orders alter column shipping drop not null;
update orders set order_number = 'FB-' || lpad(id::text, 5, '0') where order_number is null;
drop trigger if exists orders_stock_sync on orders;
drop function if exists orders_stock_sync();
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_status_fkey') then
    alter table orders add constraint orders_status_fkey foreign key (status) references order_statuses(code);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_delivery_check') then
    alter table orders add constraint orders_delivery_check check (delivery in ('home', 'desk'));
  end if;
end $$;

-- fake orders: numbers the owner blocked, and a one-way fingerprint of the network each order came from
alter table orders add column if not exists ip_hash text;
create index if not exists orders_phone_idx on orders (phone, created_at desc);
create index if not exists orders_ip_idx on orders (ip_hash, created_at desc);
create table if not exists blocked_phones (
  phone text primary key,
  note text not null default '',
  created_at timestamptz not null default now()
);

-- new-order notifications on Telegram. The bot token stays here: only the owner can read or change it,
-- visitors never see it, and the message is sent by the database (pg_net), not by the browser.
create table if not exists notify_settings (
  id int primary key default 1 check (id = 1),
  telegram_token text not null default '',
  telegram_chat text not null default '',
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into notify_settings (id) values (1) on conflict do nothing;
-- pg_net sends HTTP requests from the database (Supabase: Database > Extensions). Missing: orders still work, no message.
do $$ begin
  create extension if not exists pg_net;
exception when others then raise notice 'pg_net not available: Telegram messages are off';
end $$;

create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- =====================================================================
-- helpers
-- =====================================================================
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;
grant execute on function is_admin() to anon, authenticated;

-- 0555 12 34 56, +213 555123456, 00213555123456 -> 0555123456
create or replace function norm_phone(t text) returns text
language sql immutable as $$
  select regexp_replace(regexp_replace(coalesce(t, ''), '[\s.()-]', '', 'g'), '^(\+|00)213', '0');
$$;

-- every status change: keep the history, keep totals right, put pieces back when an order is cancelled or fails
create or replace function orders_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  old_rel boolean; new_rel boolean; it record;
begin
  new.updated_at := now();
  if new.shipping is distinct from old.shipping and new.shipping is not null then
    new.shipping_pending := false;
  end if;
  new.total := new.subtotal + coalesce(new.shipping, 0);
  if new.status is distinct from old.status then
    insert into order_status_history (order_id, status, note, by_admin)
    values (new.id, new.status, coalesce(current_setting('fb.status_note', true), ''), is_admin());
    select releases_stock into old_rel from order_statuses where code = old.status;
    select releases_stock into new_rel from order_statuses where code = new.status;
    if old_rel is distinct from new_rel then
      for it in select product_id, size, qty from order_items where order_id = new.id loop
        update products
           set stock = jsonb_set(stock, array[it.size],
                                 to_jsonb(greatest(0, (stock->>it.size)::int + case when new_rel then it.qty else -it.qty end)))
         where id = it.product_id and stock is not null and stock ? it.size;
      end loop;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists orders_before_update on orders;
create trigger orders_before_update before update on orders for each row execute function orders_before_update();

-- admin: change a status and attach a note to the history entry
create or replace function set_order_status(p_order bigint, p_status text, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  perform set_config('fb.status_note', left(coalesce(p_note, ''), 300), true);
  update orders set status = p_status where id = p_order;
  if not found then raise exception 'not_found'; end if;
end;
$$;
grant execute on function set_order_status(bigint, text, text) to authenticated;

-- =====================================================================
-- access rules
-- =====================================================================
alter table wilayas              enable row level security;
alter table communes             enable row level security;
alter table order_statuses       enable row level security;
alter table shipping_rates       enable row level security;
alter table settings             enable row level security;
alter table products             enable row level security;
alter table product_costs        enable row level security;
alter table orders               enable row level security;
alter table order_items          enable row level security;
alter table order_status_history enable row level security;
alter table admins               enable row level security;
alter table blocked_phones       enable row level security;
alter table notify_settings      enable row level security;

do $$
declare t text;
begin
  -- public reference data: everyone reads, only the owner writes
  foreach t in array array['wilayas', 'communes', 'order_statuses', 'shipping_rates', 'settings'] loop
    execute format('drop policy if exists "%s read" on %I', t, t);
    execute format('drop policy if exists "%s write" on %I', t, t);
    execute format('create policy "%s read" on %I for select using (true)', t, t);
    execute format('create policy "%s write" on %I for all to authenticated using (is_admin()) with check (is_admin())', t, t);
  end loop;
  -- owner only: customers never read or write these directly; orders go through place_order()
  foreach t in array array['product_costs', 'orders', 'order_items', 'order_status_history', 'blocked_phones', 'notify_settings'] loop
    execute format('drop policy if exists "%s admin" on %I', t, t);
    execute format('create policy "%s admin" on %I for all to authenticated using (is_admin()) with check (is_admin())', t, t);
  end loop;
end $$;
drop policy if exists "costs admin" on product_costs;  -- version 1 name; "orders admin" is recreated by the loop above

drop policy if exists "products read"  on products;
drop policy if exists "products write" on products;
create policy "products read"  on products for select using (active or is_admin());
create policy "products write" on products for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "admins read" on admins;
create policy "admins read" on admins for select to authenticated using (is_admin());

-- Table permissions, stated explicitly (some Supabase projects do not grant them to new tables by default).
-- They only open the door; the row rules above still decide every row. Orders are never granted to visitors:
-- they go through place_order() and track_order().
grant usage on schema public to anon, authenticated;
grant select on wilayas, communes, order_statuses, shipping_rates, settings, products to anon, authenticated;
grant select, insert, update, delete on wilayas, communes, order_statuses, shipping_rates, settings, products,
  product_costs, orders, order_items, order_status_history to authenticated;
grant select on admins to authenticated;
grant select, insert, update, delete on blocked_phones, notify_settings to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- =====================================================================
-- new-order message on Telegram
-- =====================================================================
create or replace function telegram_send(p_text text) returns bigint
language plpgsql security definer set search_path = public as $$
declare n notify_settings; rid bigint;
begin
  select * into n from notify_settings where id = 1;
  if n.telegram_token = '' or n.telegram_chat = '' then return null; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    into rid
    using 'https://api.telegram.org/bot' || n.telegram_token || '/sendMessage',
          jsonb_build_object('chat_id', n.telegram_chat, 'text', left(p_text, 4000), 'disable_web_page_preview', true),
          '{"Content-Type": "application/json"}'::jsonb;
  return rid;
end;
$$;
revoke all on function telegram_send(text) from public, anon, authenticated;

create or replace function notify_new_order(p_order bigint) returns void
language plpgsql security definer set search_path = public as $$
declare o orders; items text; n notify_settings;
begin
  select * into n from notify_settings where id = 1;
  if not coalesce(n.enabled, false) then return; end if;
  select * into o from orders where id = p_order;
  select string_agg('• ' || coalesce(i.name->>'ar', i.name->>'fr', '') || ' (' || coalesce(i.color->>'ar', '') || '، ' || i.size || ') ×' || i.qty, E'\n' order by i.id)
    into items from order_items i where i.order_id = o.id;
  perform telegram_send(
    '🛍️ طلب جديد ' || o.order_number || E'\n\n' ||
    '👤 ' || o.first_name || ' ' || o.last_name || E'\n' ||
    '📞 ' || o.phone || coalesce(' / ' || o.phone2, '') || E'\n' ||
    '📍 ' || o.wilaya_code || ' ' || coalesce(o.wilaya_name, '') || ' - ' || coalesce(o.commune_name, '') || E'\n' ||
    '🚚 ' || case o.delivery when 'home' then 'إلى المنزل: ' || coalesce(o.address, '') else 'إلى مكتب شركة التوصيل' end || E'\n\n' ||
    coalesce(items, '') || E'\n\n' ||
    '💰 المجموع: ' || o.total || ' دج' || case when o.shipping_pending then ' (دون التوصيل، سعره يحتاج تأكيداً)' else '' end ||
    case when coalesce(o.note, '') <> '' then E'\n📝 ' || o.note else '' end || E'\n' ||
    '🔎 ' || o.tracking_code);
exception when others then
  raise warning 'order % saved, Telegram message not sent: %', p_order, sqlerrm;   -- the order is never lost for a message
end;
$$;
revoke all on function notify_new_order(bigint) from public, anon, authenticated;

-- owner: settings without ever sending the token back to the browser
create or replace function notify_get() returns jsonb
language plpgsql security definer set search_path = public as $$
declare n notify_settings;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  select * into n from notify_settings where id = 1;
  return jsonb_build_object('enabled', n.enabled, 'chat', n.telegram_chat, 'has_token', n.telegram_token <> '',
    'pg_net', exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'net' and p.proname = 'http_post'));
end;
$$;
grant execute on function notify_get() to authenticated;

-- an empty token keeps the saved one
create or replace function notify_save(p_token text, p_chat text, p_enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if coalesce(p_token, '') <> '' and p_token !~ '^[0-9]{5,15}:[A-Za-z0-9_-]{30,60}$' then raise exception 'invalid:token'; end if;
  if coalesce(p_chat, '') !~ '^-?[0-9]{3,20}$' and coalesce(p_chat, '') <> '' then raise exception 'invalid:chat'; end if;
  update notify_settings set telegram_token = case when coalesce(p_token, '') <> '' then p_token else telegram_token end,
    telegram_chat = coalesce(p_chat, ''), enabled = coalesce(p_enabled, false), updated_at = now() where id = 1;
end;
$$;
grant execute on function notify_save(text, text, boolean) to authenticated;

-- owner: a test message, then its result (Telegram's answer arrives a moment later)
create or replace function notify_test() returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'net' and p.proname = 'http_post') then raise exception 'pg_net_missing'; end if;
  return telegram_send('✅ Flame Boutique34: الإشعارات تعمل. ستصلك هنا رسالة عند كل طلب جديد.');
end;
$$;
grant execute on function notify_test() to authenticated;

create or replace function notify_result(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  execute 'select status_code, error_msg, timed_out, left(content::text, 300) as content from net._http_response where id = $1' into r using p_id;
  if r is null then return jsonb_build_object('pending', true); end if;
  return jsonb_build_object('status', r.status_code, 'error', r.error_msg, 'timed_out', r.timed_out, 'content', r.content);
exception when others then
  return jsonb_build_object('pending', true);
end;
$$;
grant execute on function notify_result(bigint) to authenticated;

-- owner: block a number (and see/unblock it in the dashboard through the table)
create or replace function block_phone(p_phone text, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  insert into blocked_phones (phone, note) values (norm_phone(p_phone), left(coalesce(p_note, ''), 200))
  on conflict (phone) do update set note = excluded.note;
end;
$$;
grant execute on function block_phone(text, text) to authenticated;

-- the dashboard hears about new orders at once (Supabase Realtime, owner only through the row rules)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'orders') then
    alter publication supabase_realtime add table orders;
  end if;
end $$;

-- =====================================================================
-- placing an order
-- Everything is checked here: names, phones, wilaya and commune, delivery method, prices, stock.
-- The browser sends a random idempotency_key per order attempt; sending it again returns the same order.
-- =====================================================================
create or replace function place_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  k uuid; o orders; prod products; r shipping_rates; it jsonb;
  w int; cid int; cname text; wname text; mode text := p->>'delivery';
  fname text := trim(coalesce(p->>'first_name', ''));
  lname text := trim(coalesce(p->>'last_name', ''));
  ph text := norm_phone(p->>'phone');
  ph2 text := nullif(norm_phone(p->>'phone2'), '');
  wa text := nullif(norm_phone(p->>'whatsapp'), '');
  ig text := nullif(regexp_replace(trim(coalesce(p->>'instagram', '')), '^@', ''), '');
  addr text := trim(coalesce(p->>'address', ''));
  sz text; ci int; qty int; c int; fee int; avail boolean := true;
  lines jsonb := '[]'; sub int := 0; cst int := 0;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea; tcode text; i int;
  hdr json; ip text; iph text;
begin
  begin k := (p->>'idempotency_key')::uuid; exception when others then k := null; end;
  if k is null then raise exception 'invalid:request'; end if;
  -- the same attempt sent twice (double tap, network retry) waits here, then gets the first result
  perform pg_advisory_xact_lock(hashtextextended(k::text, 0));
  select * into o from orders where idempotency_key = k;
  if found then
    return jsonb_build_object('order_number', o.order_number, 'tracking_code', o.tracking_code, 'subtotal', o.subtotal,
      'shipping', o.shipping, 'shipping_pending', o.shipping_pending, 'total', o.total, 'repeat', true);
  end if;

  -- a hidden form field people never see; automated scripts fill it in
  if coalesce(p->>'hp', '') <> '' then raise exception 'invalid:request'; end if;

  if length(fname) < 2 or length(fname) > 40 then raise exception 'invalid:first_name'; end if;
  if length(lname) < 2 or length(lname) > 40 then raise exception 'invalid:last_name'; end if;
  if ph !~ '^0[567][0-9]{8}$' then raise exception 'invalid:phone'; end if;
  if ph2 is not null and ph2 !~ '^0[567][0-9]{8}$' then raise exception 'invalid:phone2'; end if;
  if wa is not null and wa !~ '^0[567][0-9]{8}$' then raise exception 'invalid:whatsapp'; end if;
  if ig is not null and ig !~ '^[A-Za-z0-9._]{1,30}$' then raise exception 'invalid:instagram'; end if;


  begin w := (p->>'wilaya')::int; exception when others then w := null; end;
  select name_ar into wname from wilayas where code = w;
  if wname is null then raise exception 'invalid:wilaya'; end if;

  -- a wilaya with a commune list must use it; a wilaya without one takes the name as typed
  if exists (select 1 from communes where wilaya_code = w) then
    begin cid := (p->>'commune_id')::int; exception when others then cid := null; end;
    select name_ar into cname from communes where id = cid and wilaya_code = w;
    if cname is null then raise exception 'invalid:commune'; end if;
  else
    cid := null;
    cname := trim(coalesce(p->>'commune_name', ''));
    if length(cname) < 2 or length(cname) > 60 then raise exception 'invalid:commune'; end if;
  end if;

  if mode is null or mode not in ('home', 'desk') then raise exception 'invalid:delivery'; end if;
  select * into r from shipping_rates where wilaya_code = w and scope = coalesce(cid, 0);
  if not found and cid is not null then
    select * into r from shipping_rates where wilaya_code = w and scope = 0;
  end if;
  if found then
    avail := case mode when 'home' then r.home_available else r.desk_available end;
    fee := case mode when 'home' then r.home_price else r.desk_price end;
  else
    fee := null;
  end if;
  if not avail then raise exception 'invalid:delivery'; end if;
  if mode = 'home' and (length(addr) < 5 or length(addr) > 200) then raise exception 'invalid:address'; end if;

  -- fake orders: a blocked number, too many orders still waiting for the call, an order a moment ago,
  -- or many orders from the same network within an hour
  if exists (select 1 from blocked_phones where phone = ph) then raise exception 'blocked'; end if;
  if (select count(*) from orders where phone = ph and status in ('received', 'contacting')) >= 3 then raise exception 'limit:open'; end if;
  if exists (select 1 from orders where phone = ph and created_at > now() - interval '60 seconds') then raise exception 'limit:wait'; end if;
  begin hdr := nullif(current_setting('request.headers', true), '')::json; exception when others then hdr := null; end;
  ip := trim(split_part(coalesce(hdr->>'cf-connecting-ip', hdr->>'x-real-ip', hdr->>'x-forwarded-for', ''), ',', 1));
  if ip <> '' then
    iph := md5('fb34:' || ip);   -- the address itself is not kept
    if (select count(*) from orders where ip_hash = iph and created_at > now() - interval '1 hour') >= 6 then raise exception 'limit:ip'; end if;
  end if;

  if jsonb_typeof(p->'items') is distinct from 'array' then raise exception 'invalid:items'; end if;
  if jsonb_array_length(p->'items') not between 1 and 20 then raise exception 'invalid:items'; end if;

  for it in select * from jsonb_array_elements(p->'items') loop
    begin qty := (it->>'qty')::int; ci := coalesce((it->>'color')::int, 0); exception when others then raise exception 'invalid:items'; end;
    sz := it->>'size';
    if qty is null or qty < 1 or qty > 10 or sz is null then raise exception 'invalid:items'; end if;

    select * into prod from products where id = it->>'id' and active for update;
    if not found then raise exception 'unavailable:%', it->>'id'; end if;
    if not (prod.sizes ? sz) then raise exception 'invalid:items'; end if;
    if ci < 0 or ci >= jsonb_array_length(prod.colors) then raise exception 'invalid:items'; end if;

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

  -- tracking code FLM-XXXXXXXX from random bytes, 32-letter alphabet without 0/O/1/I
  loop
    b := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
    tcode := 'FLM-';
    for i in 0..7 loop
      tcode := tcode || substr(alphabet, (get_byte(b, i * 2) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from orders o2 where o2.tracking_code = tcode);
  end loop;

  insert into orders (idempotency_key, tracking_code, status, first_name, last_name, phone, phone2, whatsapp, instagram,
                      wilaya_code, wilaya_name, commune_id, commune_name, delivery, address, note, lang,
                      subtotal, shipping, shipping_pending, total, cost_total, ip_hash)
  values (k, tcode, 'received', fname, lname, ph, ph2, wa, ig,
          w, wname, cid, cname, mode, case when mode = 'home' then addr else '' end, left(coalesce(p->>'note', ''), 500),
          case when p->>'lang' in ('ar', 'fr') then p->>'lang' else 'ar' end,
          sub, fee, fee is null, sub + coalesce(fee, 0), cst, iph)
  returning * into o;

  update orders set order_number = 'FB-' || lpad(o.id::text, 5, '0') where id = o.id returning * into o;
  insert into order_items (order_id, product_id, name, size, color, qty, unit_price, unit_cost)
  select o.id, l->>'id', l->'name', l->>'size', l->'color', (l->>'qty')::int, (l->>'price')::int, (l->>'cost')::int
    from jsonb_array_elements(lines) l;
  insert into order_status_history (order_id, status) values (o.id, 'received');
  perform notify_new_order(o.id);   -- never fails the order

  return jsonb_build_object('order_number', o.order_number, 'tracking_code', o.tracking_code, 'subtotal', o.subtotal,
    'shipping', o.shipping, 'shipping_pending', o.shipping_pending, 'total', o.total, 'repeat', false);
end;
$$;
grant execute on function place_order(jsonb) to anon, authenticated;

-- =====================================================================
-- customer reviews
-- A customer can review an order once it is delivered (tracking code + phone), once per order.
-- New reviews wait for the owner's approval; only approved reviews are public.
-- The owner can also add reviews received elsewhere (WhatsApp, Instagram); they are not marked as verified.
-- =====================================================================
create table if not exists reviews (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  order_id bigint unique references orders(id) on delete set null,
  product_id text references products(id) on delete set null,
  name text not null check (length(name) between 2 and 40),
  wilaya_name text not null default '',
  rating int not null check (rating between 1 and 5),
  body text not null default '' check (length(body) <= 600),
  photo text not null default '',
  verified boolean not null default false,   -- written by the customer from a delivered order
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden'))
);
create index if not exists reviews_product_idx on reviews (product_id) where status = 'approved';
alter table reviews enable row level security;
drop policy if exists "reviews read" on reviews;
drop policy if exists "reviews admin" on reviews;
create policy "reviews read" on reviews for select using (status = 'approved' or is_admin());
create policy "reviews admin" on reviews for all to authenticated using (is_admin()) with check (is_admin());
-- visitors may read the public columns only (not which order a review came from)
grant select, insert, update, delete on reviews to authenticated;
revoke select on reviews from anon;
grant select (id, created_at, product_id, name, wilaya_name, rating, body, photo, verified, status) on reviews to anon;

create or replace function submit_review(p_code text, p_phone text, p_product text, p_rating int, p_body text, p_name text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare o orders; nm text; pid text;
begin
  select * into o from orders where tracking_code = upper(trim(coalesce(p_code, ''))) and phone = norm_phone(p_phone);
  if not found then perform pg_sleep(0.4); raise exception 'not_found'; end if;
  if o.status <> 'delivered' then raise exception 'not_delivered'; end if;
  if exists (select 1 from reviews where order_id = o.id) then raise exception 'already_reviewed'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'invalid:rating'; end if;
  if length(trim(coalesce(p_body, ''))) > 600 then raise exception 'invalid:body'; end if;
  -- the product must be one of the order's pieces; none chosen = a review of the shop
  pid := nullif(trim(coalesce(p_product, '')), '');
  if pid is not null and not exists (select 1 from order_items where order_id = o.id and product_id = pid) then raise exception 'invalid:product'; end if;
  if pid is not null and not exists (select 1 from products where id = pid) then pid := null; end if;
  -- shown name: what the customer typed, else her first name and the initial of her last name
  nm := left(trim(coalesce(p_name, '')), 40);
  if length(nm) < 2 then nm := left(o.first_name || coalesce(' ' || left(o.last_name, 1) || '.', ''), 40); end if;
  insert into reviews (order_id, product_id, name, wilaya_name, rating, body, verified, status)
  values (o.id, pid, nm, coalesce(o.wilaya_name, ''), p_rating, trim(coalesce(p_body, '')), true, 'pending');
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function submit_review(text, text, text, int, text, text) to anon, authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- =====================================================================
-- delivery company: ZR Express
-- The owner's ZR keys stay in this database: visitors never see them, the browser never receives them.
-- Requests to ZR are made by the database (pg_net), only for the owner and only to a short list of ZR addresses.
-- "zr" is ZR's current platform (api.zrexpress.app: API key + tenant); "zr_old" its former one (procolis.com: token + key).
-- =====================================================================
create table if not exists courier_settings (
  id int primary key default 1 check (id = 1),
  provider text not null default 'zr' check (provider in ('zr', 'zr_old')),
  api_key text not null default '',
  tenant text not null default '',
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into courier_settings (id) values (1) on conflict do nothing;
-- requests sent and not read yet (pg_net answers arrive a moment later)
create table if not exists courier_calls (
  id bigint primary key,                 -- pg_net request id
  order_id bigint references orders(id) on delete cascade,
  kind text not null,                    -- 'call' (asked by the owner) or 'sync' (status check)
  created_at timestamptz not null default now()
);
alter table courier_settings enable row level security;   -- no policy: reached only through the functions below
alter table courier_calls enable row level security;
alter table orders add column if not exists courier_ref text;          -- ZR's id for the parcel
alter table orders add column if not exists courier_tracking text;     -- ZR's tracking number
alter table orders add column if not exists courier_state text;        -- ZR's state, as ZR names it
alter table orders add column if not exists courier_label text;        -- ZR's description of it
alter table orders add column if not exists courier_stage text;        -- the same, in a few plain stages (see courier_stage())
alter table orders add column if not exists courier_at timestamptz;    -- when ZR's state last changed here
alter table orders add column if not exists courier_sent_at timestamptz;
alter table orders add column if not exists courier_checked_at timestamptz;

create or replace function courier_has_net() returns boolean
language sql stable as $$
  select exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'net' and p.proname = 'http_post');
$$;

-- ZR's state names (French or English, with or without accents) -> a few plain stages.
-- Unknown names give 'other': shown as ZR wrote them, and they never change the order's status.
create or replace function courier_stage(p_state text) returns text
language sql immutable as $$
  with n as (select regexp_replace(lower(translate(coalesce(p_state, ''), 'ÀÂÄÇÉÈÊËÎÏÔÖÙÛÜàâäçéèêëîïôöùûü', 'AAACEEEEIIOOUUUaaaceeeeiioouuu')), '[^a-z0-9]', '', 'g') as s)
  select case
    when s = '' then 'other'
    when s in ('livre', 'livree', 'delivered', 'encaisse', 'encaissee', 'paye', 'payee', 'recouvre') then 'delivered'
    when s like 'retour%' or s like 'return%' or s like '%retourne%' or s like '%returned%' then 'returned'
    when s in ('annule', 'annulee', 'cancelled', 'canceled', 'supprime', 'supprimee', 'deleted') then 'cancelled'
    when s like '%tentative%' or s like '%echec%' or s like '%failed%' or s like '%reporte%' or s like '%injoignable%'
      or s like '%absent%' or s like '%attempt%' or s like '%postponed%' or s like '%refus%' then 'attempt'
    when s like '%bureau%' or s like '%stopdesk%' or s like '%pickuppoint%' or s like '%disponible%' or s like '%readyforpickup%' then 'desk'
    when s like '%enlivraison%' or s like '%outfordelivery%' or s like '%endistribution%' then 'out'
    when s in ('commanderecue', 'orderreceived', 'enattente', 'pending', 'nouveau', 'new', 'created', 'pretaexpedier', 'readytodispatch', 'enpreparation')
      then 'created'
    when s like '%transit%' or s like '%expedi%' or s like '%ramass%' or s like '%pickedup%' or s like '%dispatch%' or s like '%shipped%'
      or s like '%centre%' or s like '%center%' or s like '%hub%' or s like '%transfer%' or s like '%vers%' or s like '%recu%' or s like '%received%' then 'transit'
    else 'other' end
  from n;
$$;

-- ZR's state reached this order: keep it, and move the order forward when it clearly says so.
-- Never backwards, never "cancelled" or "failed" on its own: a returned parcel is shown, the owner decides.
create or replace function courier_apply(p_order bigint, p_state text, p_label text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders; stg text := courier_stage(coalesce(nullif(p_state, ''), p_label)); target text; cur int; nxt int;
begin
  select * into o from orders where id = p_order;
  if not found then return; end if;
  if o.courier_state is distinct from p_state or o.courier_label is distinct from p_label then
    update orders set courier_state = p_state, courier_label = p_label, courier_stage = stg, courier_at = now(), courier_checked_at = now() where id = p_order;
  else
    update orders set courier_checked_at = now() where id = p_order;
  end if;
  target := case stg when 'delivered' then 'delivered' when 'out' then 'out_for_delivery' when 'desk' then 'out_for_delivery'
                     when 'attempt' then 'out_for_delivery' when 'transit' then 'handed_to_carrier' else null end;
  if target is null then return; end if;
  select sort into cur from order_statuses where code = o.status and is_step;
  select sort into nxt from order_statuses where code = target;
  if cur is not null and nxt > cur then
    perform set_config('fb.status_note', left('ZR Express: ' || coalesce(nullif(p_label, ''), p_state, ''), 300), true);
    update orders set status = target where id = p_order;
  end if;
end;
$$;
revoke all on function courier_apply(bigint, text, text) from public, anon, authenticated;

-- one request to ZR (the owner's keys are added here, never in the browser)
create or replace function courier_request(p_method text, p_path text, p_body jsonb, p_order bigint, p_kind text) returns bigint
language plpgsql security definer set search_path = public as $$
declare c courier_settings; base text; hdr jsonb; rid bigint; m text := upper(coalesce(p_method, ''));
begin
  select * into c from courier_settings where id = 1;
  if c.api_key = '' or c.tenant = '' then raise exception 'courier:keys'; end if;
  if not courier_has_net() then raise exception 'pg_net_missing'; end if;
  -- only these ZR addresses can be reached
  if c.provider = 'zr' then
    if not ((m = 'POST' and p_path in ('/territories/search', '/hubs/search', '/parcels', '/parcels/search'))
         or (m = 'GET' and (p_path in ('/users/profile', '/delivery-pricing/rates') or p_path ~ '^/parcels/[A-Za-z0-9-]{1,64}(/state-history)?$'))) then
      raise exception 'courier:path';
    end if;
    base := 'https://api.zrexpress.app/api/v1';
    hdr := jsonb_build_object('X-Api-Key', c.api_key, 'X-Tenant', c.tenant, 'Content-Type', 'application/json', 'Accept', 'application/json');
  else
    if not ((m = 'POST' and p_path in ('/add_colis', '/lire', '/tarification')) or (m = 'GET' and p_path = '/token')) then
      raise exception 'courier:path';
    end if;
    base := 'https://procolis.com/api_v1';
    hdr := jsonb_build_object('token', c.tenant, 'key', c.api_key, 'Content-Type', 'application/json');
  end if;
  if m = 'GET' then
    execute 'select net.http_get(url := $1, headers := $2, timeout_milliseconds := 20000)' into rid using base || p_path, hdr;
  else
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 20000)' into rid using base || p_path, coalesce(p_body, '{}'::jsonb), hdr;
  end if;
  insert into courier_calls (id, order_id, kind) values (rid, p_order, p_kind) on conflict (id) do nothing;
  return rid;
end;
$$;
revoke all on function courier_request(text, text, jsonb, bigint, text) from public, anon, authenticated;

-- owner: settings, never sending the keys back
create or replace function courier_get() returns jsonb
language plpgsql security definer set search_path = public as $$
declare c courier_settings;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  select * into c from courier_settings where id = 1;
  return jsonb_build_object('provider', c.provider, 'enabled', c.enabled, 'has_key', c.api_key <> '', 'has_tenant', c.tenant <> '',
    'pg_net', courier_has_net(), 'auto', exists (select 1 from pg_namespace where nspname = 'cron'));
end;
$$;
grant execute on function courier_get() to authenticated;

-- empty key or tenant: keep the saved one
create or replace function courier_save(p_provider text, p_key text, p_tenant text, p_enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if coalesce(p_provider, '') not in ('zr', 'zr_old') then raise exception 'invalid:provider'; end if;
  if coalesce(p_key, '') <> '' and p_key !~ '^[A-Za-z0-9._~+/=-]{8,255}$' then raise exception 'invalid:key'; end if;
  if coalesce(p_tenant, '') <> '' and p_tenant !~ '^[A-Za-z0-9._~+/=-]{4,255}$' then raise exception 'invalid:tenant'; end if;
  if p_provider = 'zr' and coalesce(p_tenant, '') <> '' and p_tenant !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'invalid:tenant';
  end if;
  update courier_settings set provider = p_provider,
    api_key = case when coalesce(p_key, '') <> '' then p_key else api_key end,
    tenant = case when coalesce(p_tenant, '') <> '' then p_tenant else tenant end,
    enabled = coalesce(p_enabled, false), updated_at = now() where id = 1;
end;
$$;
grant execute on function courier_save(text, text, text, boolean) to authenticated;

-- owner: one ZR request, then its answer
create or replace function courier_call(p_method text, p_path text, p_body jsonb default null, p_order bigint default null) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return courier_request(p_method, p_path, p_body, p_order, 'call');
end;
$$;
grant execute on function courier_call(text, text, jsonb, bigint) to authenticated;

create or replace function courier_result(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; b jsonb;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if not exists (select 1 from courier_calls where id = p_id) then raise exception 'not_found'; end if;
  begin
    execute 'select status_code, error_msg, timed_out, content from net._http_response where id = $1' into r using p_id;
  exception when others then return jsonb_build_object('pending', true);
  end;
  if r is null then return jsonb_build_object('pending', true); end if;
  begin b := r.content::jsonb; exception when others then b := to_jsonb(left(coalesce(r.content, ''), 500)); end;
  return jsonb_build_object('status', r.status_code, 'error', r.error_msg, 'timed_out', r.timed_out, 'body', b);
end;
$$;
grant execute on function courier_result(bigint) to authenticated;

-- owner: the parcel now exists at ZR; keep its numbers on the order
create or replace function courier_link(p_order bigint, p_ref text, p_tracking text, p_state text default '', p_label text default '') returns void
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if coalesce(trim(p_tracking), '') = '' then raise exception 'invalid:tracking'; end if;
  select * into o from orders where id = p_order;
  if not found then raise exception 'not_found'; end if;
  update orders set courier_ref = nullif(trim(coalesce(p_ref, '')), ''), courier_tracking = left(trim(p_tracking), 64), courier_sent_at = coalesce(courier_sent_at, now())
   where id = p_order;
  if o.status in ('received', 'contacting', 'confirmed') then
    perform set_config('fb.status_note', 'أُرسل إلى ZR Express: ' || left(trim(p_tracking), 64), true);
    update orders set status = 'preparing' where id = p_order;
  end if;
  perform courier_apply(p_order, coalesce(p_state, ''), coalesce(p_label, ''));
end;
$$;
grant execute on function courier_link(bigint, text, text, text, text) to authenticated;

-- owner: forget the link (the parcel was deleted at ZR, or linked to the wrong order)
create or replace function courier_unlink(p_order bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  update orders set courier_ref = null, courier_tracking = null, courier_state = null, courier_label = null, courier_stage = null,
    courier_at = null, courier_sent_at = null, courier_checked_at = null where id = p_order;
end;
$$;
grant execute on function courier_unlink(bigint) to authenticated;

-- status checks: read the answers that arrived, then ask about parcels still on their way.
-- Run every 30 minutes by pg_cron when it is on, and each time the owner opens the orders.
create or replace function courier_sync_run() returns jsonb
language plpgsql security definer set search_path = public as $$
declare c courier_settings; r record; b jsonb; colis jsonb; st text; lb text; read int := 0; asked int := 0;
begin
  select * into c from courier_settings where id = 1;
  if not c.enabled or c.api_key = '' or c.tenant = '' or not courier_has_net() then
    return jsonb_build_object('read', 0, 'asked', 0, 'off', true);
  end if;
  for r in execute 'select k.id, k.order_id, h.status_code, h.content from courier_calls k join net._http_response h on h.id = k.id where k.kind = ''sync''' loop
    begin
      if r.status_code between 200 and 299 then
        b := r.content::jsonb;
        if c.provider = 'zr' then
          st := coalesce(b->'state'->>'name', ''); lb := coalesce(b->'state'->>'description', b->'situation'->>'description', '');
        else
          colis := coalesce(b->'Colis'->0, b);
          st := coalesce(colis->>'Situation', colis->>'Statut', colis->>'Etat', colis->>'situation', ''); lb := st;
        end if;
        if st <> '' or lb <> '' then perform courier_apply(r.order_id, st, lb); read := read + 1; end if;
      end if;
    exception when others then raise warning 'courier answer % not read: %', r.id, sqlerrm;
    end;
    delete from courier_calls where id = r.id;
  end loop;
  delete from courier_calls where created_at < now() - interval '1 day';
  for r in select id, courier_ref, courier_tracking from orders
            where courier_tracking is not null and status not in ('delivered', 'cancelled', 'failed')
              and coalesce(courier_stage, '') not in ('delivered', 'cancelled')
              and (courier_checked_at is null or courier_checked_at < now() - interval '20 minutes')
              and not exists (select 1 from courier_calls k where k.order_id = orders.id and k.kind = 'sync')
            order by courier_checked_at nulls first limit 40 loop
    if c.provider = 'zr' then
      perform courier_request('GET', '/parcels/' || coalesce(r.courier_ref, r.courier_tracking), null, r.id, 'sync');
    else
      perform courier_request('POST', '/lire', jsonb_build_object('Colis', jsonb_build_array(jsonb_build_object('Tracking', r.courier_tracking))), r.id, 'sync');
    end if;
    asked := asked + 1;
  end loop;
  return jsonb_build_object('read', read, 'asked', asked);
end;
$$;
revoke all on function courier_sync_run() from public, anon, authenticated;

create or replace function courier_sync() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return courier_sync_run();
end;
$$;
grant execute on function courier_sync() to authenticated;

-- every 30 minutes, when pg_cron is available (Supabase: Database > Extensions > pg_cron). Without it, statuses update
-- whenever the owner opens the orders.
do $$ begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'fb34-courier-sync';
  perform cron.schedule('fb34-courier-sync', '*/30 * * * *', 'select public.courier_sync_run()');
exception when others then raise notice 'pg_cron not available: ZR statuses update when the owner opens the orders';
end $$;

-- =====================================================================
-- tracking: the tracking code and the order's phone number must both match.
-- A wrong pair returns null, the same answer whether or not the code exists.
-- =====================================================================
create or replace function track_order(p_code text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where tracking_code = upper(trim(coalesce(p_code, ''))) and phone = norm_phone(p_phone);
  if not found then
    perform pg_sleep(0.4);  -- slows down guessing
    return null;
  end if;
  return jsonb_build_object(
    'order_number', o.order_number, 'tracking_code', o.tracking_code, 'status', o.status,
    'created_at', o.created_at, 'updated_at', o.updated_at,
    'delivery', o.delivery, 'wilaya_name', o.wilaya_name, 'commune_name', o.commune_name,
    'subtotal', o.subtotal, 'shipping', o.shipping, 'shipping_pending', o.shipping_pending, 'total', o.total,
    'history', coalesce((select jsonb_agg(jsonb_build_object('status', h.status, 'at', h.created_at) order by h.created_at, h.id)
                           from order_status_history h where h.order_id = o.id), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('product_id', i.product_id, 'name', i.name, 'size', i.size, 'color', i.color, 'qty', i.qty) order by i.id)
                         from order_items i where i.order_id = o.id), '[]'::jsonb),
    'reviewed', exists (select 1 from reviews r where r.order_id = o.id),
    'courier', case when o.courier_tracking is null then null else jsonb_build_object('name', 'ZR Express', 'tracking', o.courier_tracking,
      'stage', o.courier_stage, 'label', o.courier_label, 'at', o.courier_at) end);
end;
$$;
grant execute on function track_order(text, text) to anon, authenticated;

-- =====================================================================
-- product photos
-- =====================================================================
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

-- =====================================================================
-- owner account
-- After creating the owner user (Authentication > Users > Add user), run this with the owner's email:
-- insert into admins (user_id) select id from auth.users where email = 'owner@example.com';
-- =====================================================================
