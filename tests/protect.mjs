// Fake orders and new-order alerts, in demo mode (real browser): the same number twice, too many orders
// waiting, the hidden field, blocking a number from the dashboard, the customer's messages, and the dashboard
// hearing about a new order placed in another tab. The database side (network limit, Telegram) is in tests/db.
// Run: node tests/netlify-local.mjs &  then  node tests/protect.mjs
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
  await a.evaluate(async () => {
    await FB_API.saveProduct({id: 'khimar', category: 'hijab', type: 'khimar', price: 2500, compare_price: null, badge: null, cost: 0, name: {ar: 'خمار جورجيت', fr: 'Khimar'},
      description: {ar: '', fr: ''}, sizes: ['TU'], stock: {TU: 10}, active: true, sort: 0, image: '', images: [], colors: [{ar: 'أسود', fr: 'Noir', hex: '#211B20', image: ''}]});
    await FB_API.saveRates([{wilaya_code: 34, scope: 0, home_price: 400, desk_price: 250, home_available: true, desk_available: true}]);
  });
  const order = (phone, extra = {}) => a.evaluate(async ([phone, extra]) => {
    const c = await FB_API.communes(34);
    try { return await FB_API.placeOrder({idempotency_key: crypto.randomUUID(), first_name: 'نسرين', last_name: 'بوزيد', phone, wilaya: 34, commune_id: c[0].id,
      delivery: 'desk', items: [{id: 'khimar', size: 'TU', color: 0, qty: 1}], ...extra}); } catch (e) { return {error: e.message}; }
  }, [phone, extra]);
  const age = () => a.evaluate(() => { const k = 'fb34-demo-db', db = JSON.parse(localStorage.getItem(k)); db.orders.forEach(o => o.created_at = new Date(Date.now() - 120000).toISOString()); localStorage.setItem(k, JSON.stringify(db)); });

  ok((await order('0661111111', {hp: 'http://spam.example'})).error === 'invalid:request', 'hidden field filled (robot): refused');
  ok(!!(await order('0661111111')).tracking_code, 'first order from a number: accepted');
  ok((await order('0661111111')).error === 'limit:wait', 'same number again within a minute: refused');
  await age(); await order('0661111111'); await age(); await order('0661111111'); await age();
  ok((await order('0661111111')).error === 'limit:open', '3 orders still waiting for the call: a 4th is refused');

  // what the customer sees
  const st = await ctx.newPage(); await st.goto(BASE); await st.waitForTimeout(1200);
  const checkout = async phone => {
    await st.locator('#shop').scrollIntoViewIfNeeded(); await st.waitForTimeout(300);
    await st.click('.card [data-buy]'); await st.waitForTimeout(600);
    await st.fill('#f_first', 'نسرين'); await st.fill('#f_last', 'بوزيد'); await st.fill('#f_phone', phone);
    await st.fill('#f_wilaya', '34'); await st.waitForTimeout(200); await st.keyboard.press('Enter'); await st.waitForTimeout(500);
    await st.click('#f_commune'); await st.waitForTimeout(200); await st.keyboard.press('ArrowDown'); await st.keyboard.press('Enter'); await st.waitForTimeout(200);
    await st.click('#f_delivery label:nth-child(2)'); await st.click('#coNext'); await st.waitForTimeout(300); await st.click('#coConfirm'); await st.waitForTimeout(1200);
  };
  await checkout('0661111111');
  ok((await st.textContent('.box-err')).includes('قيد التأكيد') && await st.locator('#coRetry').count() === 0, 'customer with 3 waiting orders: a kind message, no "retry" button');
  await st.screenshot({path: OUT + 'limit-open.png'});
  await st.click('#coClose'); await st.waitForTimeout(400);
  ok(await st.evaluate(() => !JSON.stringify(localStorage).includes('spam')) && await st.$eval('#f_hp', e => 0).catch(() => true), 'hidden field never saved in the form draft');

  // the dashboard hears a new order placed in another tab
  await a.reload(); await a.waitForTimeout(1000); await a.click('[data-tab=orders]'); await a.waitForTimeout(600);
  const title0 = await a.title();
  await checkout('0662222222');
  await a.waitForTimeout(1500);
  const seen = {title: await a.title(), toast: await a.textContent('#toast'), listed: (await a.textContent('#main')).includes('0662222222')};
  ok(seen.title.startsWith('(1) طلب جديد') && seen.toast.includes('طلب جديد') && seen.listed,
    'dashboard open in another tab: chime, "new order" toast, count in the tab title, list updated ' + JSON.stringify(seen));
  await st.click('#coClose').catch(() => {}); await st.waitForTimeout(300);

  // block the number from its order
  const id = await a.evaluate(() => { const d = [...document.querySelectorAll('.order')].find(x => x.textContent.includes('0662222222')); d.open = true; return d.dataset.id; });
  await a.waitForTimeout(200);
  await a.click(`[data-block="${id}"]`); await a.click(`[data-block="${id}"]`); await a.waitForTimeout(800);
  ok((await a.textContent('#main')).includes('رقم محظور') && (await a.textContent('#main')).includes('الأرقام المحظورة'), 'dashboard: number blocked, marked, listed');
  ok(await a.evaluate(async id => (await FB_API.adminLoad()).orders.find(o => o.id === +id).status, id) === 'cancelled', 'its order cancelled (pieces back in stock)');
  await a.screenshot({path: OUT + 'blocked-admin.png', fullPage: true});
  await st.reload(); await st.waitForTimeout(1000);
  await checkout('0662222222');
  ok((await st.textContent('.box-err')).includes('واتساب') && !(await st.textContent('.box-err')).includes('محظور'), 'blocked number: a neutral message (never says "blocked")');
  await st.click('#coClose'); await st.waitForTimeout(300);
  await a.evaluate(() => document.querySelector('.box summary')?.click()); await a.waitForTimeout(200);
  await a.click('[data-unblock="0662222222"]'); await a.waitForTimeout(600);
  ok(!(await a.evaluate(async () => (await FB_API.adminLoad()).blocked.length)), 'block lifted from the dashboard');

  // notification settings page (demo: explained, checks the token format)
  await a.click('[data-tab=site]'); await a.waitForTimeout(800);
  ok((await a.textContent('#notifyBox')).includes('BotFather') && (await a.textContent('#notifyBox')).includes('وضع التجربة'), 'settings: Telegram steps shown; demo says messages start with Supabase');
  await a.fill('#n-token', '12345'); await a.click('#n-save'); await a.waitForTimeout(300);
  ok((await a.textContent('#toast')).includes('رمز البوت غير صحيح'), 'malformed bot token refused in the form');
  await a.locator('#notifyBox').scrollIntoViewIfNeeded(); await a.screenshot({path: OUT + 'notify-settings.png'});
} catch (e) { results.push('FAIL test stopped: ' + e.message.split('\n')[0]); }
console.log(results.join('\n'));
console.log(`\n${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
console.log('page errors:', errs.length ? errs : 'none');
await b.close();
