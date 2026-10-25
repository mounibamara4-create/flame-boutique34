#!/bin/bash
# Runs schema.sql on a throwaway local PostgreSQL: a fresh install with the behaviour tests, and an upgrade from version 1.
set -e
D=$(cd "$(dirname "$0")" && pwd)
P=$D/../../supabase
BIN=/usr/lib/postgresql/16/bin
C=/var/tmp/fbpg; mkdir -p $C && chown postgres $C
if [ ! -d $C/cluster ]; then

  su postgres -c "$BIN/initdb -D $C/cluster -A trust" >/dev/null
fi
su postgres -c "$BIN/pg_ctl -D $C/cluster -o '-p 5433 -k /tmp' -l $C/log.txt start" >/dev/null 2>&1 || true
sleep 2
export PGOPTIONS="-c client_min_messages=warning"
TESTOPTS="-c client_min_messages=notice"
PSQL="psql -h /tmp -p 5433 -U postgres -v ON_ERROR_STOP=1 -q"
for db in fresh upgrade; do $PSQL -d postgres -c "drop database if exists $db" -c "create database $db"; done

echo "== fresh install =="
$PSQL -d fresh -f $D/stubs.sql
$PSQL -d fresh -f $P/schema.sql
$PSQL -d fresh -f $P/locations.sql
$PSQL -d fresh -f $P/schema.sql   # running it twice must work
$PSQL -d fresh -c "select 'wilayas ' || count(*) from wilayas" -c "select 'communes ' || count(*) from communes" -At
PGOPTIONS="$TESTOPTS" psql -h /tmp -p 5433 -U postgres -d fresh -f $D/tests.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //' | grep -E 'PASS|FAIL|ERROR'

echo "== upgrade from version 1 =="
$PSQL -d upgrade -f $D/stubs.sql
$PSQL -d upgrade -f $D/schema_v1.sql
$PSQL -d upgrade -c "insert into orders (code, status, customer_name, phone, wilaya_code, wilaya_name, commune, delivery, items, subtotal, shipping, total)
  values ('FB34-OLD1', 'shipped', 'أمينة', '0555123456', 34, 'برج بوعريريج', 'مجانة', 'home',
  '[{\"id\":\"atlas\",\"name\":{\"ar\":\"عباية\"},\"size\":\"M\",\"color\":{\"ar\":\"أسود\"},\"qty\":1,\"price\":8900,\"cost\":4900}]', 8900, 400, 9300)"
$PSQL -d upgrade -f $P/schema.sql
$PSQL -d upgrade -f $P/locations.sql
$PSQL -d upgrade -At -c "select case when status='handed_to_carrier' and order_number='FB-00001' and first_name='أمينة' then 'PASS v1 order kept, status mapped, number assigned' else 'FAIL v1 order ' || row_to_json(orders)::text end from orders" \
  -c "select case when count(*)=1 and min(unit_price)=8900 then 'PASS v1 items moved to order_items' else 'FAIL v1 items' end from order_items"

echo "== one-file setup (supabase/setup.sql) and owner.sql =="
$PSQL -d postgres -c "drop database if exists onefile" -c "create database onefile"
$PSQL -d onefile -f $D/stubs.sql
$PSQL -d onefile -At -f $P/setup.sql | tail -14
sed "s/ضع-بريد-المالك-هنا@gmail.com/OWNER@example.com/" $P/owner.sql | $PSQL -d onefile -At

echo "== strict project: no default table permissions =="
$PSQL -d postgres -c "drop database if exists strict" -c "create database strict"
grep -v "default privileges" $D/stubs.sql | $PSQL -d strict
$PSQL -d strict -f $P/setup.sql > /dev/null
PGOPTIONS="$TESTOPTS" psql -h /tmp -p 5433 -U postgres -d strict -f $D/tests.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //' | grep -E 'FAIL|ERROR' || echo "PASS all behaviour tests also pass without default permissions"
