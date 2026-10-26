// The customer's history in each order, the ready WhatsApp messages, and the film skipped for a visitor
// coming back to the home page in the same visit (demo mode, real browser).
// Run: node tests/netlify-local.mjs &  then  node tests/extras.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8888/';
const OUT = (process.env.OUT || '/tmp') + '/';
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m); const errs = [];
const DEMO_CONFIG = r => r.fulfill({contentType: 'text/javascript', body: 'window.FB_CONFIG={DEMO_PASSWORD_SHA256:"cd782a4fb4e7c57fcab4debf1a47b4e4052d9dd02cdd1fade914b9d7fbeb8221"}'});
const b = await chromium.launch();
try {
  const ctx = await b.newContext({viewport: {width: 1280, height: 900}});
  await ctx.route('**/assets/config.js', DEMO_CONFIG);
  ctx.on('page', p => p.on('pageerror', e => errs.push(p.url() + ' ' + e.message)));
  const a = await ctx.newPage();
  await a.goto(BASE + 'admin.html'); await a.fill('#pw', 'Fam20@'); await a.click('#loginBtn'); await a.waitForTimeout(700);
  await a.evaluate(async () => {
    await FB_API.saveProduct({id: 'khimar', category: 'hijab', type: 'khimar', price: 2500, compare_price: null, badge: null, cost: 0, name: {ar: 'خمار جورجيت', fr: 'Khimar georgette'},
      description: {ar: '', fr: ''}, sizes: ['TU'], stock: {TU: 20}, active: true, sort: 0, image: '', images: [], colors: [{ar: 'أسود', fr: 'Noir', hex: '#211B20', image: ''}]});
    await FB_API.saveRates([{wilaya_code: 34, scope: 0, home_price: 400, desk_price: 250, home_available: true, desk_available: true}]);
    const c = await FB_API.communes(34), k = 'fb34-demo-db';
    const place = async (phone, lang, first) => {
      const r = await FB_API.placeOrder({idempotency_key: crypto.randomUUID(), first_name: first, last_name: 'بوزيد', phone, wilaya: 34, commune_id: c[0].id, lang,
        delivery: 'desk', items: [{id: 'khimar', size: 'TU', color: 0, qty: 1}]});
      const db = JSON.parse(localStorage.getItem(k)); db.orders.forEach(o => o.created_at = new Date(new Date(o.created_at).getTime() - 120000).toISOString()); localStorage.setItem(k, JSON.stringify(db));
      return r;
    };
    const ids = [];
    for (const ph of ['0551000001', '0551000001', '0551000001']) ids.push(await place(ph, 'ar', 'سارة'));   // refused twice, then a new order
    for (const ph of ['0771000002', '0771000002']) ids.push(await place(ph, 'fr', 'Lina'));                // delivered once, then a new order
    ids.push(await place('0661000003', 'ar', 'مريم'));                                                    // first order
    const db = JSON.parse(localStorage.getItem(k)), byCode = c => db.orders.find(o => o.tracking_code === c.tracking_code).id;
    await FB_API.setOrderStatus(byCode(ids[0]), 'failed'); await FB_API.setOrderStatus(byCode(ids[1]), 'failed');
    await FB_API.setOrderStatus(byCode(ids[3]), 'delivered');
  });
  await a.reload(); await a.waitForTimeout(900); await a.click('[data-tab=orders]'); await a.waitForTimeout(600);
  const row = ph => a.locator('details.order', {hasText: ph}).first();
  const badge = async ph => (await row(ph).locator('summary .hist').allTextContents()).join(' ');
  // the newest order of each number is shown first
  ok((await badge('0551000001')).includes('رفضت الاستلام مرتين'), 'customer who refused twice: warning badge on her new order — ' + await badge('0551000001'));
  ok((await badge('0771000002')).includes('زبونة وفية') , 'customer with a delivered order: "loyal" badge — ' + await badge('0771000002'));
  ok((await badge('0661000003')).includes('أول طلب'), 'first order from a number: "first order"');
  await row('0551000001').locator('summary').click(); await a.waitForTimeout(300);
  const past = await row('0551000001').locator('.hist-list li').allTextContents();
  ok(past.length === 2 && past.every(t => t.includes('لم يُستلم') || t.includes('فشل') || t.includes('رفض') || t.length > 5), 'her previous orders listed in the order (' + past.length + ')');

  // WhatsApp messages
  const links = await row('0551000001').locator('[data-wa]').evaluateAll(els => els.map(e => ({k: e.dataset.wa, href: e.href, target: e.target})));
  ok(links.length === 5 && links.every(l => l.href.startsWith('https://wa.me/213551000001?text=') && l.target === '_blank'), '5 ready messages, each opening her WhatsApp chat');
  const txt = k => decodeURIComponent(links.find(l => l.k === k).href.split('text=')[1]);
  ok(txt('confirm').includes('سارة') && txt('confirm').includes('خمار جورجيت') && /2.?750 دج/.test(txt('confirm')) && txt('confirm').includes('FB-'),
    'confirm message (Arabic): her name, the piece, the total, the order number — ' + JSON.stringify(txt('confirm').slice(0, 120)));
  ok(/\/track\.html#[A-Z0-9-]+$/m.test(txt('sent')), 'on-its-way message carries her tracking link');
  await row('0771000002').locator('summary').click(); await a.waitForTimeout(300);
  const fr = decodeURIComponent((await row('0771000002').locator('[data-wa=confirm]').getAttribute('href')).split('text=')[1]);
  ok(fr.startsWith('Bonjour Lina') && fr.includes('Khimar georgette') && fr.includes('DA'), 'French-speaking customer gets the message in French');
  await a.screenshot({path: OUT + 'extras-orders.png', fullPage: false});

  // the welcome splash: shown once per visitor, then never again
  const s = await ctx.newPage(); await s.goto(BASE); await s.waitForTimeout(700);
  ok(await s.locator('#splash').isVisible() && await s.evaluate(() => { const i = document.querySelector('#splash img'); return !!i && i.complete && i.naturalWidth > 0; }), 'first visit: the welcome image is shown and loaded');
  await s.waitForTimeout(3400);  // it fades away on its own after ~3s
  ok(await s.evaluate(() => !document.querySelector('#splash')), 'the welcome image disappears on its own, leaving the store');
  await s.goto(BASE); await s.waitForTimeout(800);
  ok(await s.evaluate(() => !document.querySelector('#splash')), 'coming back: the welcome image never shows again');
  const fresh2 = await b.newContext({viewport: {width: 1280, height: 900}});
  await fresh2.route('**/assets/config.js', DEMO_CONFIG);
  const fresh = await fresh2.newPage(); await fresh.goto(BASE); await fresh.waitForTimeout(700);
  ok(await fresh.locator('#splash').isVisible(), 'a brand-new visitor (clean browser) sees the welcome image once');
} finally { await b.close(); }
ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
console.log(results.join('\n'));
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
