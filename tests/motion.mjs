// The light touches: grey card shapes while the collection loads, cards rising one after another as they come
// into view, and the cart answering when a piece is added. Real browser; the catalog comes from a stand-in
// Supabase that answers slowly, so the loading state can be seen.
// Run: node tests/netlify-local.mjs &  then  node tests/motion.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8888/';
const OUT = (process.env.OUT || '/tmp') + '/';
const SB = 'https://fbtest.supabase.co';
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m); const errs = [];
const cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*'};
const P = (id, i) => ({id, name: {ar: 'قطعة ' + i, fr: 'Pièce ' + i}, description: {ar: '', fr: ''}, category: 'abaya', type: 'abaya', price: 5000 + i * 100, compare_price: null, badge: null,
  colors: [{ar: 'أسود', fr: 'Noir', hex: '#211B20', image: ''}], sizes: ['TU'], stock: null, image: '', images: [], active: true, sort: i, created_at: new Date(Date.now() - i * 1000).toISOString()});
const products = Array.from({length: 8}, (_, i) => P('p' + i, i));
async function handle(route){
  const req = route.request(), path = new URL(req.url()).pathname;
  if (req.method() === 'OPTIONS') return route.fulfill({status: 204, headers: cors});
  const json = (d, ms = 0) => new Promise(r => setTimeout(r, ms)).then(() => route.fulfill({status: 200, headers: {...cors, 'Content-Type': 'application/json'}, body: JSON.stringify(d)}));
  if (path === '/rest/v1/products') return json(products, 2500);   // a slow connection
  if (path === '/rest/v1/settings') return json(req.headers()['accept']?.includes('vnd.pgrst.object') ? {data: {}} : [{data: {}}]);
  return json([]);
}
const b = await chromium.launch();
async function ctxWith(opts = {}){
  const ctx = await b.newContext({viewport: {width: 1280, height: 860}, ...opts});
  await ctx.addInitScript(() => { addEventListener('DOMContentLoaded', () => { const s = document.getElementById('splash'); if (s) s.remove(); }); });
  await ctx.route('**/assets/config.js', r => r.fulfill({contentType: 'text/javascript', body: `window.FB_CONFIG={SUPABASE_URL:"${SB}",SUPABASE_ANON_KEY:"sb_publishable_testkey123"}`}));
  await ctx.route(SB + '/**', handle);
  ctx.on('page', p => p.on('pageerror', e => errs.push(e.message)));
  return ctx;
}
const toShop = p => p.evaluate(() => { const s = document.querySelector('#shop'); scrollTo({top: s.offsetTop - 80, behavior: 'instant'}); });
try {
  let ctx = await ctxWith(); let p = await ctx.newPage();
  await p.goto(BASE); await p.waitForTimeout(400); await toShop(p); await p.waitForTimeout(300);
  const sk = await p.evaluate(() => ({n: document.querySelectorAll('#grid .skel').length, sr: document.querySelector('#grid .sr')?.textContent || '',
    moving: getComputedStyle(document.querySelector('#grid .skel i')).animationName}));
  ok(sk.n === 4 && sk.sr.includes('جارٍ تحميل') && sk.moving === 'sweep', 'while the collection loads: 4 grey card shapes with a light sweeping across (the sentence stays for screen readers)');
  await p.screenshot({path: OUT + 'motion-skeleton.png'});
  await p.waitForTimeout(3000);
  ok(await p.locator('#grid .skel').count() === 0 && await p.locator('#grid .card').count() === 8, 'once loaded: the shapes give way to the 8 pieces');
  // the cards rise one after another
  await p.evaluate(() => scrollTo({top: 0, behavior: 'instant'})); await p.waitForTimeout(200);
  await p.evaluate(() => document.querySelector('#langBtn').click()); await p.waitForTimeout(100);   // a fresh render of the grid, out of view
  await p.evaluate(() => document.querySelector('#langBtn').click()); await p.waitForTimeout(300);
  const hidden = await p.evaluate(() => [...document.querySelectorAll('#grid .card')].filter(c => !c.classList.contains('in')).length);
  ok(hidden === 8, 'out of view: the cards wait, not shown yet');
  await toShop(p); await p.waitForTimeout(150);
  const mid = await p.evaluate(() => [...document.querySelectorAll('#grid .card.in')].map(c => [getComputedStyle(c).transitionDelay.split(',')[0], +getComputedStyle(c).opacity]));  // two transitions per card: one delay each
  ok(mid.length >= 4 && mid[0][0] === '0s' && mid[1][0] === '0.07s' && mid[3][0] === '0.21s' && mid.some(([, o]) => o < 1),
    `scrolled to the collection: the cards rise in a cascade (delays ${mid.slice(0, 4).map(m => m[0]).join(', ')})`);
  await p.waitForTimeout(1200);
  ok(await p.evaluate(() => [...document.querySelectorAll('#grid .card.in')].every(c => getComputedStyle(c).opacity === '1' && getComputedStyle(c).transform === 'none')), 'after the cascade: every card in place, fully visible');
  // the cart answers
  await p.click('#grid [data-add="p0"]'); await p.waitForTimeout(120);
  const cart = await p.evaluate(() => ({got: document.querySelector('#cartBtn').classList.contains('got'), anim: getComputedStyle(document.querySelector('#cartBtn')).animationName,
    pop: getComputedStyle(document.querySelector('#cartCount')).animationName, n: document.querySelector('#cartCount').textContent}));
  ok(cart.got && cart.anim === 'ring' && cart.pop === 'bump' && cart.n === '1', 'add to cart: the counter pops to 1, a soft ring spreads around the bag');
  await p.screenshot({path: OUT + 'motion-cart.png', clip: {x: 0, y: 0, width: 360, height: 140}});

  // opening a piece: its photo glides from the grid into the window (a brief ghost), then the window is open with its gallery shown
  await p.click('#grid [data-open="p0"]'); await p.waitForTimeout(120);
  const z = await p.evaluate(() => { const g = document.querySelector('.zoom-ghost'); return {ghost: !!g, zooming: document.querySelector('#quick').classList.contains('zooming'), open: document.querySelector('#quick').open}; });
  ok(z.ghost && z.zooming && z.open, 'open a piece: its photo flies from the grid into the window (zoom)');
  await p.waitForTimeout(700);
  const after = await p.evaluate(() => ({ghostGone: !document.querySelector('.zoom-ghost'), galVisible: getComputedStyle(document.querySelector('#qGal')).opacity === '1', clean: !document.querySelector('#quick').classList.contains('zooming'), open: document.querySelector('#quick').open}));
  ok(after.ghostGone && after.galVisible && after.clean && after.open, 'the zoom settles: the window is open, its gallery shown, nothing left over');
  await p.evaluate(() => document.querySelector('#quick').close());
  await ctx.close();

  // less motion wanted: no rising, no sweeping
  ctx = await ctxWith({reducedMotion: 'reduce'}); p = await ctx.newPage();
  await p.goto(BASE); await p.waitForTimeout(400); await toShop(p);
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('#grid .skel i')).animationName) === 'none', 'reduced motion: the grey shapes stay still');
  await p.waitForTimeout(3000); await p.evaluate(() => scrollTo({top: 0, behavior: 'instant'}));
  ok(await p.evaluate(() => [...document.querySelectorAll('#grid .card')].every(c => getComputedStyle(c).opacity === '1')), 'reduced motion: cards shown at once, without rising');
  await p.click('#grid [data-open="p0"]'); await p.waitForTimeout(150);
  ok(!(await p.evaluate(() => !!document.querySelector('.zoom-ghost'))) && await p.evaluate(() => document.querySelector('#quick').open), 'reduced motion: a piece opens at once, no flying photo');
  await ctx.close();
} catch (e) { results.push('FAIL test stopped: ' + e.message.split('\n')[0]); }
console.log(results.join('\n'));
console.log(`\n${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
console.log('page errors:', errs.length ? errs : 'none');
await b.close();
