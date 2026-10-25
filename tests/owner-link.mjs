// The "owner page" button in the footer: visible on desktop and phone, opens admin.html (no 404),
// and the dashboard stays locked until the owner signs in. Runs against dist/ served like Netlify.
// Run: node tests/netlify-local.mjs &  then  node tests/owner-link.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8888/';
const OUT = (process.env.OUT || '/tmp') + '/';
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m); const errs = [];
const b = await chromium.launch();
try {
  for (const [label, opts] of [['desktop', {viewport: {width: 1280, height: 860}}], ['phone', {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true}]]) {
    const ctx = await b.newContext(opts);
    // the real config (live mode); Supabase itself is not reachable from the test machine, so its calls are answered empty
    await ctx.route(/supabase\.co/, r => r.fulfill({status: 200, contentType: 'application/json', body: '[]'}));
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(label + ' ' + e.message));
    await p.goto(BASE); await p.waitForTimeout(1200);
    const btn = p.locator('footer a.owner-link');
    await btn.scrollIntoViewIfNeeded();
    ok(await btn.isVisible() && await btn.getAttribute('href') === 'admin.html', `${label}: footer button visible, relative link admin.html`);
    const box = await btn.boundingBox();
    ok(box && box.height >= 40 && box.x >= 0 && box.x + box.width <= opts.viewport.width, `${label}: button easy to tap and inside the screen (${Math.round(box.width)}×${Math.round(box.height)})`);
    await p.screenshot({path: OUT + `owner-link-${label}.png`});
    const [resp] = await Promise.all([p.waitForNavigation(), label === 'phone' ? btn.tap() : btn.click()]);
    ok(resp.status() === 200 && p.url().endsWith('/admin.html'), `${label}: opens admin.html with status ${resp.status()} (not 404)`);
    await p.waitForTimeout(1000);
    ok(await p.isVisible('#loginForm') && await p.isHidden('#app'), `${label}: login form shown, dashboard hidden`);
    ok(await p.isVisible('#em') && await p.isVisible('#pw'), `${label}: asks for the owner email and password (Supabase login, unchanged)`);
    await ctx.close();
  }
  // the page is served by the same rules Netlify uses (_headers): not indexed, never cached
  const r = await fetch(BASE + 'admin.html');
  ok(r.status === 200 && /noindex/.test(r.headers.get('x-robots-tag') || '') && /no-store/.test(r.headers.get('cache-control') || ''), 'admin.html served: 200, noindex, no-store');
} catch (e) { results.push('FAIL test stopped: ' + e.message.split('\n')[0]); }
console.log(results.join('\n'));
console.log(`\n${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
console.log('page errors:', errs.length ? errs : 'none');
await b.close();
