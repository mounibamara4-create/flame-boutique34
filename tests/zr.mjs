// ZR Express in demo mode (real browser): settings, "send to ZR" in an order, status checks moving the order
// forward, what the customer sees on the tracking page, and unlinking. Nothing is sent anywhere in demo mode.
// Run: node tests/netlify-local.mjs &  then  node tests/zr.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8888/';
const OUT = (process.env.OUT || '/tmp') + '/';
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m); const errs = [];
const DEMO_CONFIG = r => r.fulfill({contentType: 'text/javascript', body: 'window.FB_CONFIG={DEMO_PASSWORD_SHA256:"cd782a4fb4e7c57fcab4debf1a47b4e4052d9dd02cdd1fade914b9d7fbeb8221"}'});
const b = await chromium.launch();
try {
  const ctx = await b.newContext({viewport: {width: 1280, height: 900}});
  await ctx.addInitScript(() => { addEventListener('DOMContentLoaded', () => { const s = document.getElementById('splash'); if (s) s.remove(); }); });
  await ctx.route('**/assets/config.js', DEMO_CONFIG);
  ctx.on('page', p => p.on('pageerror', e => errs.push(p.url() + ' ' + e.message)));
  const a = await ctx.newPage();
  await a.goto(BASE + 'admin.html'); await a.fill('#pw', 'Fam20@'); await a.click('#loginBtn'); await a.waitForTimeout(700);
  const placed = await a.evaluate(async () => {
    await FB_API.saveProduct({id: 'khimar', category: 'hijab', type: 'khimar', price: 2500, compare_price: null, badge: null, cost: 0, name: {ar: 'خمار جورجيت', fr: 'Khimar'},
      description: {ar: '', fr: ''}, sizes: ['TU'], stock: {TU: 10}, active: true, sort: 0, image: '', images: [], colors: [{ar: 'أسود', fr: 'Noir', hex: '#211B20', image: ''}]});
    await FB_API.saveRates([{wilaya_code: 34, scope: 0, home_price: 400, desk_price: 250, home_available: true, desk_available: true}]);
    const c = await FB_API.communes(34);
    return FB_API.placeOrder({idempotency_key: crypto.randomUUID(), first_name: 'سلمى', last_name: 'بوزيد', phone: '0551234567', wilaya: 34, commune_id: c[0].id,
      delivery: 'home', address: 'حي 1000 مسكن', items: [{id: 'khimar', size: 'TU', color: 0, qty: 1}]});
  });
  await a.reload(); await a.waitForTimeout(800);
  await a.click('[data-tab=orders]'); await a.waitForTimeout(500);
  ok(await a.locator('[data-zr-send]').count() === 0 && await a.locator('#zrSync').count() === 0, 'ZR not switched on: no ZR buttons in the orders');

  await a.click('[data-tab=site]'); await a.waitForTimeout(600);
  ok(await a.isVisible('#zrBox') && (await a.textContent('#zrBox')).includes('وضع التجربة'), 'settings: a ZR Express box, saying nothing is sent in demo mode');
  await a.check('#zr-on'); await a.click('#zr-save'); await a.waitForTimeout(300);
  ok((await a.textContent('#toast')).includes('أدخل المفتاحين'), 'switching on without keys: asked for them');
  await a.click('input[name="zr-p"][value="zr_old"]');
  ok((await a.textContent('#zr-key-l')) === 'Key' && (await a.textContent('#zr-tenant-l')) === 'Token', 'former ZR platform: the fields become Key and Token');
  await a.click('input[name="zr-p"][value="zr"]');
  await a.fill('#zr-key', 'zrkey_DEMO_12345678'); await a.fill('#zr-tenant', '0b5c3a4e-1d2f-4a6b-9c8d-7e6f5a4b3c2d'); await a.click('#zr-save'); await a.waitForTimeout(600);
  ok((await a.textContent('#toast')).includes('تم حفظ') && !(await a.evaluate(() => localStorage.getItem('fb34-demo-db'))).includes('zrkey_DEMO'), 'keys saved (the demo keeps only "a key is saved", never the key)');

  await a.click('[data-tab=orders]'); await a.waitForTimeout(500);
  const row = a.locator('details.order').first();
  await row.locator('summary').click(); await a.waitForTimeout(300);
  ok(await a.isVisible('[data-zr-send]') && await a.isVisible('#zrSync'), 'ZR on: "send to ZR Express" in the order, "update ZR statuses" above the list');
  await a.click('[data-zr-send]'); await a.waitForTimeout(1200);
  const t1 = await a.textContent('details.order >> nth=0');
  ok(/ZR-DEMO-[A-Z0-9]{6}/.test(t1) && t1.includes('قيد التحضير') && t1.includes('ZR: مسجّل'), 'sent: ZR number shown, order "preparing", line shows "ZR: registered"');
  ok(await a.locator('[data-zr-send]').count() === 0, 'the send button is gone (no second parcel by mistake)');
  await a.screenshot({path: OUT + 'zr-sent.png'});

  const steps = [];
  for (let i = 0; i < 3; i++){ await a.click('#zrSync'); await a.waitForTimeout(900); steps.push(await a.textContent('details.order .o-st >> nth=0')); }
  ok(steps[0].includes('تسليم الطلب لشركة التوصيل') && steps[1].includes('خرج للتوصيل') && steps[2].includes('تم التسليم'),
    'status checks: handed to the carrier, out for delivery, delivered ' + JSON.stringify(steps));
  const hist = await a.evaluate(() => D.orders[0].order_status_history.map(h => h.note).join(' | '));
  ok(hist.includes('ZR Express: Livré'), 'each change noted "ZR Express: …" in the history');

  // the customer
  const tr = await ctx.newPage();
  await tr.goto(BASE + 'track.html#' + placed.tracking_code); await tr.waitForTimeout(500);
  await tr.fill('#tPhone', '0551234567'); await tr.click('#tBtn'); await tr.waitForTimeout(1200);
  ok((await tr.textContent('.now')).includes('تم التسليم') && await tr.locator('.courier').count() === 0, 'tracking page: the customer sees "delivered" (no ZR box once it is over)');
  // a parcel on its way shows the ZR box
  await a.evaluate(async () => { const db = JSON.parse(localStorage.getItem('fb34-demo-db')); const o = db.orders[0]; o.status = 'out_for_delivery'; o.courier_stage = 'desk'; o.courier_label = 'Arrivé au bureau'; localStorage.setItem('fb34-demo-db', JSON.stringify(db)); });
  await tr.reload(); await tr.waitForTimeout(500);
  await tr.fill('#tPhone', '0551234567'); await tr.click('#tBtn'); await tr.waitForTimeout(1200);
  const box = await tr.locator('.courier').textContent().catch(() => '');
  ok(box.includes('ZR Express') && box.includes('وصل إلى مكتب التوصيل') && /ZR-DEMO-/.test(box), 'parcel on its way: the customer sees where it is at ZR and the ZR number ' + JSON.stringify(box.slice(0, 120)));
  await tr.screenshot({path: OUT + 'zr-track.png', fullPage: true});

  // unlink (twice to confirm)
  await a.reload(); await a.waitForTimeout(800); await a.click('[data-tab=orders]'); await a.waitForTimeout(500);
  await a.locator('details.order summary').first().click(); await a.waitForTimeout(200);
  await a.click('[data-zr-unlink]'); await a.waitForTimeout(100);
  ok((await a.textContent('[data-zr-unlink]')).includes('مرة أخرى'), 'unlinking asks for a second click');
  await a.click('[data-zr-unlink]'); await a.waitForTimeout(700);
  ok(!(await a.textContent('details.order >> nth=0 >> .zr-box')).includes('ZR-DEMO') && await a.locator('[data-zr-send]').count() === 1, 'unlinked: the order can be sent again');
} finally { await b.close(); }
ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
console.log(results.join('\n'));
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
