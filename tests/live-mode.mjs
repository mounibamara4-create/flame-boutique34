// Live mode against a stand-in Supabase: the real supabase-js library runs in the browser, and its requests
// are answered here the way Supabase's REST and Auth APIs answer. Checks the requests the site sends.
// Run: node tests/netlify-local.mjs &  then  node tests/live-mode.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8888/';
const SB = 'https://fbtest.supabase.co';
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m);
const calls = [];
const notify = {enabled: false, chat: '', token: ''}, blocked = [];
const settings = {data: {whatsapp: '213555000111', socials: {instagram: 'https://instagram.com/flame'}}};
const products = [{id: 'atlas', name: {ar: 'عباية الأطلس', fr: 'Abaya Atlas'}, description: {ar: '', fr: ''}, category: 'abaya', type: 'abaya',
  price: 8900, compare_price: null, badge: null, colors: [{ar: 'أسود', fr: 'Noir', hex: '#211B20', image: ''}], sizes: ['M'], stock: {M: 4}, image: '', active: true, sort: 0}];
const rates = [{wilaya_code: 34, scope: 0, home_price: 400, desk_price: 250, home_available: true, desk_available: true}];
const communes = [{id: 1187, name_ar: 'مجانة', name_fr: 'Medjana'}, {id: 1190, name_ar: 'برج بوعريرج', name_fr: 'B. B. Arreridj'}];
const order = {id: 7, order_number: 'FB-00007', tracking_code: 'FLM-TEST2345', status: 'received', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  first_name: 'أمينة', last_name: 'بن علي', phone: '0555123456', wilaya_code: 34, wilaya_name: 'برج بوعريريج', commune_id: 1187, commune_name: 'مجانة',
  delivery: 'home', address: 'حي 500', subtotal: 8900, shipping: 400, shipping_pending: false, total: 9300, cost_total: 0, admin_note: '',
  order_items: [{product_id: 'atlas', name: products[0].name, size: 'M', color: products[0].colors[0], qty: 1, unit_price: 8900, unit_cost: 0}],
  order_status_history: [{status: 'received', note: '', created_at: new Date().toISOString()}]};
const cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*'};

async function handle(route){
  const req = route.request(), u = new URL(req.url()), path = u.pathname, accept = req.headers()['accept'] || '';
  if (req.method() === 'OPTIONS') return route.fulfill({status: 204, headers: cors});
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  calls.push({method: req.method(), path, query: u.search, body, auth: req.headers()['authorization'] || ''});
  const json = (data, status = 200) => route.fulfill({status, headers: {...cors, 'Content-Type': 'application/json'}, body: JSON.stringify(data)});
  const one = rows => accept.includes('vnd.pgrst.object') ? json(rows[0] ?? null) : json(rows);
  if (path === '/rest/v1/settings') return one([settings]);
  if (path === '/rest/v1/products') return json(products);
  if (path === '/rest/v1/shipping_rates') return json(rates);
  if (path === '/rest/v1/communes') return json(u.searchParams.get('wilaya_code') === 'eq.34' ? communes : []);
  if (path === '/rest/v1/product_costs') return json([]);
  if (path === '/rest/v1/orders') return json(req.method() === 'GET' ? [order] : []);
  if (path === '/rest/v1/rpc/place_order') {
    if (body.p.first_name === 'خطأ') return json({code: 'P0001', message: 'invalid:phone', details: null, hint: null}, 400);
    return json({order_number: 'FB-00008', tracking_code: 'FLM-SRVR2345', subtotal: 8900, shipping: 400, shipping_pending: false, total: 9300, repeat: false});
  }
  if (path === '/rest/v1/rpc/track_order') return json(body.p_phone === '0555123456' ? {...order, history: [{status: 'received', at: order.created_at}], items: order.order_items} : null);
  if (path === '/rest/v1/rpc/is_admin') return json(true);
  // Telegram settings: the token is accepted, never returned; Telegram's answer depends on the token
  if (path === '/rest/v1/rpc/notify_get') return json({enabled: notify.enabled, chat: notify.chat, has_token: !!notify.token, pg_net: true});
  if (path === '/rest/v1/rpc/notify_save') { if (body.p_token) notify.token = body.p_token; notify.chat = body.p_chat; notify.enabled = body.p_enabled; return route.fulfill({status: 204, headers: cors}); }
  if (path === '/rest/v1/rpc/notify_test') return json(41);
  if (path === '/rest/v1/rpc/notify_result') return json({status: notify.token.startsWith('123456789:') ? 200 : 401});
  if (path === '/rest/v1/blocked_phones') return json([]);
  if (path === '/rest/v1/rpc/block_phone') { blocked.push(body); return route.fulfill({status: 204, headers: cors}); }
  if (path === '/rest/v1/rpc/set_order_status') { order.status = body.p_status; order.order_status_history.push({status: body.p_status, note: body.p_note, created_at: new Date().toISOString()}); return route.fulfill({status: 204, headers: cors}); }
  if (path === '/auth/v1/token') return json(body.password === 'correct-pass'
    ? {access_token: 'header.' + Buffer.from(JSON.stringify({sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600})).toString('base64url') + '.sig', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: {id: 'u1', email: 'owner@x.dz', aud: 'authenticated', role: 'authenticated'}}
    : {error: 'invalid_grant', error_description: 'Invalid login credentials'}, body.password === 'correct-pass' ? 200 : 400);
  if (path === '/auth/v1/user') return json({id: 'u1', email: 'owner@x.dz'});
  if (path === '/auth/v1/logout') return route.fulfill({status: 204, headers: cors});
  return json({message: 'not mocked ' + path}, 404);
}

const b = await chromium.launch(); const errs = [];
const ctx = await b.newContext({viewport: {width: 1280, height: 860}});
await ctx.route('**/assets/config.js', r => r.fulfill({contentType: 'text/javascript', body: `window.FB_CONFIG={SUPABASE_URL:"${SB}",SUPABASE_ANON_KEY:"sb_publishable_testkey123",ADMIN_EMAIL:"owner@x.dz"}`}));
await ctx.route(SB + '/**', handle);
// live updates (WebSocket) cannot be stood in for here, so their connection errors are expected
ctx.on('page', p => { p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/400|404|realtime\/v1\/websocket/.test(m.text())) errs.push(m.text()); }); });
try {
  const p = await ctx.newPage();
  await p.goto(BASE); await p.waitForTimeout(2500);
  ok(await p.evaluate(() => FB_API.mode) === 'live' && await p.evaluate(() => !!window.supabase), 'live mode: supabase-js loads from the site itself under the CSP');
  ok(await p.locator('.demo-bar').count() === 0, 'no demo notice once Supabase is connected');
  ok(await p.locator('.card').count() === 1 && await p.getAttribute('#socialBar a[aria-label="Instagram"]', 'href') === 'https://instagram.com/flame', 'products and settings come from the database');
  ok(calls.some(c => c.path === '/rest/v1/products' && c.query.includes('active=eq.true')), 'store asks only for active products');
  await p.click('[data-buy="atlas"]'); await p.waitForTimeout(600);
  await p.fill('#f_first', 'أمينة'); await p.fill('#f_last', 'بن علي'); await p.fill('#f_phone', '0555123456');
  await p.click('#f_wilaya'); await p.fill('#f_wilaya', '34'); await p.keyboard.press('Enter'); await p.waitForTimeout(700);
  ok(calls.some(c => c.path === '/rest/v1/communes' && c.query.includes('wilaya_code=eq.34')), 'communes loaded from the database for the chosen wilaya');
  await p.click('#f_commune'); await p.fill('#f_commune', 'Medjana'); await p.keyboard.press('Enter');
  await p.click('#f_delivery label:has(input[value="home"])'); await p.fill('#f_address', 'حي 500 مسكن');
  ok((await p.innerText('#coTotals')).includes('9 300'), 'delivery price from shipping_rates (8900 + 400)');
  await p.click('#coNext'); await p.waitForTimeout(300); await p.click('#coConfirm'); await p.waitForTimeout(1500);
  const call = calls.find(c => c.path === '/rest/v1/rpc/place_order');
  ok(call && call.body.p && /^[0-9a-f-]{36}$/.test(call.body.p.idempotency_key) && call.body.p.commune_id === 1187 && call.body.p.items[0].id === 'atlas' && !('price' in call.body.p.items[0]),
    'place_order receives {p: …} with idempotency key, commune id and items without prices');
  ok(await p.textContent('#trackCode') === 'FLM-SRVR2345', 'success shows the tracking code returned by the server');
  // server-side field error goes back to the form
  await p.click('#backShop'); await p.waitForTimeout(400);
  await p.click('[data-buy="atlas"]'); await p.waitForTimeout(600);
  await p.fill('#f_first', 'خطأ'); await p.fill('#f_last', 'تجربة'); await p.fill('#f_phone', '0555123456');
  await p.click('#f_delivery label:has(input[value="desk"])');
  await p.click('#coNext'); await p.waitForTimeout(300); await p.click('#coConfirm'); await p.waitForTimeout(1200);
  ok(await p.isVisible('#coForm') && (await p.textContent('#e_phone')).length > 0, 'a server rejection (invalid:phone) returns to the form with the message next to the field');

  const t = await ctx.newPage(); await t.goto(BASE + 'track.html#FLM-TEST2345'); await t.fill('#tPhone', '0555123456'); await t.click('#tBtn'); await t.waitForTimeout(1500);
  ok((await t.textContent('.now')) === 'تم استلام الطلب', 'tracking page reads track_order');

  const a = await ctx.newPage(); await a.goto(BASE + 'admin.html'); await a.waitForTimeout(1500);
  await a.fill('#pw', 'wrong'); await a.click('#loginBtn'); await a.waitForTimeout(1200);
  ok((await a.textContent('#loginErr')).includes('غير صحيحة'), 'wrong owner password refused by Supabase Auth');
  await a.fill('#pw', 'correct-pass'); await a.click('#loginBtn'); await a.waitForTimeout(2000);
  const tok = calls.find(c => c.path === '/auth/v1/token');
  ok(tok && tok.body.email === 'owner@x.dz', 'sign-in sends the owner email from config with the typed password');
  ok(await a.isVisible('#app'), 'owner signed in after is_admin check');
  ok(calls.some(c => c.path === '/rest/v1/orders' && c.query.includes('order_items') && c.query.includes('order_status_history')), 'dashboard loads orders with items and history');
  await a.click('[data-tab=orders]'); await a.waitForTimeout(800); await a.click('.order summary'); await a.waitForTimeout(200);
  await a.selectOption('#st-7', 'confirmed'); await a.fill('#sn-7', 'تم الاتصال'); await a.click('[data-status="7"]'); await a.waitForTimeout(1500);
  const st = calls.find(c => c.path === '/rest/v1/rpc/set_order_status');
  ok(st && st.body.p_order === 7 && st.body.p_status === 'confirmed' && st.body.p_note === 'تم الاتصال' && st.auth.startsWith('Bearer header.'), 'status change goes through set_order_status with the owner session');
  // fake order: block the number from its order (block_phone, then cancel through set_order_status)
  order.status = 'received';
  await a.reload(); await a.waitForTimeout(1500); await a.click('[data-tab=orders]'); await a.waitForTimeout(800); await a.click('.order summary'); await a.waitForTimeout(200);
  await a.click('[data-block="7"]'); await a.click('[data-block="7"]'); await a.waitForTimeout(1500);
  const cancel = calls.filter(c => c.path === '/rest/v1/rpc/set_order_status').pop();
  ok(blocked[0]?.p_phone === '0555123456' && cancel.body.p_status === 'cancelled', 'block a number: block_phone with the order phone, and the order cancelled');
  // Telegram: save the token and the chat id, send a test, read Telegram's answer
  await a.click('[data-tab=site]'); await a.waitForTimeout(1200);
  await a.fill('#n-token', '987654321:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw1'); await a.fill('#n-chat', '555000111'); await a.check('#n-on'); await a.click('#n-save'); await a.waitForTimeout(1200);
  const save = calls.filter(c => c.path === '/rest/v1/rpc/notify_save').pop();
  ok(save && save.body.p_token.startsWith('987654321:') && save.body.p_chat === '555000111' && save.body.p_enabled === true && (await a.getAttribute('#n-token', 'placeholder')).includes('محفوظ') && await a.inputValue('#n-token') === '',
    'Telegram settings saved through notify_save; afterwards the token field is empty ("saved")');
  await a.click('#n-test'); await a.waitForTimeout(2500);
  ok((await a.textContent('#n-res')).includes('رمز البوت غير صحيح'), 'test message with a wrong token: Telegram answers 401, the dashboard says the token is wrong');
  await a.fill('#n-token', '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw1'); await a.click('#n-save'); await a.waitForTimeout(1200);
  await a.click('#n-test'); await a.waitForTimeout(2500);
  ok((await a.textContent('#n-res')).includes('وصلت الرسالة'), 'test message with the right token: "the message arrived"');
  await a.screenshot({path: (process.env.OUT || '/tmp') + '/notify-live.png', fullPage: true});
  // config without ADMIN_EMAIL: the owner types the email at sign-in
  const ctx2 = await b.newContext();
  await ctx2.route('**/assets/config.js', r => r.fulfill({contentType: 'text/javascript', body: `window.FB_CONFIG={SUPABASE_URL:"${SB}",SUPABASE_ANON_KEY:"sb_publishable_testkey123",ADMIN_EMAIL:""}`}));
  await ctx2.route(SB + '/**', handle);
  const a2 = await ctx2.newPage(); await a2.goto(BASE + 'admin.html'); await a2.waitForTimeout(1500);
  ok(await a2.isVisible('#em'), 'no owner email in config: the sign-in form asks for it');
  calls.length = 0;
  await a2.fill('#em', 'mounib@example.dz'); await a2.fill('#pw', 'correct-pass'); await a2.click('#loginBtn'); await a2.waitForTimeout(2000);
  ok(calls.find(c => c.path === '/auth/v1/token')?.body.email === 'mounib@example.dz' && await a2.isVisible('#app'), 'owner signs in with the typed email');
  await ctx2.close();
} catch (e) { results.push('FAIL test stopped: ' + e.message.split('\n')[0]); }
console.log(results.join('\n'));
console.log(`\n${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
console.log('page errors:', errs.length ? errs : 'none');
await b.close();
