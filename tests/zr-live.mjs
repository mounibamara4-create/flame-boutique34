// ZR Express in live mode, against a stand-in Supabase whose courier_call/courier_result answer like ZR's API.
// Checks what the dashboard sends to ZR (through the database), the cases where the owner must choose
// (commune or desk not matched for certain), a parcel already sent, ZR refusing the key, and that the keys
// never come back to the browser.
// Run: node tests/netlify-local.mjs &  then  node tests/zr-live.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8888/';
const SB = 'https://fbtest.supabase.co';
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m);
const calls = [], zr = [], links = [];
const courier = {provider: 'zr', enabled: true, key: '', tenant: ''};
let refuseKey = false;
const now = new Date().toISOString();
const mk = (id, extra) => ({id, order_number: 'FB-0000' + id, tracking_code: 'FLM-TEST000' + id, status: 'confirmed', created_at: now, updated_at: now,
  first_name: 'أمينة', last_name: 'بن علي', phone: '0555123456', phone2: null, wilaya_code: 34, wilaya_name: 'برج بوعريريج', commune_id: 1187, commune_name: 'مجانة',
  delivery: 'home', address: 'حي 500 مسكن', subtotal: 8900, shipping: 400, shipping_pending: false, total: 9300, cost_total: 0, admin_note: '', lang: 'ar',
  order_items: [{product_id: 'atlas', name: {ar: 'عباية الأطلس', fr: 'Abaya Atlas'}, size: 'M', color: {ar: 'أسود', fr: 'Noir'}, qty: 1, unit_price: 8900, unit_cost: 0}],
  order_status_history: [{status: 'confirmed', note: '', created_at: now}], ...extra});
const orders = [mk(7), mk(8, {delivery: 'desk', address: '', commune_id: 1190, commune_name: 'برج بوعريرج', phone: '0666000111', phone2: '0777000222', shipping: 250, total: 9150}), mk(9, {phone: '0555999888'})];
const communes = [{id: 1187, name_ar: 'مجانة', name_fr: 'Medjana'}, {id: 1190, name_ar: 'برج بوعريرج', name_fr: 'B. B. Arreridj'}];
const cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*'};

// ZR's side (what the database would get back from api.zrexpress.app)
function zrAnswer(method, path, body){
  if (refuseKey) return [401, ''];
  if (path === '/users/profile') return [200, {id: 'u', name: 'Flame Boutique34'}];
  if (path === '/delivery-pricing/rates') return [200, {rates: [
    {toTerritoryCode: 34, toTerritoryName: 'Bordj Bou Arreridj', toTerritoryLevel: 'wilaya', deliveryPrices: [{deliveryType: 'home', price: 400}, {deliveryType: 'pickup-point', price: 250}]},
    {toTerritoryCode: 16, toTerritoryName: 'Alger', toTerritoryLevel: 'wilaya', deliveryPrices: [{deliveryType: 'home', price: 650}, {deliveryType: 'pickup-point', price: 0}]},
    {toTerritoryName: 'Sétif', toTerritoryLevel: 'wilaya', deliveryPrices: [{deliveryType: 'home', price: 500}, {deliveryType: 'pickup-point', price: 300}]},
    {toTerritoryName: 'Medjana', toTerritoryLevel: 'commune', deliveryPrices: [{deliveryType: 'home', price: 300}]}]}];
  if (path === '/territories/search'){
    const f = Object.fromEntries((body.advancedFilter?.filters || []).map(x => [x.field, x.value]));
    if (f.level === 'wilaya') return [200, {items: [{id: 'w16', code: 16, name: 'Alger', level: 'wilaya'}, {id: 'w34', code: 34, name: 'Bordj Bou Arreridj', level: 'wilaya'}], hasNext: false}];
    if (f.level === 'commune' && f.parentId === 'w34') return [200, {items: [{id: 'c-medjana', name: 'Medjana', level: 'commune', parentId: 'w34'},
      {id: 'c-bba', name: 'Bordj Bou Arreridj', level: 'commune', parentId: 'w34'}, {id: 'c-ras', name: 'Ras El Oued', level: 'commune', parentId: 'w34'}], hasNext: false}];
    return [200, {items: [], hasNext: false}];
  }
  if (path === '/hubs/search') return [200, {items: [{id: 'h1', name: 'ZR BBA Centre', isPickupPoint: true, address: {cityTerritoryId: 'w34', street: 'Cité 1000'}},
    {id: 'h2', name: 'ZR BBA Ouest', isPickupPoint: true, address: {cityTerritoryId: 'w34', street: 'Route de Sétif'}}]}];
  if (path === '/parcels/search'){
    const ext = body.advancedFilter?.filters?.find(x => x.field === 'externalId')?.value;
    return [200, {items: ext === 'FB-00009' ? [{id: 'p-old', externalId: 'FB-00009', trackingNumber: 'ZR-OLD999', state: {name: 'commande_recue', description: 'Commande reçue'}}] : [], hasNext: false}];
  }
  if (path === '/parcels' && method === 'POST') return [201, {id: 'p-' + body.externalId}];
  if (path.startsWith('/parcels/p-')) return [200, {id: path.slice(9), trackingNumber: 'ZR-' + path.slice(-5), state: {name: 'commande_recue', description: 'Commande reçue'}}];
  return [404, {title: 'NotFound'}];
}
const pending = new Map(); let seq = 100;

async function handle(route){
  const req = route.request(), u = new URL(req.url()), path = u.pathname, accept = req.headers()['accept'] || '';
  if (req.method() === 'OPTIONS') return route.fulfill({status: 204, headers: cors});
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  calls.push({method: req.method(), path, body});
  const json = (data, status = 200) => route.fulfill({status, headers: {...cors, 'Content-Type': 'application/json'}, body: JSON.stringify(data)});
  const none = () => route.fulfill({status: 204, headers: cors});
  if (path === '/rest/v1/settings') return accept.includes('vnd.pgrst.object') ? json({data: {}}) : json([{data: {}}]);
  if (['/rest/v1/products', '/rest/v1/product_costs', '/rest/v1/shipping_rates', '/rest/v1/reviews', '/rest/v1/blocked_phones'].includes(path)) return json([]);
  if (path === '/rest/v1/communes') return json(u.searchParams.get('wilaya_code') === 'eq.34' ? communes : []);
  if (path === '/rest/v1/orders') return json(orders);
  if (path === '/rest/v1/rpc/is_admin') return json(true);
  if (path === '/rest/v1/rpc/notify_get') return json({enabled: false, chat: '', has_token: false, pg_net: true});
  if (path === '/rest/v1/rpc/courier_get') return json({provider: courier.provider, enabled: courier.enabled, has_key: !!courier.key, has_tenant: !!courier.tenant, pg_net: true, auto: true});
  if (path === '/rest/v1/rpc/courier_save'){ Object.assign(courier, {provider: body.p_provider, enabled: body.p_enabled}); if (body.p_key) courier.key = body.p_key; if (body.p_tenant) courier.tenant = body.p_tenant; return none(); }
  if (path === '/rest/v1/rpc/courier_call'){ const id = ++seq; zr.push({method: body.p_method, path: body.p_path, body: body.p_body, order: body.p_order}); pending.set(id, zrAnswer(body.p_method, body.p_path, body.p_body)); return json(id); }
  if (path === '/rest/v1/rpc/courier_result'){ const [status, b] = pending.get(body.p_id); return json({status, body: b, error: null, timed_out: false}); }
  if (path === '/rest/v1/rpc/courier_link'){ links.push(body); const o = orders.find(x => x.id === body.p_order); Object.assign(o, {courier_ref: body.p_ref, courier_tracking: body.p_tracking, courier_stage: 'created', courier_label: body.p_label, courier_at: now, status: 'preparing'}); return none(); }
  if (path === '/rest/v1/rpc/courier_sync') return json({read: 0, asked: 0});
  if (path === '/auth/v1/token') return json({access_token: 'header.' + Buffer.from(JSON.stringify({sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600})).toString('base64url') + '.sig',
    token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: {id: 'u1', email: 'owner@x.dz', aud: 'authenticated', role: 'authenticated'}});
  if (path === '/auth/v1/user') return json({id: 'u1', email: 'owner@x.dz'});
  return json({message: 'not mocked ' + path}, 404);
}

const b = await chromium.launch(); const errs = [];
const ctx = await b.newContext({viewport: {width: 1280, height: 900}});
await ctx.route('**/assets/config.js', r => r.fulfill({contentType: 'text/javascript', body: `window.FB_CONFIG={SUPABASE_URL:"${SB}",SUPABASE_ANON_KEY:"sb_publishable_testkey123",ADMIN_EMAIL:"owner@x.dz"}`}));
await ctx.route(SB + '/**', handle);
ctx.on('page', p => { p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/400|401|404|realtime\/v1\/websocket/.test(m.text())) errs.push(m.text()); }); });
try {
  const a = await ctx.newPage(); await a.goto(BASE + 'admin.html'); await a.waitForTimeout(1200);
  await a.fill('#pw', 'correct-pass'); await a.click('#loginBtn'); await a.waitForTimeout(1800);

  // settings: the keys are written, never read back
  courier.enabled = false;
  await a.click('[data-tab=site]'); await a.waitForTimeout(800);
  await a.fill('#zr-key', 'zrkey_ABCDEFGH12345'); await a.fill('#zr-tenant', 'not-a-tenant'); await a.check('#zr-on'); await a.click('#zr-save'); await a.waitForTimeout(400);
  ok(!calls.some(c => c.path === '/rest/v1/rpc/courier_save') && (await a.textContent('#toast')).includes('Tenant'), 'a tenant id in the wrong shape is caught before saving');
  await a.fill('#zr-tenant', '0b5c3a4e-1d2f-4a6b-9c8d-7e6f5a4b3c2d'); await a.click('#zr-save'); await a.waitForTimeout(900);
  const save = calls.filter(c => c.path === '/rest/v1/rpc/courier_save').pop();
  ok(save?.body.p_key === 'zrkey_ABCDEFGH12345' && save.body.p_tenant === '0b5c3a4e-1d2f-4a6b-9c8d-7e6f5a4b3c2d' && save.body.p_enabled === true && save.body.p_provider === 'zr', 'ZR keys saved through the database function');
  ok(await a.inputValue('#zr-key') === '' && (await a.getAttribute('#zr-key', 'placeholder')).includes('محفوظ'), 'after saving, the key is not shown again (only "saved")');
  await a.click('#zr-test'); await a.waitForTimeout(1500);
  ok((await a.textContent('#zr-res')).includes('قبلت') && zr.some(z => z.path === '/users/profile'), 'connection test: ZR accepts the keys');

  // delivery prices from the owner's ZR account fill the table; nothing saved before "save"
  await a.click('[data-tab=shipping]'); await a.waitForTimeout(600);
  const savesBefore = calls.filter(c => c.path === '/rest/v1/shipping_rates' && c.method === 'POST').length;
  await a.click('#zrRates'); await a.waitForTimeout(1500);
  const cell = (w, k) => a.$eval(`tr[data-w="${w}"] [data-k="${k}"]`, i => i.value);
  ok(await cell(34, 'home_price') === '400' && await cell(34, 'desk_price') === '250' && await cell(16, 'home_price') === '650' && await cell(19, 'home_price') === '500'
    && await cell(19, 'desk_price') === '300', 'ZR prices fill the table (by wilaya number, or by name when ZR gives no number)');
  ok(await cell(16, 'desk_price') === '' && await cell(1, 'home_price') === '', 'a price of 0 or a wilaya ZR does not list stays empty (nothing invented)');
  const note = await a.textContent('#zrRatesRes');
  ok(note.includes('3') && note.includes('أدرار') && note.includes('سعراً خاصاً ببلديات') && await a.locator('tr.from-zr').count() === 3, 'the owner sees what was filled (highlighted), what ZR has no price for, and the commune prices not imported');
  ok(calls.filter(c => c.path === '/rest/v1/shipping_rates' && c.method === 'POST').length === savesBefore, 'nothing saved before the owner presses save');
  await a.screenshot({path: (process.env.OUT || '/tmp') + '/zr-rates.png'});
  await a.click('#saveShip'); await a.waitForTimeout(1200);
  const up = calls.filter(c => c.path === '/rest/v1/shipping_rates' && c.method === 'POST').pop();
  const r34 = (up?.body || []).find(r => r.wilaya_code === 34);
  ok(r34 && r34.home_price === 400 && r34.desk_price === 250, 'after "save", the ZR prices are stored ' + JSON.stringify(r34 || {}));

  // order 7: home delivery, commune matched for certain -> sent in one click
  await a.click('[data-tab=orders]'); await a.waitForTimeout(800);
  await a.locator('details.order[data-id="7"] summary').click(); await a.waitForTimeout(300);
  await a.click('[data-zr-send="7"]'); await a.waitForTimeout(3500);
  const post7 = zr.find(z => z.method === 'POST' && z.path === '/parcels' && z.body.externalId === 'FB-00007')?.body;
  ok(post7 && post7.deliveryType === 'home' && post7.amount === 9300 && post7.customer.phone.number1 === '+213555123456' && post7.customer.name === 'أمينة بن علي'
    && post7.deliveryAddress.cityTerritoryId === 'w34' && post7.deliveryAddress.districtTerritoryId === 'c-medjana' && post7.deliveryAddress.street === 'حي 500 مسكن'
    && post7.orderedProducts[0].productName.startsWith('Abaya Atlas') && post7.orderedProducts[0].unitPrice === 8900 && !post7.hubId,
    'home order: ZR gets name, +213 phone, wilaya and commune ids, address, pieces and the amount to collect ' + JSON.stringify(post7 || {}).slice(0, 200));
  ok(zr.findIndex(z => z.path === '/parcels/search') < zr.findIndex(z => z.path === '/parcels' && z.method === 'POST'), 'before sending, ZR is asked whether this order number was already sent');
  ok(links.find(l => l.p_order === 7)?.p_tracking === 'ZR-00007' && (await a.textContent('details.order[data-id="7"]')).includes('ZR-00007'), 'ZR tracking number saved and shown in the order');
  ok((await a.textContent('details.order[data-id="7"] summary')).includes('ZR:'), 'order line shows where the parcel is at ZR');
  ok(!JSON.stringify(calls.filter(c => c.path !== '/rest/v1/rpc/courier_save')).includes('zrkey_ABCDEFGH12345'), 'the ZR key is never in any other request from the browser');

  // order 8: desk delivery, commune name differs at ZR -> the owner picks the commune, then the desk
  await a.locator('details.order[data-id="8"] summary').click(); await a.waitForTimeout(300);
  await a.click('[data-zr-send="8"]'); await a.waitForTimeout(2500);
  ok(await a.isVisible('#zrsel-8') && (await a.textContent('#zrc-8')).includes('البلدية') && !zr.some(z => z.path === '/parcels' && z.body?.externalId === 'FB-00008'),
    'commune not matched for certain: nothing sent, the owner chooses from ZR\'s list');
  await a.selectOption('#zrsel-8', 'c-bba'); await a.click('[data-zr-pick="8"]'); await a.waitForTimeout(2500);
  ok((await a.textContent('#zrc-8')).includes('مكتب') && (await a.locator('#zrsel-8 option').allTextContents()).some(t => t.includes('ZR BBA Ouest')), 'two ZR desks in the wilaya: the owner chooses the desk');
  await a.screenshot({path: (process.env.OUT || '/tmp') + '/zr-choose.png'});
  await a.selectOption('#zrsel-8', 'h2'); await a.click('[data-zr-pick="8"]'); await a.waitForTimeout(3500);
  const post8 = zr.find(z => z.method === 'POST' && z.path === '/parcels' && z.body.externalId === 'FB-00008')?.body;
  ok(post8 && post8.deliveryType === 'pickup-point' && post8.hubId === 'h2' && post8.deliveryAddress.districtTerritoryId === 'c-bba' && post8.customer.phone.number2 === '+213777000222',
    'desk order: sent to the chosen ZR desk with the chosen commune and both phones');

  // order 9: already at ZR (sent before, page closed halfway): linked, not sent twice
  const r9 = await a.evaluate(() => FB_API.courierSend(D.orders.find(o => o.id === 9)));
  ok(r9.tracking === 'ZR-OLD999' && !zr.some(z => z.path === '/parcels' && z.method === 'POST' && z.body.externalId === 'FB-00009'), 'an order already at ZR is linked, not sent a second time');

  // ZR refuses the key
  refuseKey = true; orders.push(mk(10, {phone: '0555111000'}));
  const err = await a.evaluate(async () => { try { await FB_API.courierSend({...D.orders[0], id: 10, order_number: 'FB-00010', courier_tracking: null}); return 'sent'; } catch (e) { return e.message; } });
  ok(err === 'courier:auth', 'ZR refuses the key: a clear error, nothing linked ' + err);
  ok(await a.evaluate(() => errText(new Error('courier:auth'))).then(t => t.includes('401')), 'the owner reads why (key refused, check its validity)');
  refuseKey = false;

  // shipping price still to confirm: not sent
  const err2 = await a.evaluate(async () => { try { await FB_API.courierSend({...D.orders[0], id: 11, courier_tracking: null, shipping_pending: true}); return 'sent'; } catch (e) { return e.message; } });
  ok(err2 === 'courier:shipping', 'delivery price not set yet: not sent to ZR (the amount to collect would be wrong)');
} finally { await b.close(); }
ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
console.log(results.join('\n'));
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
