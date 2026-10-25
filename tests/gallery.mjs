// Photo features: gallery swipe and dots, full-screen zoom, colour cross-fade, fade-in on load,
// second photo on hover, fly-to-cart, and multi-photo upload in the dashboard. Demo mode.
// Run: node tests/netlify-local.mjs &  then  node tests/gallery.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8888/';
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m); const errs = [];
const DEMO_CONFIG = r => r.fulfill({contentType: 'text/javascript', body: 'window.FB_CONFIG={DEMO_PASSWORD_SHA256:"cd782a4fb4e7c57fcab4debf1a47b4e4052d9dd02cdd1fade914b9d7fbeb8221"}'});
// four distinct test photos drawn in the page (front, back, detail, navy colour)
const makePhotos = () => ['#C9B194', '#8C7768', '#B3858A', '#25314A'].map((c, i) => {
  const cv = document.createElement('canvas'); cv.width = 300; cv.height = 400; const x = cv.getContext('2d');
  x.fillStyle = c; x.fillRect(0, 0, 300, 400); x.fillStyle = '#fff'; x.font = 'bold 60px sans-serif'; x.fillText(String(i + 1), 130, 220);
  return cv.toDataURL('image/png');
});
const b = await chromium.launch();
try {
  const ctx = await b.newContext({viewport: {width: 1280, height: 860}});
  await ctx.route('**/assets/config.js', DEMO_CONFIG);
  ctx.on('page', p => p.on('pageerror', e => errs.push(e.message)));
  const p = await ctx.newPage();
  await p.goto(BASE); await p.waitForTimeout(1200);
  await p.evaluate(async (mk) => {
    const ph = eval(mk)();
    await FB_API.saveProduct({id: 'loulou', category: 'dress', type: 'dress', price: 14500, compare_price: null, badge: null, cost: 0,
      name: {ar: 'فستان اللؤلؤة', fr: "Robe Loulou'a"}, description: {ar: '', fr: ''}, sizes: ['M', 'L'], stock: null, active: true, sort: 0,
      image: ph[0], images: [ph[1], ph[2]],
      colors: [{ar: 'شمباني', fr: 'Champagne', hex: '#C9B194', image: ''}, {ar: 'كحلي', fr: 'Marine', hex: '#25314A', image: ph[3]}]});
  }, `(${makePhotos})`);
  await p.reload(); await p.waitForTimeout(1500);

  await p.locator('#shop').scrollIntoViewIfNeeded(); await p.waitForTimeout(1200);  // the products sit below the scrolling film; their photos load as they come near
  ok(await p.locator('.card .frame img.alt').count() === 1, 'card carries the second photo for hover');
  ok(await p.evaluate(() => [...document.querySelectorAll('.card .frame img')].every(i => i.classList.contains('l'))), 'photos marked loaded (fade-in done)');
  const altBefore = await p.$eval('.card .frame img.alt', e => getComputedStyle(e).opacity);
  await p.hover('.card-media'); await p.waitForTimeout(700);
  const altAfter = await p.$eval('.card .frame img.alt', e => getComputedStyle(e).opacity);
  ok(altBefore === '0' && altAfter === '1', `second photo appears on hover (opacity ${altBefore} -> ${altAfter})`);

  await p.click('.card-media'); await p.waitForTimeout(600);
  ok(await p.locator('#qTrack .slide').count() === 3 && await p.locator('#qDots i').count() === 3, 'gallery: 3 photos, 3 dots');
  ok(await p.isVisible('#qGal .gal-nav.next'), 'arrows shown on desktop when there are several photos');
  await p.click('#qGal .gal-nav.next'); await p.waitForTimeout(700);
  ok(await p.$eval('#qDots', d => [...d.children].findIndex(i => i.classList.contains('on'))) === 1, 'next arrow moves to photo 2 and the dot follows');
  await p.click('#qColors label:nth-child(2)'); await p.waitForTimeout(80);
  const fading = await p.$eval('#qTrack', t => t.classList.contains('fade'));
  await p.waitForTimeout(500);
  ok(fading && await p.locator('#qTrack .slide').count() === 4 && (await p.getAttribute('#qTrack .slide img', 'src')).length > 100, 'colour change cross-fades to the colour photo first (4 photos)');

  await p.click('#qTrack .slide >> nth=0'); await p.waitForTimeout(500);
  ok(await p.isVisible('#zoom') && (await p.textContent('#zoomCount')).includes('1'), 'tapping a photo opens it full screen');
  const box = await p.locator('#zoomImg').boundingBox();
  await p.mouse.dblclick(box.x + box.width * .5, box.y + box.height * .4); await p.waitForTimeout(200);
  const t1 = await p.$eval('#zoomImg', i => i.style.transform);
  ok(/scale\(2\.5\)/.test(t1), 'double tap zooms in (' + t1 + ')');
  await p.mouse.move(box.x + box.width * .5, box.y + box.height * .4); await p.mouse.down(); await p.mouse.move(box.x + box.width * .3, box.y + box.height * .3, {steps: 5}); await p.mouse.up();
  ok(await p.$eval('#zoomImg', i => i.style.transform) !== t1, 'drag moves around the zoomed photo');
  await p.mouse.dblclick(box.x + box.width * .5, box.y + box.height * .5); await p.waitForTimeout(200);
  ok(/scale\(1\)/.test(await p.$eval('#zoomImg', i => i.style.transform)), 'double tap again zooms back out');
  await p.click('#zoomNext'); await p.waitForTimeout(200);
  ok((await p.textContent('#zoomCount')).includes('2'), 'next photo in full screen');
  await p.click('#zoomClose'); await p.waitForTimeout(500);
  ok(!(await p.isVisible('#zoom')) && await p.isVisible('#quick'), 'closing full screen returns to the product');

  await p.click('#qSizes label:has(input[value="M"])');
  await p.click('#qAdd');
  await p.waitForTimeout(450);
  ok(await p.locator('.fly').count() === 1, 'a photo flies to the cart');
  await p.waitForTimeout(800);
  ok(await p.locator('.fly').count() === 0 && await p.textContent('#cartCount') === '1', 'it lands, the cart shows 1');

  // dashboard: several extra photos, reorder, delete
  const a = await ctx.newPage();
  await a.goto(BASE + 'admin.html'); await a.fill('#pw', 'Fam20@'); await a.click('#loginBtn'); await a.waitForTimeout(700);
  await a.click('[data-tab=products]'); await a.waitForTimeout(300); await a.click('[data-edit=loulou]'); await a.waitForTimeout(400);
  ok(await a.locator('.extra').count() === 2, 'editor lists the 2 extra photos');
  const files = await a.evaluate(async (mk) => eval(mk)().slice(0, 2).map(u => u.split(',')[1]), `(${makePhotos})`);
  await a.setInputFiles('input[data-up="extra"]', files.map((d, i) => ({name: `p${i}.png`, mimeType: 'image/png', buffer: Buffer.from(d, 'base64')})));
  await a.waitForTimeout(1500);
  ok(await a.locator('.extra').count() === 4, 'two photos uploaded at once (now 4)');
  const first = await a.getAttribute('.extra >> nth=0 >> img', 'src');
  await a.click('.extra >> nth=0 >> [data-d="1"]'); await a.waitForTimeout(200);
  ok(await a.getAttribute('.extra >> nth=1 >> img', 'src') === first, 'reorder moves a photo');
  await a.click('.extra >> nth=3 >> [data-rmx]'); await a.waitForTimeout(200);
  await a.click('#edSave'); await a.waitForTimeout(600);
  await p.reload(); await p.waitForTimeout(1500); await p.click('.card-media'); await p.waitForTimeout(600);
  ok(await p.locator('#qTrack .slide').count() === 4, 'store gallery follows the dashboard (main + 3 extra)');

  // phone: swipe through the gallery
  const m = await b.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  await m.route('**/assets/config.js', DEMO_CONFIG);
  const mp = await m.newPage(); mp.on('pageerror', e => errs.push('mobile ' + e.message));
  await mp.goto(BASE); await mp.waitForTimeout(800);
  await mp.evaluate(async (mk) => { const ph = eval(mk)(); await FB_API.saveProduct({id: 'x', category: 'dress', type: 'dress', price: 5000, cost: 0, name: {ar: 'تجربة', fr: 'Test'}, description: {ar: '', fr: ''}, sizes: ['M'], stock: null, active: true, sort: 0, image: ph[0], images: [ph[1], ph[2]], colors: [{ar: 'بيج', fr: 'Beige', hex: '#C9B194', image: ''}]}); }, `(${makePhotos})`);
  await mp.reload(); await mp.waitForTimeout(1500);
  await mp.tap('.card-media'); await mp.waitForTimeout(600);
  ok(!(await mp.isVisible('#qGal .gal-nav.next')), 'no arrows on the phone: swipe instead');
  await mp.$eval('#qTrack', t => t.querySelectorAll('.slide')[2].scrollIntoView({inline: 'center', behavior: 'instant'})); await mp.waitForTimeout(500);
  ok(await mp.$eval('#qDots', d => [...d.children].findIndex(i => i.classList.contains('on'))) === 2, 'swiping to photo 3 moves the dot');
  ok(await mp.evaluate(() => document.documentElement.scrollWidth) <= 390, 'no sideways page scroll on the phone');
  await mp.screenshot({path: (process.env.OUT || '/tmp') + '/gallery-phone.png'});
  await mp.tap('#qTrack .slide >> nth=2'); await mp.waitForTimeout(500);
  ok(await mp.isVisible('#zoom'), 'phone: tap opens full screen');
  await mp.screenshot({path: (process.env.OUT || '/tmp') + '/zoom-phone.png'});
} catch (e) { results.push('FAIL test stopped: ' + e.message.split('\n')[0]); }
console.log(results.join('\n'));
console.log(`\n${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
console.log('page errors:', errs.length ? errs : 'none');
await b.close();
