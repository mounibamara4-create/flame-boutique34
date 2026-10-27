// The customer payment receipt (وصل الدفع): the shared builder, and the print buttons on the
// tracking page and in the dashboard (demo mode, real browser). window.print is stubbed so the
// test never opens a real print dialog; we check the receipt that would be printed.
// Run: node tests/netlify-local.mjs &  then  node tests/receipt.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8888/';
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m); const errs = [];
const DEMO_CONFIG = r => r.fulfill({contentType: 'text/javascript', body: 'window.FB_CONFIG={DEMO_PASSWORD_SHA256:"cd782a4fb4e7c57fcab4debf1a47b4e4052d9dd02cdd1fade914b9d7fbeb8221"}'});
const stubPrint = `window.__printed = 0; window.print = () => { window.__printed++; };`;
const b = await chromium.launch();
try {
  const ctx = await b.newContext({viewport: {width: 1280, height: 900}});
  await ctx.addInitScript(() => { addEventListener('DOMContentLoaded', () => { const s = document.getElementById('splash'); if (s) s.remove(); }); });
  await ctx.route('**/assets/config.js', DEMO_CONFIG);
  await ctx.addInitScript(stubPrint);
  ctx.on('page', p => p.on('pageerror', e => errs.push(p.url() + ' ' + e.message)));

  // ---- 1) the shared builder FB.receiptHTML, used by all three pages ----
  const s = await ctx.newPage();
  await s.goto(BASE);
  await s.waitForFunction(() => window.FB && FB.receiptHTML);
  const order = {
    number: 'FB-00042', tracking: 'FLM-ABCD2345', date: '2026-02-01T10:30:00Z',
    customer: {name: 'سارة بوزيد', phone: '0551223344'},
    delivery: {method: 'home', wilaya: '34 برج بوعريريج', commune: 'العش', address: 'حي 200 مسكن، عمارة ب'},
    lines: [{name: 'عباية سوداء', variant: 'أسود، M', qty: 2, unit: 4500}, {name: 'خمار', variant: 'كحلي، مقاس موحد', qty: 1, unit: 1200}],
    subtotal: 10200, shipping: 400, shipping_pending: false, total: 10600,
    shop: {phone: '0549 90 22 89', address: 'برج بوعريريج', instagram: 'flame_boutique_34', site: 'flameboutique34.netlify.app'}
  };
  const ar = await s.evaluate(o => FB.receiptHTML(o, 'ar'), order);
  ok(ar.includes('FB-00042') && ar.includes('FLM-ABCD2345'), 'builder: order and tracking numbers appear');
  ok(ar.includes('سارة بوزيد') && ar.includes('0551223344'), 'builder: customer name and phone appear');
  ok(ar.includes('عباية سوداء') && ar.includes('خمار'), 'builder: every line item appears');
  ok(ar.includes('9000') && ar.includes('1200'), 'builder: unit × qty line totals computed (2×4500=9000)');
  ok(ar.includes('10600') && ar.includes('المبلغ المطلوب'), 'builder: grand total and its label appear');
  ok(ar.includes('الدفع عند الاستلام'), 'builder: cash-on-delivery note appears');
  ok(ar.includes('<style>') && ar.includes('@media print'), 'builder: self-contained (own style + print rules)');
  const fr = await s.evaluate(o => FB.receiptHTML(o, 'fr'), order);
  ok(fr.includes('Reçu de commande') && fr.includes('Paiement à la livraison') && fr.includes('DA'), 'builder: French receipt in French with DA currency');
  // a price is never invented: when a unit price is unknown, no price column, totals still shown
  const noUnit = await s.evaluate(() => FB.receiptHTML({number:'FB-1',tracking:'FLM-X',date:Date.now(),customer:{name:'ن'},delivery:{method:'desk'},lines:[{name:'قطعة',qty:1,unit:null}],subtotal:3000,shipping:0,shipping_pending:true,total:3000}, 'ar'));
  ok(!noUnit.includes('سعر القطعة') && noUnit.includes('يحتاج إلى تأكيد'), 'builder: no unit column when price unknown; pending shipping shown as "needs confirmation"');
  // printReceipt injects a hidden receipt and opens the print dialog once
  const printed = await s.evaluate(o => { FB.printReceipt(o, 'ar'); const el = document.getElementById('fbReceipt'); return {count: window.__printed, has: !!el && !!el.querySelector('.fbr-doc'), hidden: getComputedStyle(el).display === 'none'}; }, order);
  await s.waitForTimeout(120);
  const printed2 = await s.evaluate(() => window.__printed);
  ok(printed.has, 'printReceipt: builds a #fbReceipt .fbr-doc in the page');
  ok(printed.hidden, 'printReceipt: the receipt stays hidden on screen (only the print view shows it)');
  ok(printed2 === 1, 'printReceipt: opens the print dialog exactly once');

  // ---- seed one order to test the two pages ----
  await s.evaluate(async () => {
    await FB_API.saveProduct({id: 'ab1', category: 'abaya', type: 'abaya', price: 4500, compare_price: null, badge: null, cost: 1000, name: {ar: 'عباية كلاسيك', fr: 'Abaya classique'},
      description: {ar: '', fr: ''}, sizes: ['S', 'M', 'L'], stock: {S: 5, M: 5, L: 5}, active: true, sort: 0, image: '', images: [], colors: [{ar: 'أسود', fr: 'Noir', hex: '#211B20', image: ''}]});
    await FB_API.saveRates([{wilaya_code: 34, scope: 0, home_price: 400, desk_price: 250, home_available: true, desk_available: true}]);
    const c = await FB_API.communes(34);
    await FB_API.placeOrder({idempotency_key: crypto.randomUUID(), first_name: 'سارة', last_name: 'بوزيد', phone: '0551223344', wilaya: 34, commune_id: c[0].id, lang: 'ar',
      delivery: 'home', address: 'حي 200 مسكن', items: [{id: 'ab1', size: 'M', color: 0, qty: 2}]});
  });

  // ---- 2) tracking page: the customer re-prints her own receipt ----
  const tr = await ctx.newPage();
  await tr.goto(BASE + 'track.html');
  const code = await s.evaluate(() => JSON.parse(localStorage.getItem('fb34-demo-db')).orders[0].tracking_code);
  await tr.fill('#tCode', code); await tr.fill('#tPhone', '0551223344'); await tr.click('#tBtn');
  await tr.waitForSelector('#tReceipt');
  ok(true, 'track: receipt button appears for a found order');
  await tr.click('#tReceipt'); await tr.waitForTimeout(150);
  const tReceipt = await tr.evaluate(() => { const el = document.getElementById('fbReceipt'); return {printed: window.__printed, html: el ? el.innerHTML : ''}; });
  ok(tReceipt.printed === 1, 'track: clicking the button opens the print dialog once');
  ok(tReceipt.html.includes('سارة بوزيد'), 'track: receipt carries the customer name (from the extended track_order)');
  ok(tReceipt.html.includes('عباية كلاسيك') && tReceipt.html.includes('9000'), 'track: receipt carries item and its line total from unit_price');

  // ---- 3) dashboard: the owner prints the customer receipt for the parcel ----
  const ad = await ctx.newPage();
  await ad.goto(BASE + 'admin.html'); await ad.fill('#pw', 'Fam20@'); await ad.click('#loginBtn'); await ad.waitForTimeout(700);
  await ad.click('[data-tab=orders]'); await ad.waitForTimeout(500);
  const detail = ad.locator('details.order', {hasText: 'سارة'}).first();
  await detail.locator('summary').click(); await ad.waitForTimeout(200);
  await detail.locator('[data-receipt]').click(); await ad.waitForTimeout(150);
  const aReceipt = await ad.evaluate(() => { const el = document.getElementById('fbReceipt'); return {printed: window.__printed, html: el ? el.innerHTML : ''}; });
  ok(aReceipt.printed === 1, 'dashboard: clicking "طباعة وصل الزبونة" opens the print dialog once');
  ok(aReceipt.html.includes('سارة بوزيد') && aReceipt.html.includes('عباية كلاسيك'), 'dashboard: receipt carries customer and item');
  ok(aReceipt.html.includes('الدفع عند الاستلام'), 'dashboard: receipt in the customer language (Arabic order)');
} catch (e) { errs.push('EXC ' + (e && e.stack || e)); }
await b.close();
for (const r of results) console.log(r);
if (errs.length) { console.log('\nERRORS:'); for (const e of errs) console.log(e); }
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed || errs.length ? 1 : 0);
