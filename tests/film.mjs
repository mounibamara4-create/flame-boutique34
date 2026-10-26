// The boutique film moved forward by scrolling: pinned on screen, the scroll position picks the picture
// (120 pictures made from the video); at its end the bars and the store appear. Palette from the video,
// water background kept. Phone and computer sizes, old browsers without WebP. Demo mode.
// Run: node tests/netlify-local.mjs &  then  node tests/film.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8888/';
const OUT = (process.env.OUT || '/tmp') + '/';
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m); const errs = [];
const DEMO_CONFIG = r => r.fulfill({contentType: 'text/javascript', body: 'window.FB_CONFIG={DEMO_PASSWORD_SHA256:"cd782a4fb4e7c57fcab4debf1a47b4e4052d9dd02cdd1fade914b9d7fbeb8221"}'});
const b = await chromium.launch();
async function context(opts = {viewport: {width: 1280, height: 800}}){
  const ctx = await b.newContext(opts);
  await ctx.route('**/assets/config.js', DEMO_CONFIG);
  ctx.on('page', p => p.on('pageerror', e => errs.push(e.message)));
  return ctx;
}
const st = p => p.evaluate(() => {
  const cv = document.querySelector('#filmCanvas'), film = document.querySelector('#film'), bar = document.querySelector('#topbar');
  const pin = document.querySelector('.film-pin').getBoundingClientRect(), c = document.querySelector('#cartBtn').getBoundingClientRect();
  const at = document.elementFromPoint(c.x + c.width / 2, c.y + c.height / 2);
  return {t: cv && cv.dataset.frame != null ? +cv.dataset.frame : null, set: cv ? cv.dataset.set : null, dur: cv && cv.dataset.last ? +cv.dataset.last : 119, fill: document.querySelector('.film-pin').classList.contains('fill'), ready: !!cv && cv.dataset.ready === '1', canvasW: cv ? cv.width : 0,
    pinTop: Math.round(pin.top), pinH: Math.round(pin.height), filmH: film.offsetHeight, y: Math.round(scrollY), end: film.offsetTop + film.offsetHeight - innerHeight,
    bar: bar.classList.contains('show') && getComputedStyle(bar).opacity === '1', cart: !!at && !!at.closest('#cartBtn'), fab: getComputedStyle(document.querySelector('#fab')).opacity};
});
const go = async (p, y, wait = 1200) => { await p.evaluate(y => scrollTo({top: y, behavior: 'instant'}), y); await p.waitForTimeout(wait); return st(p); };
try {
  const req = [];
  let ctx = await context();
  ctx.on('request', r => req.push(new URL(r.url()).pathname));
  const s0 = await ctx.newPage(); await s0.goto(BASE + 'admin.html'); await s0.fill('#pw', 'Fam20@'); await s0.click('#loginBtn'); await s0.waitForTimeout(600);
  await s0.addScriptTag({path: new URL('./fixtures/products.js', import.meta.url).pathname});
  await s0.evaluate(async () => { for (const p of window.FB_TEST_PRODUCTS.slice(0, 4)) await FB_API.saveProduct(JSON.parse(JSON.stringify(p))); }); await s0.close();

  let p = await ctx.newPage(); await p.goto(BASE); await p.waitForTimeout(2500);
  let s = await st(p);
  ok(s.pinTop === 0 && s.pinH === 800 && s.ready && s.t === 0 && await p.locator('#film video, #film audio').count() === 0, `arrival: the film alone on screen at its first picture; no video or sound element at all`);
  ok(s.canvasW === 1280, 'computer: drawn at the screen size');
  ok(await p.$eval('#filmBg', c => getComputedStyle(c).display === 'none') && s.set === 'l', 'computer: the wide video, filling the screen (no blurred copy)');
  // social links and shop location sit right under the film, not in the top bar
  ok(await p.evaluate(() => { const b = document.querySelector('.social-bar'); return b.classList.contains('under-film') && b.previousElementSibling.id === 'film' && !b.closest('#topbar')
    && !!b.querySelector('a.soc-map[href*="google.com/maps"]') && !!b.querySelector('a[href*="instagram.com"]'); }), 'social links and the shop location are right under the film');
  ok(!s.bar && !s.cart && s.fab === '0', 'arrival: menu, cart and WhatsApp hidden');
  const pics = req.filter(u => u.includes('/assets/film/'));
  ok(pics.length >= 100 && pics.every(u => u.includes('/film/l/') && u.endsWith('.webp')) && !req.some(u => /\.(mp4|webm)$|hero/.test(u)), `computer: large WebP pictures load (${pics.length} so far); no video files, no roses video`);
  await p.screenshot({path: OUT + 'scroll-0.png'});
  const run = s.end;
  s = await go(p, run * .25); const t25 = s.t;
  ok(s.pinTop === 0 && Math.abs(t25 - s.dur * .25) <= 2 && !s.bar, `scroll a quarter: film pinned, at picture ${t25} of 119, bars still hidden`);
  await p.screenshot({path: OUT + 'scroll-25.png'});
  s = await go(p, run * .6); const t60 = s.t;
  ok(t60 > t25 && Math.abs(t60 - s.dur * .6) <= 2, `scroll further: film moves forward (picture ${t60})`);
  await p.screenshot({path: OUT + 'scroll-60.png'});
  s = await go(p, run * .3);
  ok(s.t < t60 && Math.abs(s.t - s.dur * .3) <= 2, `scroll back up: film goes back (picture ${s.t})`);
  // smooth wheel scrolling, like a visitor
  await p.mouse.move(640, 400); const before = (await st(p)).t;
  for (let i = 0; i < 6; i++){ await p.mouse.wheel(0, 120); await p.waitForTimeout(60); }
  await p.waitForTimeout(800);
  ok((await st(p)).t >= before + 2, 'mouse wheel moves the film forward');
  s = await go(p, run);
  ok(s.t >= 118 && s.bar && s.cart && s.fab === '1', `end of the film (picture ${s.t}): bars, cart and WhatsApp appear`);
  await p.screenshot({path: OUT + 'scroll-end.png'});
  s = await go(p, run + 700, 1000);
  const lines = await p.$eval('#brandLines', el => el.innerText);
  ok(lines.includes('FLAME BOUTIQUE 34') && lines.includes('حَقٌّ لِلْجَمَالِ عَلَيْكِ أَنْ يَزْهُو') && await p.$eval('#brandLines', e => e.classList.contains('reveal')), 'after the film: brand name and lines');
  await p.locator('#shop').scrollIntoViewIfNeeded(); await p.waitForTimeout(600);
  ok(await p.locator('.card').count() === 4 && await p.isVisible('.card'), 'then the products');
  await p.screenshot({path: OUT + 'scroll-store.png'});
  await p.click('#cartBtn'); await p.waitForTimeout(500);
  ok(await p.isVisible('#drawer'), 'cart opens');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  // palette and the still marble background
  const look = await p.evaluate(() => ({linen: getComputedStyle(document.documentElement).getPropertyValue('--linen').trim(), btn: getComputedStyle(document.querySelector('.btn-primary')).backgroundColor,
    body: getComputedStyle(document.body).backgroundColor, ripple: !!document.querySelector('#ripple'), grain: getComputedStyle(document.body, '::after').backgroundImage, page: getComputedStyle(document.body).backgroundImage}));
  ok(look.linen === '#EADCC6' && look.body === 'rgb(234, 220, 198)' && look.btn === 'rgb(107, 74, 43)', `colours measured from the films: golden sand ground ${look.body}, caramel buttons ${look.btn}`);
  ok(!look.ripple && look.grain.includes('svg') && look.page.includes('gradient'), 'the background is a still CSS marble texture, no water canvas');
  // a tap on the film glides to the store
  await go(p, 0, 600); await p.click('#film'); await p.waitForTimeout(2500);
  s = await st(p);
  ok(s.y >= run && s.bar, 'a tap on the video glides to the store');
  await ctx.close();

  // less motion wanted: one still screen, no scrubbing
  ctx = await context({viewport: {width: 1280, height: 800}, reducedMotion: 'reduce'});
  p = await ctx.newPage(); await p.goto(BASE); await p.waitForTimeout(1000);
  s = await st(p);
  ok(s.filmH === 800 && s.t === null && await p.isVisible('.film-pin img:not(.film-bg)'), 'reduced motion: a single still picture, no moving film');
  await ctx.close();

  // phone
  const phoneReq = [];
  ctx = await context({viewport: {width: 390, height: 844}, deviceScaleFactor: 3, isMobile: true, hasTouch: true, screen: {width: 390, height: 844}});
  ctx.on('request', r => phoneReq.push(new URL(r.url()).pathname));
  p = await ctx.newPage(); await p.goto(BASE); await p.waitForTimeout(2500);
  s = await st(p);
  const ph = phoneReq.filter(u => u.includes('/assets/film/'));
  ok(s.pinH === 844 && !s.bar && s.ready && ph.length && ph.every(u => u.includes('/film/p/')) && s.set === 'p', `phone held upright: the upright video (${ph.length} pictures so far)`);
  ok(s.canvasW === 585, 'phone: drawing at 1.5x the screen size (the pictures are 720 px wide: sharp, without the cost of 2x or 3x)');
  ok(Math.abs(s.filmH / 844 - 4.3) < 0.1, `phone: a short scroll for the upright film, quick to reach the store (${(s.filmH / 844).toFixed(1)} screens; computer: 3.4)`);
  ok(await p.locator('.film-skip').isVisible() && (await p.locator('.film-skip').textContent()).includes('تخطّي'), 'phone: a visible "skip intro" hint invites the visitor straight to the store');
  // the upright picture covers the whole canvas: every edge pixel is drawn (an empty band would be transparent)
  ok(s.fill && await p.$eval('#filmBg', c => getComputedStyle(c).display === 'none') && await p.$eval('#filmCanvas', c => { const d = c.getContext('2d'); return [[c.width / 2, 1], [c.width / 2, c.height - 2], [1, c.height / 2], [c.width - 2, c.height / 2], [1, 1], [c.width - 2, c.height - 2]].every(([x, y]) => d.getImageData(x, y, 1, 1).data[3] === 255); }),
    'phone: the upright video fills the whole screen, top to bottom (no bands, no blur)');
  // touch scrolling: a swipe moves the film
  const f0 = (await st(p)).t;
  await p.evaluate(() => scrollBy({top: 600, behavior: 'smooth'})); await p.waitForTimeout(1500);
  ok((await st(p)).t > f0 + 3, 'phone: a swipe moves the film');
  s = await go(p, s.end * .5);
  ok(Math.abs(s.t - s.dur * .5) <= 3 && s.dur === 199, `phone: half way down, half way through the upright film (picture ${s.t} of ${s.dur})`);
  await p.screenshot({path: OUT + 'scroll-phone-50.png'});
  s = await go(p, s.end + 300);
  ok(s.bar && s.cart, 'phone: at the end the bar and cart appear');
  await p.screenshot({path: OUT + 'scroll-phone-end.png'});
  ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 390, 'phone: no sideways scroll');
  await p.screenshot({path: OUT + 'social-under-film-phone.png'});
  // the phone is turned sideways: the wide video takes over, and back
  await go(p, 0, 400); await p.setViewportSize({width: 844, height: 390}); await p.waitForTimeout(1800);
  s = await go(p, (await st(p)).end * .5, 1500);
  ok(s.set === 's' && s.fill && Math.abs(s.t - s.dur * .5) <= 3, `phone turned sideways: the wide video, filling the screen (picture ${s.t})`);
  await p.setViewportSize({width: 390, height: 844}); await p.waitForTimeout(1500);
  s = await go(p, (await st(p)).end * .5, 1200);
  ok(s.set === 'p' && s.fill, 'phone upright again: the upright video');
  await ctx.close();

  // a tablet in landscape (large screen): large pictures, filling the screen
  const tabReq = [];
  ctx = await context({viewport: {width: 1180, height: 820}, deviceScaleFactor: 2, isMobile: true, hasTouch: true, screen: {width: 1180, height: 820}});
  ctx.on('request', r => tabReq.push(new URL(r.url()).pathname));
  p = await ctx.newPage(); await p.goto(BASE); await p.waitForTimeout(2000);
  s = await go(p, (await st(p)).end * .4);
  ok(tabReq.some(u => u.includes('/film/l/')) && Math.abs(s.t - 119 * .4) <= 2, `tablet: large pictures, film follows the scroll (picture ${s.t})`);
  await ctx.close();

  // slow connection (each picture takes 0.4 s): the film is usable early, coarse at first, then complete
  ctx = await context({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  await ctx.route(/\/assets\/film\//, async r => { await new Promise(res => setTimeout(res, 400)); await r.continue(); });
  p = await ctx.newPage(); const t0 = Date.now(); await p.goto(BASE); const loadMs = Date.now() - t0; await p.waitForTimeout(2500);
  ok(loadMs < 5000, `slow connection: the page finishes loading in ${(loadMs / 1000).toFixed(1)} s, not held by the film pictures`);
  const early = await p.$eval('#filmCanvas', c => +(c.dataset.loaded || 0));
  s = await go(p, (await st(p)).end * .5, 700);
  ok(early < 120 && s.t != null && Math.abs(s.t - s.dur * .5) <= 25, `slow connection: with ${early} of ${s.dur + 1} pictures arrived, the film already follows the scroll (picture ${s.t} for ${Math.round(s.dur / 2)})`);
  await p.waitForTimeout(9000); s = await go(p, (await st(p)).end * .5 + 1, 900);
  ok(Math.abs(s.t - s.dur * .5) <= 3, `slow connection: once all pictures arrive, the exact picture (${s.t})`);
  await ctx.close();

  // an old browser that cannot show WebP: JPG pictures instead, film still works
  const oldReq = [];
  ctx = await context({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  await ctx.route(/\.webp$/, r => r.fulfill({status: 415, body: ''}));
  await ctx.addInitScript(() => { const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src'); Object.defineProperty(HTMLImageElement.prototype, 'src', {set(v){ d.set.call(this, String(v).startsWith('data:image/webp') ? 'data:,' : v); }, get(){ return d.get.call(this); }}); });
  ctx.on('request', r => oldReq.push(new URL(r.url()).pathname));
  p = await ctx.newPage(); await p.goto(BASE); await p.waitForTimeout(2500);
  s = await go(p, (await st(p)).end * .5);
  ok(oldReq.some(u => u.endsWith('.jpg') && u.includes('/film/p/')) && !oldReq.some(u => u.endsWith('.webp')) && Math.abs(s.t - s.dur * .5) <= 3, `old browser without WebP: JPG pictures, film still follows the scroll (picture ${s.t})`);
  await ctx.close();
} catch (e) { results.push('FAIL test stopped: ' + e.message.split('\n')[0]); }
console.log(results.join('\n'));
console.log(`\n${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
console.log('page errors:', errs.length ? errs : 'none');
await b.close();
