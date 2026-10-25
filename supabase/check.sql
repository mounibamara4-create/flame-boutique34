-- Run after schema.sql and locations.sql (SQL Editor > New query > Run).
-- Every line should say OK. A line that says MISSING names what to fix.
select check_name, case when ok then 'OK' else 'MISSING' end as result from (values
  ('69 wilayas',                       (select count(*) = 69   from wilayas)),
  ('1541 communes',                    (select count(*) = 1541 from communes)),
  ('9 order statuses',                 (select count(*) = 9    from order_statuses)),
  ('place_order function',             exists (select 1 from pg_proc where proname = 'place_order')),
  ('track_order function',             exists (select 1 from pg_proc where proname = 'track_order')),
  ('submit_review function',           exists (select 1 from pg_proc where proname = 'submit_review')),
  ('reviews protected (RLS on)',       (select relrowsecurity from pg_class where oid = 'public.reviews'::regclass)),
  ('set_order_status function',        exists (select 1 from pg_proc where proname = 'set_order_status')),
  ('orders protected (RLS on)',        (select relrowsecurity from pg_class where oid = 'public.orders'::regclass)),
  ('order_items protected (RLS on)',   (select relrowsecurity from pg_class where oid = 'public.order_items'::regclass)),
  ('product_costs protected (RLS on)', (select relrowsecurity from pg_class where oid = 'public.product_costs'::regclass)),
  ('fake-order checks (blocked numbers)', exists (select 1 from information_schema.tables where table_name = 'blocked_phones')),
  ('Telegram messages possible (pg_net)', exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'net' and p.proname = 'http_post')),
  ('ZR Express link (keys protected)', exists (select 1 from pg_proc where proname = 'courier_call') and (select relrowsecurity from pg_class where oid = 'public.courier_settings'::regclass)),
  ('product photos bucket',            exists (select 1 from storage.buckets where id = 'products')),
  ('owner account linked (admins)',    (select count(*) >= 1 from admins))
) as t(check_name, ok);
