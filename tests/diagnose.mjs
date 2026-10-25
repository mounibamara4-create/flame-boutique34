// The owner's "connection check" on the login page, against a stand-in Supabase in three states:
// healthy, wrong key, and a project where setup.sql was never run. The real supabase-js runs in the browser.
// Run: node tests/netlify-local.mjs &  then  node tests/diagnose.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8888/';
const OUT = (process.env.OUT || '/tmp') + '/';
const SB = 'https://ylsdqltrjrclzwngsgpi.supabase.co';
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m); const errs = [];
const cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*'};
const counts = {wilayas: 69, communes: 1541, products: 3, shipping_rates: 0};

function server(state){
  return async route => {
    const req = route.request(), u = new URL(req.url()), path = u.pathname;
    if (req.method() === 'OPTIONS') return route.fulfill({status: 204, headers: cors});
    const json = (data, status = 200, extra = {}) => route.fulfill({status, headers: {...cors, 'Content-Type': 'application/json', ...extra}, body: JSON.stringify(data)});
    if (state === 'badkey') return json({message: 'Invalid API key', hint: 'Double check your Supabase `anon` or `service_role` API key.'}, 401);
    const table = path.replace('/rest/v1/', '');
    if (state === 'nosetup' && path.startsWith('/rest/v1/')) return json({code: path.includes('/rpc/') ? 'PGRST202' : 'PGRST205', message: `Could not find the ${path.includes('/rpc/') ? 'function' : 'table'} 'public.${table}' in the schema cache`}, 404);
    if (req.method() === 'HEAD') return route.fulfill({status: 200, headers: {...cors, 'Content-Range': `*/${counts[table] ?? 0}`}, body: ''});
    if (path === '/rest/v1/rpc/place_order') return json({code: 'P0001', message: 'invalid:request'}, 400);
    if (path === '/rest/v1/rpc/track_order') return json(null);
    if (path.startsWith('/storage/v1/object/list/products')) return json([]);
    if (path.startsWith('/rest/v1/')) return json([]);
    return json({message: 'not mocked'}, 404);
  };
}
const b = await chromium.launch();
try {
  for (const state of ['healthy', 'badkey', 'nosetup']) {
    const ctx = await b.newContext({viewport: {width: 1280, height: 900}});
    await ctx.route(SB + '/**', server(state));   // the real assets/config.js is used: the project's own URL and key
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(state + ' ' + e.message));
    await p.goto(BASE + 'admin.html'); await p.waitForTimeout(800);
    await p.click('#diagBtn'); await p.waitForSelector('#diag li:not(.wait)', {timeout: 8000}); await p.waitForTimeout(300);
    const text = await p.textContent('#diag'), bad = await p.locator('#diag li.bad').count();
    if (state === 'healthy') {
      ok(bad === 0 && text.includes('الاتصال سليم') && text.includes('69 ولاية') && text.includes('1541 بلدية') && text.includes('3 قطعة') && text.includes('لم تُدخل أسعار التوصيل'),
        'healthy project: every step ticked, "connection OK", with a note that delivery prices are not set yet');
      ok(text.includes('ylsdqltrjrclzwngsgpi') && text.includes('sb_publishable_'), 'shows the project and key in use (from config.js)');
      await p.screenshot({path: OUT + 'diagnose-healthy.png'});
    }
    if (state === 'badkey') ok(text.includes('المفتاح غير مقبول') && text.includes('Invalid API key') && !text.includes('جدول الولايات'), 'wrong key: says to copy the publishable key, stops there');
    if (state === 'nosetup') { ok(text.includes('الجداول غير موجودة') && text.includes('setup.sql'), 'setup.sql not run: says to run it'); await p.screenshot({path: OUT + 'diagnose-nosetup.png'}); }
    await ctx.close();
  }
} catch (e) { results.push('FAIL test stopped: ' + e.message.split('\n')[0]); }
console.log(results.join('\n'));
console.log(`\n${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
console.log('page errors:', errs.length ? errs : 'none');
await b.close();
