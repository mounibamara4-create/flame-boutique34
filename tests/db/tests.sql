-- Behaviour tests for schema.sql. Each block prints PASS or FAIL lines.
\set QUIET on
\pset tuples_only on
\pset format unaligned
insert into admins values ('11111111-1111-1111-1111-111111111111') on conflict do nothing;

-- catalog + rates prepared by the owner
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into products (id, name, category, price, colors, sizes, stock)
values ('atlas', '{"ar":"عباية الأطلس","fr":"Abaya Atlas"}', 'abaya', 8900, '[{"ar":"أسود","fr":"Noir","hex":"#000"}]', '["S","M"]', '{"S":1,"M":5}'),
       ('khimar', '{"ar":"خمار","fr":"Khimar"}', 'hijab', 2500, '[{"ar":"وردي","fr":"Rose","hex":"#c99"},{"ar":"أسود","fr":"Noir","hex":"#000"}]', '["TU"]', null);
insert into product_costs values ('atlas', 4900), ('khimar', 1100);
insert into shipping_rates (wilaya_code, scope, home_price, desk_price, home_available, desk_available) values (34, 0, 400, 250, true, true), (19, 0, 600, null, true, false);
-- commune-level override inside wilaya 34: Medjana (id from data) costs 500 at home
insert into shipping_rates (wilaya_code, scope, home_price, desk_price) select 34, id, 500, 300 from communes where wilaya_code = 34 and name_fr = 'Medjana';
reset role;

-- everything below runs as an anonymous visitor
set role anon;
select set_config('request.jwt.claim.sub', '', false);

create temp table r (name text, res jsonb, err text);
grant all on r to anon, authenticated;
create or replace function pg_temp.try(n text, p jsonb) returns void language plpgsql as $$
begin
  insert into r select n, place_order(p), null;
exception when others then insert into r values (n, null, sqlerrm);
end $$;

select pg_temp.try('ok_home', jsonb_build_object('idempotency_key','aaaaaaaa-0000-4000-8000-000000000001','first_name','أمينة','last_name','بن علي',
  'phone','0555 12 34 56','wilaya',34,'commune_id',(select id from communes where wilaya_code=34 and name_fr='Medjana'),'delivery','home','address','حي 500 مسكن',
  'items',jsonb_build_array(jsonb_build_object('id','atlas','size','M','color',0,'qty',2), jsonb_build_object('id','khimar','size','TU','color',1,'qty',1))));
select pg_temp.try('repeat_same_key', jsonb_build_object('idempotency_key','aaaaaaaa-0000-4000-8000-000000000001','first_name','x','last_name','y','phone','0555123456','wilaya',34,'delivery','home','items','[]'::jsonb));
select pg_temp.try('bad_phone', jsonb_build_object('idempotency_key',gen_random_uuid(),'first_name','أمينة','last_name','بن علي','phone','0255123456','wilaya',34,'delivery','desk','items','[{"id":"khimar","size":"TU","qty":1}]'::jsonb));
select pg_temp.try('commune_of_other_wilaya', jsonb_build_object('idempotency_key',gen_random_uuid(),'first_name','أمينة','last_name','بن علي','phone','0555123457','wilaya',34,
  'commune_id',(select id from communes where wilaya_code=16 limit 1),'delivery','desk','items','[{"id":"khimar","size":"TU","qty":1}]'::jsonb));
select pg_temp.try('desk_not_offered', jsonb_build_object('idempotency_key',gen_random_uuid(),'first_name','سارة','last_name','مرابط','phone','0661000000','wilaya',19,
  'commune_id',(select id from communes where wilaya_code=19 limit 1),'delivery','desk','items','[{"id":"khimar","size":"TU","qty":1}]'::jsonb));
select pg_temp.try('home_without_address', jsonb_build_object('idempotency_key',gen_random_uuid(),'first_name','سارة','last_name','مرابط','phone','0661000000','wilaya',19,
  'commune_id',(select id from communes where wilaya_code=19 limit 1),'delivery','home','items','[{"id":"khimar","size":"TU","qty":1}]'::jsonb));
select pg_temp.try('out_of_stock', jsonb_build_object('idempotency_key',gen_random_uuid(),'first_name','سارة','last_name','مرابط','phone','0661000000','wilaya',34,
  'commune_id',(select id from communes where wilaya_code=34 limit 1),'delivery','desk','items','[{"id":"atlas","size":"S","qty":2}]'::jsonb));
select pg_temp.try('price_needs_confirmation', jsonb_build_object('idempotency_key',gen_random_uuid(),'first_name','هاجر','last_name','طالبي','phone','0770000000','wilaya',16,
  'commune_id',(select id from communes where wilaya_code=16 limit 1),'delivery','desk','items','[{"id":"atlas","size":"S","qty":1}]'::jsonb));
select pg_temp.try('new_wilaya_typed_commune', jsonb_build_object('idempotency_key',gen_random_uuid(),'first_name','ريم','last_name','قاسمي','phone','0550000001','wilaya',60,
  'commune_name','بريكة','delivery','desk','items','[{"id":"khimar","size":"TU","qty":1}]'::jsonb));
select pg_temp.try('client_price_ignored', jsonb_build_object('idempotency_key',gen_random_uuid(),'first_name','ريم','last_name','قاسمي','phone','0550000002','wilaya',34,
  'commune_id',(select id from communes where wilaya_code=34 limit 1),'delivery','desk','items','[{"id":"khimar","size":"TU","qty":1,"price":1}]'::jsonb));

select case when (select res->>'total' from r where name='ok_home') = '20800' and (select res->>'shipping' from r where name='ok_home') = '500'
  then 'PASS server prices + commune override (2x8900 + 2500 + 500 = 20800)' else 'FAIL ok_home ' || (select coalesce(res::text, err) from r where name='ok_home') end;
select case when (select res->>'tracking_code' from r where name='ok_home') ~ '^FLM-[A-HJ-NP-Z2-9]{8}$' then 'PASS tracking code format ' || (select res->>'tracking_code' from r where name='ok_home') else 'FAIL tracking format' end;
select case when (select res->>'tracking_code' from r where name='repeat_same_key') = (select res->>'tracking_code' from r where name='ok_home')
  and (select res->>'repeat' from r where name='repeat_same_key') = 'true' then 'PASS same idempotency key returns the same order' else 'FAIL idempotency ' || (select coalesce(res::text, err) from r where name='repeat_same_key') end;
select case when err = 'invalid:phone' then 'PASS bad phone rejected' else 'FAIL bad phone ' || coalesce(err, res::text) end from r where name='bad_phone';
select case when err = 'invalid:commune' then 'PASS commune must belong to the wilaya' else 'FAIL commune ' || coalesce(err, res::text) end from r where name='commune_of_other_wilaya';
select case when err = 'invalid:delivery' then 'PASS unavailable desk delivery rejected' else 'FAIL desk ' || coalesce(err, res::text) end from r where name='desk_not_offered';
select case when err = 'invalid:address' then 'PASS home delivery needs an address' else 'FAIL address ' || coalesce(err, res::text) end from r where name='home_without_address';
select case when err = 'out_of_stock:atlas' then 'PASS stock enforced' else 'FAIL stock ' || coalesce(err, res::text) end from r where name='out_of_stock';
select case when res->>'shipping_pending' = 'true' and res->>'shipping' is null and res->>'total' = '8900' then 'PASS no rate -> price needs confirmation, nothing invented' else 'FAIL pending ' || coalesce(err, res::text) end from r where name='price_needs_confirmation';
select case when res is not null then 'PASS new wilaya without commune list accepts typed commune' else 'FAIL new wilaya ' || err end from r where name='new_wilaya_typed_commune';
select case when res->>'subtotal' = '2500' then 'PASS price sent by the browser is ignored' else 'FAIL client price ' || coalesce(err, res::text) end from r where name='client_price_ignored';

-- privacy: visitors cannot read or change orders, costs, or prices
-- either no rows (row rules) or no access at all (no table permission): both keep the data private
do $$ declare n int := 0; begin
  begin n := n + (select count(*) from orders); exception when insufficient_privilege then null; end;
  begin n := n + (select count(*) from order_items); exception when insufficient_privilege then null; end;
  begin n := n + (select count(*) from product_costs); exception when insufficient_privilege then null; end;
  raise notice '%', case when n = 0 then 'PASS visitor sees no orders, items or costs' else 'FAIL visitor can read private tables' end;
end $$;
do $$ begin
  update orders set status = 'delivered';
  raise notice '%', case when found then 'FAIL visitor updated an order' else 'PASS visitor cannot change an order' end;
exception when insufficient_privilege then raise notice 'PASS visitor cannot change an order';
end $$;
do $$ begin
  insert into shipping_rates (wilaya_code, scope, home_price) values (1, 0, 1);
  raise notice 'FAIL visitor wrote a delivery price';
exception when others then raise notice 'PASS visitor cannot write delivery prices';
end $$;
do $$ begin
  perform set_order_status(1, 'delivered', '');
  raise notice 'FAIL visitor changed a status';
exception when others then raise notice 'PASS visitor cannot change a status (%)', sqlerrm;
end $$;

-- tracking
select case when track_order((select res->>'tracking_code' from r where name='ok_home'), '+213 555 12 34 56')->>'status' = 'received'
  then 'PASS tracking with code + phone' else 'FAIL tracking' end;
select case when track_order((select res->>'tracking_code' from r where name='ok_home'), '0666666666') is null
  and track_order('FLM-AAAAAAAA', '0555123456') is null then 'PASS wrong phone or code gives the same empty answer' else 'FAIL tracking leak' end;
select case when (track_order((select res->>'tracking_code' from r where name='ok_home'), '0555123456') ? 'phone') = false
  then 'PASS tracking answer has no phone or address' else 'FAIL tracking exposes contact data' end;
reset role;

-- owner changes the status: history grows, stock comes back on cancel
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select set_order_status((select id from orders where tracking_code = (select res->>'tracking_code' from r where name='ok_home')), 'confirmed', 'اتصلنا بالزبونة');
select case when (select stock->>'M' from products where id='atlas') = '3' then 'PASS stock taken by the order (5 - 2 = 3)' else 'FAIL stock after order' end;
select set_order_status((select id from orders where tracking_code = (select res->>'tracking_code' from r where name='ok_home')), 'cancelled', '');
select case when (select stock->>'M' from products where id='atlas') = '5' then 'PASS cancel puts pieces back (3 + 2 = 5)' else 'FAIL restock ' || (select stock::text from products where id='atlas') end;
select case when (select string_agg(status, ',' order by id) from order_status_history where order_id = (select id from orders where tracking_code = (select res->>'tracking_code' from r where name='ok_home')))
  = 'received,confirmed,cancelled' then 'PASS status history recorded' else 'FAIL history' end;
select case when (select note from order_status_history where status='confirmed' limit 1) = 'اتصلنا بالزبونة' then 'PASS status note saved' else 'FAIL note' end;
update orders set shipping = 450 where wilaya_code = 16;
select case when (select total from orders where wilaya_code = 16) = 8900 + 450 and (select shipping_pending from orders where wilaya_code = 16) = false
  then 'PASS owner confirms a delivery price, total follows' else 'FAIL pending price update' end;
reset role;
select case when (select count(*) from orders) = 4 then 'PASS exactly 4 orders saved (no duplicates, failed attempts saved nothing)' else 'FAIL order count ' || (select count(*) from orders) end;


-- reviews: only a delivered order, once, pending until the owner approves; visitors see approved ones only
create temp table rv (name text, err text);
grant all on rv to anon, authenticated;
create or replace function pg_temp.rev(n text, code text, phone text, prod text, rating int) returns void language plpgsql as $$
begin
  perform submit_review(code, phone, prod, rating, 'قماش رائع والمقاس مضبوط', '');
  insert into rv values (n, null);
exception when others then insert into rv values (n, sqlerrm);
end $$;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.rev('not_delivered', (select res->>'tracking_code' from r where name='price_needs_confirmation'), '0770000000', 'atlas', 5);
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select set_order_status((select id from orders where wilaya_code = 16), 'delivered', '');
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.rev('wrong_phone', (select res->>'tracking_code' from r where name='price_needs_confirmation'), '0661000000', 'atlas', 5);
select pg_temp.rev('product_not_in_order', (select res->>'tracking_code' from r where name='price_needs_confirmation'), '0770000000', 'khimar', 5);
select pg_temp.rev('bad_rating', (select res->>'tracking_code' from r where name='price_needs_confirmation'), '0770000000', 'atlas', 6);
select pg_temp.rev('ok', (select res->>'tracking_code' from r where name='price_needs_confirmation'), '0770000000', 'atlas', 5);
select pg_temp.rev('twice', (select res->>'tracking_code' from r where name='price_needs_confirmation'), '0770000000', 'atlas', 4);
select case when (select err from rv where name='not_delivered') = 'not_delivered' then 'PASS review needs a delivered order' else 'FAIL review before delivery ' || coalesce((select err from rv where name='not_delivered'),'accepted') end;
select case when (select err from rv where name='wrong_phone') = 'not_found' then 'PASS review needs the order phone' else 'FAIL review phone' end;
select case when (select err from rv where name='product_not_in_order') = 'invalid:product' then 'PASS review only for a piece of the order' else 'FAIL review product' end;
select case when (select err from rv where name='bad_rating') = 'invalid:rating' then 'PASS rating 1 to 5' else 'FAIL rating' end;
select case when (select err from rv where name='ok') is null and (select err from rv where name='twice') = 'already_reviewed' then 'PASS one review per order' else 'FAIL review once ' || coalesce((select err from rv where name='ok'),'') end;
select case when (select count(*) from reviews) = 0 then 'PASS pending review is not public' else 'FAIL pending review visible' end;
select case when track_order((select res->>'tracking_code' from r where name='price_needs_confirmation'), '0770000000')->>'reviewed' = 'true'
  and track_order((select res->>'tracking_code' from r where name='price_needs_confirmation'), '0770000000')->'items'->0->>'product_id' = 'atlas'
  then 'PASS tracking says the order was reviewed' else 'FAIL tracking reviewed flag' end;
do $$ begin
  insert into reviews (name, rating, body, status) values ('مزيف', 5, 'x', 'approved');
  raise notice 'FAIL visitor wrote a review directly';
exception when others then raise notice 'PASS visitor cannot write reviews directly';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
update reviews set status = 'approved';
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select case when (select count(*) from (select id, name, rating, verified, wilaya_name from reviews) x) = 1
  and (select verified from reviews limit 1) and (select name from reviews limit 1) = 'هاجر ط.' then 'PASS approved review public, verified, short name' else 'FAIL approved review' end;
do $$ begin
  perform order_id from reviews;
  raise notice 'FAIL visitor can see which order a review came from';
exception when others then raise notice 'PASS review order link stays private';
end $$;
reset role;

-- fake orders
reset role;
delete from net.sent;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
create temp table fk (name text, err text);
grant all on fk to anon, authenticated;
create or replace function pg_temp.order_as(n text, phone text, extra jsonb default '{}') returns void language plpgsql as $$
begin
  perform place_order(jsonb_build_object('idempotency_key',gen_random_uuid(),'first_name','نسرين','last_name','بوزيد','phone',phone,'wilaya',34,
    'commune_id',(select id from communes where wilaya_code=34 limit 1),'delivery','desk','items','[{"id":"khimar","size":"TU","qty":1}]'::jsonb) || extra);
  insert into fk values (n, null);
exception when others then insert into fk values (n, sqlerrm);
end $$;
select pg_temp.order_as('robot', '0661111111', '{"hp":"http://spam"}');
select pg_temp.order_as('first', '0661111111');
select pg_temp.order_as('again_at_once', '0661111111');
select case when (select err from fk where name='robot') = 'invalid:request' then 'PASS hidden field filled (robot): refused' else 'FAIL honeypot ' || coalesce((select err from fk where name='robot'),'accepted') end;
select case when (select err from fk where name='first') is null and (select err from fk where name='again_at_once') = 'limit:wait' then 'PASS same number again within a minute: refused' else 'FAIL cooldown ' || coalesce((select err from fk where name='again_at_once'),'accepted') end;
reset role;
-- three orders still waiting for the call: a fourth is refused
update orders set created_at = created_at - interval '2 minutes' where phone = '0661111111';
insert into orders (phone, wilaya_code, delivery, subtotal, total, status, first_name, last_name) values ('0661111111', 34, 'desk', 1, 1, 'received', 'x', 'y'), ('0661111111', 34, 'desk', 1, 1, 'contacting', 'x', 'y');
set role anon;
select pg_temp.order_as('fourth_open', '0661111111');
select case when (select err from fk where name='fourth_open') = 'limit:open' then 'PASS 3 orders waiting for confirmation: a 4th is refused' else 'FAIL open limit ' || coalesce((select err from fk where name='fourth_open'),'accepted') end;
-- many orders from one network within an hour
select set_config('request.headers', '{"x-forwarded-for": "41.200.10.20, 10.0.0.1"}', false);
select pg_temp.order_as('net' || g, '06620000' || lpad(g::text, 2, '0')) from generate_series(1, 7) g;
select case when (select count(*) from fk where name like 'net%' and err is null) = 6 and (select err from fk where name='net7') = 'limit:ip'
  then 'PASS 6 orders an hour from one network, the 7th refused' else 'FAIL network limit ' || (select string_agg(coalesce(err,'ok'), ',') from fk where name like 'net%') end;
select set_config('request.headers', '', false);
reset role;
select case when not exists (select 1 from orders where ip_hash like '%41.200%') and exists (select 1 from orders where ip_hash = md5('fb34:41.200.10.20'))
  then 'PASS network kept only as a fingerprint, never the address' else 'FAIL ip stored' end;
-- the owner blocks a number
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select block_phone('+213 663 33 33 33', 'طلبات وهمية');
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.order_as('blocked', '0663333333');
select case when (select err from fk where name='blocked') = 'blocked' then 'PASS blocked number refused' else 'FAIL blocked ' || coalesce((select err from fk where name='blocked'),'accepted') end;
do $$ begin
  perform block_phone('0555555555', '');
  raise notice 'FAIL visitor blocked a number';
exception when others then raise notice 'PASS visitor cannot block numbers';
end $$;
do $$ declare n int; begin
  select count(*) into n from blocked_phones;
  raise notice '%', case when n = 0 then 'PASS visitor cannot read blocked numbers (no rows)' else 'FAIL visitor reads blocked numbers' end;
exception when insufficient_privilege then raise notice 'PASS visitor cannot read blocked numbers (no access)';
end $$;

-- Telegram: off by default, then on
reset role;
select case when (select count(*) from net.sent) = 0 then 'PASS notifications off by default: nothing sent' else 'FAIL sent while off' end;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select notify_save('123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw1', '987654321', true);
select case when (notify_get()->>'has_token') = 'true' and notify_get()->>'chat' = '987654321' and not (notify_get() ? 'token') and not (notify_get()::text like '%AAHdq%')
  then 'PASS owner settings saved; the token is never sent back' else 'FAIL notify_get ' || notify_get()::text end;
do $$ begin
  perform notify_save('not-a-token', '1', true);
  raise notice 'FAIL bad token accepted';
exception when others then raise notice 'PASS malformed bot token refused';
end $$;
select case when (notify_result(notify_test())->>'status') = '200' then 'PASS test message sent, Telegram answer read back' else 'FAIL test message' end;
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.order_as('notified', '0664444444');
do $$ declare n int; begin
  select count(*) into n from notify_settings;
  raise notice '%', case when n = 0 then 'PASS visitor cannot read the bot token (no rows)' else 'FAIL visitor reads the bot token' end;
exception when insufficient_privilege then raise notice 'PASS visitor cannot read the bot token (no access)';
end $$;
do $$ begin
  perform notify_get();
  raise notice 'FAIL visitor reads notification settings';
exception when others then raise notice 'PASS visitor cannot read notification settings';
end $$;
reset role;
select case when (select count(*) from net.sent where body->>'text' like '🛍️ طلب جديد FB-%') = 1
  and (select body->>'text' from net.sent order by id desc limit 1) like '%0664444444%'
  and (select body->>'text' from net.sent order by id desc limit 1) like '%خمار%'
  and (select url from net.sent order by id desc limit 1) = 'https://api.telegram.org/bot123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw1/sendMessage'
  and (select body->>'chat_id' from net.sent order by id desc limit 1) = '987654321'
  then 'PASS new order: Telegram message with number, phone and pieces' else 'FAIL telegram message ' || coalesce((select body::text from net.sent order by id desc limit 1),'none') end;
-- a failing Telegram call never loses the order
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language plpgsql as $$ begin raise exception 'network down'; end $$;
set role anon;
select pg_temp.order_as('net_down', '0665555555');
reset role;
select case when (select err from fk where name='net_down') is null and exists (select 1 from orders where phone='0665555555') then 'PASS Telegram down: the order is still saved' else 'FAIL order lost when Telegram fails ' || coalesce((select err from fk where name='net_down'),'') end;

-- =====================================================================
-- ZR Express: keys stay in the database, only ZR addresses on a short list, statuses follow ZR's
-- =====================================================================
-- a fake ZR: answers chosen by address, every request recorded with its method and headers
alter table net.sent add column if not exists method text;
alter table net.sent add column if not exists headers jsonb;
create table if not exists net.fake (pattern text primary key, status int not null default 200, reply text not null);
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language plpgsql as $$ declare i bigint; f record; begin
  insert into net.sent (url, body, method, headers) values (url, body, 'POST', headers) returning id into i;
  select * into f from net.fake where url like pattern order by length(pattern) desc limit 1;
  insert into net._http_response values (i, coalesce(f.status, 200), null, false, coalesce(f.reply, '{"ok":true}'));
  return i; end $$;
create or replace function net.http_get(url text, params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language plpgsql as $$ declare i bigint; f record; begin
  insert into net.sent (url, body, method, headers) values (url, null, 'GET', headers) returning id into i;
  select * into f from net.fake where url like pattern order by length(pattern) desc limit 1;
  insert into net._http_response values (i, coalesce(f.status, 200), null, false, coalesce(f.reply, '{"ok":true}'));
  return i; end $$;
grant all on net.fake, net.sent, net._http_response to anon, authenticated;

select case when courier_stage('livre') = 'delivered' and courier_stage('Livrée') = 'delivered' and courier_stage('Delivered') = 'delivered'
  and courier_stage('en_livraison') = 'out' and courier_stage('Sortie en livraison') = 'out' and courier_stage('retour_expediteur') = 'returned'
  and courier_stage('commande_recue') = 'created' and courier_stage('OrderReceived') = 'created' and courier_stage('en transit') = 'transit'
  and courier_stage('confirme_au_bureau') = 'desk' and courier_stage('Tentative échouée') = 'attempt' and courier_stage('Annulé') = 'cancelled'
  and courier_stage('quelque chose') = 'other' and courier_stage('') = 'other'
  then 'PASS ZR state names understood (French/English, accents, unknown ones left alone)' else 'FAIL courier_stage' end;

set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin perform courier_get(); raise notice 'FAIL visitor reads ZR settings';
exception when others then raise notice 'PASS visitor cannot read ZR settings'; end $$;
do $$ begin perform courier_call('POST', '/parcels', '{}'::jsonb, null); raise notice 'FAIL visitor sends to ZR';
exception when others then raise notice 'PASS visitor cannot send anything to ZR'; end $$;
do $$ declare n int; begin select count(*) into n from courier_settings;
  raise notice '%', case when n = 0 then 'PASS visitor cannot read the ZR keys (no rows)' else 'FAIL visitor reads the ZR keys' end;
exception when insufficient_privilege then raise notice 'PASS visitor cannot read the ZR keys (no access)'; end $$;
do $$ begin perform courier_sync_run(); raise notice 'FAIL visitor runs the ZR sync';
exception when others then raise notice 'PASS visitor cannot run the ZR sync directly'; end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$ begin perform courier_call('POST', '/parcels', '{}'::jsonb, null); raise notice 'FAIL sent without keys';
exception when others then raise notice '%', case when sqlerrm = 'courier:keys' then 'PASS no keys yet: nothing sent, a clear error' else 'FAIL no-keys error ' || sqlerrm end; end $$;
do $$ begin perform courier_save('zr', 'abc123456789', 'not-a-uuid', true); raise notice 'FAIL bad tenant accepted';
exception when others then raise notice '%', case when sqlerrm = 'invalid:tenant' then 'PASS a tenant that is not a ZR tenant id is refused' else 'FAIL ' || sqlerrm end; end $$;
select courier_save('zr', 'zrkey_SECRET_1234567890', '0b5c3a4e-1d2f-4a6b-9c8d-7e6f5a4b3c2d', true);
select case when courier_get()->>'has_key' = 'true' and courier_get()->>'provider' = 'zr' and courier_get()::text not like '%SECRET%' and courier_get()::text not like '%0b5c3a4e%'
  then 'PASS ZR keys saved; never sent back to the browser' else 'FAIL courier_get ' || courier_get()::text end;
select courier_save('zr', '', '', true);
reset role;
select case when (select api_key from courier_settings) = 'zrkey_SECRET_1234567890' then 'PASS saving with empty fields keeps the saved keys' else 'FAIL keys lost' end;
set role authenticated;
do $$ begin perform courier_call('GET', '/parcels/../../users', null, null); raise notice 'FAIL odd ZR address accepted';
exception when others then raise notice '%', case when sqlerrm = 'courier:path' then 'PASS only ZR addresses on the list can be reached' else 'FAIL path ' || sqlerrm end; end $$;
do $$ begin perform courier_call('DELETE', '/parcels/abc', null, null); raise notice 'FAIL delete accepted';
exception when others then raise notice 'PASS deleting a parcel at ZR is not possible from the site'; end $$;
do $$ begin perform courier_call('GET', '/delivery-pricing/rates', null, null); raise notice 'PASS the owner''s ZR price list can be read';
exception when others then raise notice 'FAIL price list refused: %', sqlerrm; end $$;
do $$ begin perform courier_call('GET', '/delivery-pricing/price-lists/x', null, null); raise notice 'FAIL other pricing address accepted';
exception when others then raise notice 'PASS other ZR pricing addresses stay closed'; end $$;

insert into net.fake values ('https://api.zrexpress.app/api/v1/parcels', 201, '{"id":"5d0c2b1e-0000-4000-8000-000000000001"}') on conflict (pattern) do update set reply = excluded.reply, status = excluded.status;
select courier_call('POST', '/parcels', '{"amount":2750}'::jsonb, (select id from orders where phone = '0664444444')) as zr_rid \gset
select case when (courier_result(:zr_rid)->'body'->>'id') = '5d0c2b1e-0000-4000-8000-000000000001'
  and (select method from net.sent order by id desc limit 1) = 'POST'
  and (select url from net.sent order by id desc limit 1) = 'https://api.zrexpress.app/api/v1/parcels'
  and (select headers->>'X-Api-Key' from net.sent order by id desc limit 1) = 'zrkey_SECRET_1234567890'
  and (select headers->>'X-Tenant' from net.sent order by id desc limit 1) = '0b5c3a4e-1d2f-4a6b-9c8d-7e6f5a4b3c2d'
  then 'PASS parcel request goes to ZR with the keys added by the database, answer read back' else 'FAIL ZR call ' || coalesce((select row_to_json(s)::text from net.sent s order by id desc limit 1), '') end;

select courier_link((select id from orders where phone = '0664444444'), '5d0c2b1e-0000-4000-8000-000000000001', 'ZR-77231', 'commande_recue', 'Commande reçue');
select case when o.courier_tracking = 'ZR-77231' and o.status = 'preparing' and o.courier_stage = 'created'
  and exists (select 1 from order_status_history h where h.order_id = o.id and h.status = 'preparing' and h.note like 'أُرسل إلى ZR Express%')
  then 'PASS sent to ZR: tracking kept, order "preparing", noted in its history' else 'FAIL link ' || row_to_json(o)::text end from orders o where phone = '0664444444';

-- status checks: the parcel goes out for delivery, then is delivered
insert into net.fake values ('https://api.zrexpress.app/api/v1/parcels/5d0c2b1e%', 200, '{"id":"5d0c2b1e-0000-4000-8000-000000000001","trackingNumber":"ZR-77231","state":{"name":"en_livraison","description":"En cours de livraison"}}')
  on conflict (pattern) do update set reply = excluded.reply;
select case when (courier_sync()->>'asked') = '0' then 'PASS a parcel just checked is not asked about again for 20 minutes' else 'FAIL asked too soon' end;
update orders set courier_checked_at = null where phone = '0664444444';
select courier_sync(); select courier_sync();
select case when o.status = 'out_for_delivery' and o.courier_stage = 'out' and o.courier_label = 'En cours de livraison'
  and (select method || ' ' || url from net.sent order by id desc limit 1) = 'GET https://api.zrexpress.app/api/v1/parcels/5d0c2b1e-0000-4000-8000-000000000001'
  then 'PASS ZR says "out for delivery": the order follows' else 'FAIL sync out ' || row_to_json(o)::text end from orders o where phone = '0664444444';
select case when (track_order(o.tracking_code, o.phone)->'courier'->>'tracking') = 'ZR-77231' and (track_order(o.tracking_code, o.phone)->'courier'->>'stage') = 'out'
  and not (track_order(o.tracking_code, o.phone)::text like '%5d0c2b1e%')
  then 'PASS the customer sees ZR''s tracking number and stage (not ZR''s internal id)' else 'FAIL track courier' end from orders o where phone = '0664444444';
update net.fake set reply = '{"state":{"name":"retour_expediteur","description":"Retour expéditeur"}}' where pattern like 'https://api.zrexpress.app/api/v1/parcels/5d0c%';
update orders set courier_checked_at = null where phone = '0664444444';
select courier_sync(); select courier_sync();
select case when o.status = 'out_for_delivery' and o.courier_stage = 'returned'
  then 'PASS a returned parcel is shown, but the order is not cancelled on its own' else 'FAIL returned ' || row_to_json(o)::text end from orders o where phone = '0664444444';
update net.fake set reply = '{"state":{"name":"livre","description":"Livré"}}' where pattern like 'https://api.zrexpress.app/api/v1/parcels/5d0c%';
update orders set courier_checked_at = null where phone = '0664444444';
select courier_sync(); select courier_sync();
select case when o.status = 'delivered' and o.courier_stage = 'delivered' then 'PASS ZR says "delivered": the order is delivered' else 'FAIL delivered ' || row_to_json(o)::text end
  from orders o where phone = '0664444444';
select case when (courier_sync()->>'asked') = '0' then 'PASS delivered parcels are not asked about again' else 'FAIL still asking' end;

-- the former ZR platform (procolis): token and key headers, the parcel read by its tracking number
select courier_save('zr_old', 'oldkey_ABCDEFGH', 'oldtoken_12345678', true);
insert into net.fake values ('https://procolis.com/api_v1/lire', 200, '{"Colis":[{"Tracking":"FB-OLD-9","Situation":"En livraison"}]}') on conflict (pattern) do update set reply = excluded.reply;
update orders set status = 'preparing', courier_ref = null, courier_tracking = 'FB-OLD-9', courier_stage = null, courier_checked_at = null where id = (select min(id) from orders where phone = '0661111111' and status = 'received');
select courier_sync(); select courier_sync();
select case when exists (select 1 from orders where courier_tracking = 'FB-OLD-9' and status = 'out_for_delivery')
  and (select headers->>'token' from net.sent where url = 'https://procolis.com/api_v1/lire' order by id desc limit 1) = 'oldtoken_12345678'
  and (select headers->>'key' from net.sent where url = 'https://procolis.com/api_v1/lire' order by id desc limit 1) = 'oldkey_ABCDEFGH'
  and (select body->'Colis'->0->>'Tracking' from net.sent where url = 'https://procolis.com/api_v1/lire' order by id desc limit 1) = 'FB-OLD-9'
  then 'PASS former ZR platform: token/key headers, status read by tracking number' else 'FAIL zr_old ' || coalesce((select row_to_json(s)::text from net.sent s order by id desc limit 1), '') end;
select courier_save('zr', '', '', false);
select case when (courier_sync()->>'off') = 'true' then 'PASS ZR switched off: no requests' else 'FAIL sync while off' end;
reset role;
