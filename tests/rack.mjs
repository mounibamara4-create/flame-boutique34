// The rack: pieces with a photo without background hang side-on; one turns to face the visitor (pointer on a
// computer, the middle of the swiped rail on a phone); a tap brings it forward with its colours as hang tags and
// front/back; ordering continues with the colour chosen. Plus the rack photos in the product editor. Demo mode.
// The test pieces are the site's own garment drawings, turned into PNG pictures without background.
// Run: node tests/netlify-local.mjs &  then  node tests/rack.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8888/';
const OUT = (process.env.OUT || '/tmp') + '/';
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m); const errs = [];
const DEMO_CONFIG = r => r.fulfill({contentType: 'text/javascript', body: 'window.FB_CONFIG={DEMO_PASSWORD_SHA256:"cd782a4fb4e7c57fcab4debf1a47b4e4052d9dd02cdd1fade914b9d7fbeb8221"}'});
const b = await chromium.launch();
// draws a garment (FB.garment) on a transparent canvas: a stand-in for a real photo without background
const seed = async page => page.evaluate(async () => {
  const png = (type, hex, back) => new Promise(res => {
    const svg = FB.garment({type}, hex).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" ');
    const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = 400; c.height = 600; const x = c.getContext('2d');
      x.drawImage(im, 0, 0); if (back){ x.fillStyle = '#F4EADB'; x.font = 'bold 120px serif'; x.textAlign = 'center'; x.fillText('34', 200, 360); } res(c.toDataURL('image/png')); };
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  const L = (ar, fr) => ({ar, fr});
  const P = async (id, type, hex, name, price, i, extra = {}) => FB_API.saveProduct({id, category: 'abaya', type, price, compare_price: null, badge: null, cost: 0, name: L(name, name),
    description: L('', ''), sizes: ['S', 'M', 'L'], stock: null, active: true, sort: i, image: '', images: [], colors: [{ar: 'أساسي', fr: 'Base', hex, image: ''}],
    cutout: {front: await png(type, hex), back: ''}, ...extra});
  await P('a1', 'abaya', '#211B20', 'عباية الأطلس', 8900, 0);
  await P('a2', 'abaya-trim', '#5E1F2E', 'عباية النجمة', 11500, 1);
  // a piece with its own picture per colour and a back
  await FB_API.saveProduct({id: 'c1', category: 'caftan', type: 'caftan', price: 18500, compare_price: null, badge: null, cost: 0, name: L('قفطان المرجان', 'Caftan Mordjane'), description: L('', ''),
    sizes: ['S', 'M'], stock: null, active: true, sort: 2, image: '', images: [],
    colors: [{ar: 'مرجاني', fr: 'Corail', hex: '#9E2F3C', image: '', cutout: await png('caftan', '#9E2F3C')}, {ar: 'زمردي', fr: 'Émeraude', hex: '#1F5A4A', image: '', cutout: await png('caftan', '#1F5A4A')}],
    cutout: {front: '', back: await png('caftan', '#9E2F3C', true)}});
  await P('d1', 'dress', '#C9B194', 'فستان اللؤلؤة', 14500, 3);
  await P('d2', 'dress', '#23474F', 'فستان الشفق', 12900, 4);
  await P('s1', 'set', '#B49A80', 'طقم المدينة', 6900, 5);
  // no picture without background: grid only, not on the rack
  await FB_API.saveProduct({id: 'k1', category: 'hijab', type: 'khimar', price: 2500, compare_price: null, badge: null, cost: 0, name: L('خمار', 'Khimar'), description: L('', ''),
    sizes: ['TU'], stock: null, active: true, sort: 6, image: '', images: [], colors: [{ar: 'أسود', fr: 'Noir', hex: '#211B20', image: ''}]});
});
const toRack = p => p.evaluate(() => { const r = document.querySelector('#racks .rack'); scrollTo({top: r.offsetTop - 60, behavior: 'instant'}); });
// point at a part of the piece that can be seen (on the rail, pieces overlap like on a real rack)
const hoverPiece = async (p, id) => {
  await p.evaluate(id => document.querySelector(`[data-rack="${id}"]`).scrollIntoView({block: 'center', inline: 'center', behavior: 'instant'}), id); await p.waitForTimeout(300);
  const pt = await p.evaluate(id => { const h = document.querySelector(`[data-rack="${id}"]`), r = h.querySelector('.g').getBoundingClientRect();
    for (let y = r.top + r.height * .35; y < r.bottom; y += 20) for (let x = r.left + 2; x < r.right; x += 4){ const e = document.elementFromPoint(x, y); if (e && h.contains(e)) return [x, y]; }
    return null; }, id);
  await p.mouse.move(pt[0], pt[1]);
};
const turn = (p, id) => p.$eval(`[data-rack="${id}"] .turn`, g => { const m = new DOMMatrix(getComputedStyle(g).transform); return Math.round(Math.acos(Math.max(-1, Math.min(1, m.m11 / Math.hypot(m.m11, m.m13 || 0)))) * 180 / Math.PI); });
try {
  const ctx = await b.newContext({viewport: {width: 1280, height: 860}});
  await ctx.route('**/assets/config.js', DEMO_CONFIG);
  ctx.on('page', p => p.on('pageerror', e => errs.push(p.url() + ' ' + e.message)));
  const a = await ctx.newPage(); await a.goto(BASE + 'admin.html'); await a.fill('#pw', 'Fam20@'); await a.click('#loginBtn'); await a.waitForTimeout(600);
  await seed(a);

  const p = await ctx.newPage(); await p.goto(BASE); await p.waitForTimeout(1500); await toRack(p); await p.waitForTimeout(800);
  const ids = await p.$$eval('#racks .hang', hs => hs.map(h => h.dataset.rack));
  ok(await p.isVisible('#racks .rack') && ids.join() === 'a1,a2,c1,d1,d2,s1', 'the rack shows the 6 pieces that have a picture without background (not the khimar without one): ' + ids.join(','));
  ok(await p.$eval('[data-rack="c1"] .g', g => g.src.startsWith('data:image/png')), 'a piece with only colour pictures hangs with its first colour');
  const before = await turn(p, 'd1'), w0 = await p.$eval('[data-rack="d1"]', h => h.getBoundingClientRect().width);
  ok(before > 50, `side-on on the rail (turned ${before}°)`);
  await p.screenshot({path: OUT + 'rack-rail.png'});
  await hoverPiece(p, 'd1'); await p.waitForTimeout(900);
  const after = await turn(p, 'd1'), w1 = await p.$eval('[data-rack="d1"]', h => h.getBoundingClientRect().width);
  ok(after < 5 && w1 > w0 * 2 && await p.isVisible('[data-rack="d1"] .cap'), `pointer on a piece: it turns to face you (${before}° → ${after}°), the rail opens around it, its name shows`);
  await p.waitForTimeout(1200);
  ok(await turn(p, 'd1') < 5 && await p.$$eval('#racks .hang', hs => hs.filter(h => h.matches(':hover')).length) === 1, 'the pointer stays on that piece once it has turned (no flicker between neighbours)');
  ok(await p.$eval('[data-rack="d1"] .sw', s => getComputedStyle(s).animationName === 'sway') && await p.locator('[data-rack="d1"] .hook').count() === 1,
    'it hangs from a hanger hooked on the rail, and sways a little as it turns');
  const hk = await p.evaluate(() => { const t = document.querySelector('.rack-track'), h = document.querySelector('[data-rack="d1"] .hook').getBoundingClientRect();
    const rail = t.getBoundingClientRect().top + parseFloat(getComputedStyle(t, '::before').top); return [Math.round(h.top - rail), Math.round(h.bottom - rail)]; });
  ok(hk[0] < 0 && hk[1] > 10, `the hook goes over the rail (hook from ${hk[0]} to ${hk[1]} px around the rail's top)`);
  await p.screenshot({path: OUT + 'rack-hover.png'});
  ok(await turn(p, 'a1') > 50, 'the other pieces stay side-on');

  // brought forward
  await p.click('[data-rack="c1"]'); await p.waitForTimeout(800);
  ok(await p.isVisible('#stage') && (await p.textContent('#stName')) === 'قفطان المرجان' && (await p.textContent('#stPrice')).includes('18'), 'a tap brings the piece forward with its name and price');
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('#stage'), '::backdrop').backdropFilter.includes('blur')), 'everything behind it blurs');
  ok(await p.locator('#stTags .tag').count() === 2 && await p.isVisible('#stSide'), 'its colours hang as tags; front/back shown (it has a back picture)');
  await p.screenshot({path: OUT + 'rack-stage.png'});
  const src0 = await p.getAttribute('#stCur', 'src');
  await p.click('#stTags .tag:nth-child(2)'); await p.waitForTimeout(150);
  const wiping = await p.$eval('#stNext', n => n.classList.contains('wipe') && getComputedStyle(n).animationName === 'wipe');
  await p.waitForFunction(() => !document.querySelector('#stNext').classList.contains('wipe'), null, {timeout: 2500}).catch(() => {}); await p.waitForTimeout(150);
  const src1 = await p.getAttribute('#stCur', 'src');
  ok(wiping && src1 !== src0 && await p.$eval('#stTags .tag:nth-child(2)', t => t.getAttribute('aria-pressed')) === 'true', 'a colour tag: the new colour slides down over the old one');
  await p.screenshot({path: OUT + 'rack-colour.png'});
  await p.click('[data-side="back"]'); await p.waitForTimeout(120);
  const flipping = await p.$eval('#stFig', f => getComputedStyle(f).animationName === 'flip');
  await p.waitForTimeout(700);
  ok(flipping && (await p.getAttribute('#stCur', 'src')) !== src1, 'back: the piece turns round to its back');
  await p.waitForFunction(() => !document.querySelector('#stFig').classList.contains('flip'), null, {timeout: 2000}).catch(() => {}); await p.waitForTimeout(200);
  ok(await p.$eval('#stFig', f => getComputedStyle(f).animationName === 'none'), 'after turning: no animation starts again (the piece stays still)');
  await p.click('[data-side="front"]'); await p.waitForTimeout(800);
  ok((await p.getAttribute('#stCur', 'src')) === src1, 'front again: the chosen colour');
  await p.click('#stBuy'); await p.waitForTimeout(800);
  ok(await p.isVisible('#quick') && (await p.textContent('#qName')).includes('المرجان') && await p.$eval('#qColors input[value="1"]', r => r.checked), 'order now: the product window opens with the colour chosen on the rack');
  await p.click('#quick [data-close]'); await p.waitForTimeout(400);
  await p.click('[data-rack="a1"]'); await p.waitForTimeout(600);
  ok(await p.isHidden('#stSide') && await p.locator('#stTags .tag').count() === 0, 'a piece with one colour and no back: no tags, no front/back');
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  ok(await p.isHidden('#stage'), 'Escape puts it back on the rack');

  // keyboard: Tab onto a piece turns it as well
  await p.focus('[data-rack="a2"]'); await p.waitForTimeout(800);
  ok(await turn(p, 'a2') < 5, 'keyboard focus turns the piece too');

  // phone: the rail is swiped, the piece in the middle faces you
  const m = await b.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  await m.route('**/assets/config.js', DEMO_CONFIG);
  const ma = await m.newPage(); await ma.goto(BASE + 'admin.html'); await ma.fill('#pw', 'Fam20@'); await ma.tap('#loginBtn'); await ma.waitForTimeout(600); await seed(ma);
  const mp = await m.newPage(); mp.on('pageerror', e => errs.push('phone ' + e.message));
  await mp.goto(BASE); await mp.waitForTimeout(1500); await toRack(mp); await mp.waitForTimeout(800);
  ok((await mp.textContent('#racks .rack-sub')).includes('اسحبي'), 'phone: the hint says to swipe');
  const faced = () => mp.$$eval('.hang.face', hs => hs.map(h => h.dataset.rack));
  const f0 = await faced();
  await mp.$eval('#racks .rack-rail', r => r.scrollBy({left: -400, behavior: 'instant'})); await mp.waitForTimeout(900);
  const f1 = await faced();
  ok(f0.length === 1 && f1.length === 1 && f0[0] !== f1[0], `phone: the piece in the middle faces you, and another one after a swipe (${f0} → ${f1})`);
  ok(await mp.evaluate(() => document.documentElement.scrollWidth) <= 390, 'phone: the rail scrolls by itself, the page does not');
  await mp.screenshot({path: OUT + 'rack-phone.png'});
  await mp.tap(`[data-rack="${f1[0]}"]`); await mp.waitForTimeout(800);
  ok(await mp.isVisible('#stage') && await mp.$eval('#stage', d => d.getBoundingClientRect().width) >= 389, 'phone: a tap brings it forward, full screen');
  await mp.screenshot({path: OUT + 'rack-phone-stage.png'});
  await m.close();

  // editor: rack pictures, and a warning when a picture still has its background
  await a.click('[data-tab=products]'); await a.waitForTimeout(400); await a.click('[data-edit="k1"]'); await a.waitForTimeout(400);
  ok((await a.textContent('#edForm')).includes('صور الرف') && await a.locator('input[data-up="cut-front"]').count() === 1 && await a.locator('input[data-up="cutc-0"]').count() === 1, 'editor: rack pictures (front, back, per colour)');
  const jpg = await a.evaluate(() => { const c = document.createElement('canvas'); c.width = 200; c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#f2efe8'; x.fillRect(0, 0, 200, 300); x.fillStyle = '#211B20'; x.fillRect(60, 40, 80, 220); return c.toDataURL('image/jpeg').split(',')[1]; });
  await a.setInputFiles('input[data-up="cut-front"]', {name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpg, 'base64')}); await a.waitForTimeout(1200);
  ok((await a.textContent('#edErr')).includes('بخلفيتها'), 'a picture with its background: a clear warning');
  const png = await a.evaluate(() => { const c = document.createElement('canvas'); c.width = 200; c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#211B20'; x.fillRect(60, 40, 80, 220); return c.toDataURL('image/png').split(',')[1]; });
  await a.setInputFiles('input[data-up="cut-front"]', {name: 'cut.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64')}); await a.waitForTimeout(1200);
  ok(!(await a.textContent('#edErr')) && await a.locator('.cut-pic img').count() === 1, 'a picture without background: no warning, shown on a checkerboard');
  // the 200x300 picture holds an 80x220 piece: it is kept trimmed to the piece (plus a thin margin), so it hangs under the hanger
  const dims = await a.$eval('.cut-pic img', i => new Promise(r => { const im = new Image(); im.onload = () => r([im.naturalWidth, im.naturalHeight]); im.src = i.src; }));
  ok(dims[0] >= 80 && dims[0] <= 90 && dims[1] >= 220 && dims[1] <= 230, `a picture without background is trimmed to the piece (${dims.join('x')}, was 200x300)`);
  await a.click('#edSave'); await a.waitForTimeout(800);
  await p.reload(); await p.waitForTimeout(1500);
  ok(await p.locator('[data-rack="k1"]').count() === 1, 'saved: the khimar now hangs on the rack too');

  // ---------- the racks tab ----------
  await a.click('[data-tab=racks]'); await a.waitForTimeout(500);
  ok((await a.textContent('#main')).includes('لم تنشئ أي رف بعد') && await a.locator('.rk').count() === 0, 'racks tab: none made yet, the store uses one automatic rack (explained)');
  await a.click('#rkAdd'); await a.waitForTimeout(200);
  await a.fill('.rk >> nth=0 >> [data-k="ar"]', 'رف العبايات');
  await a.selectOption('.rk >> nth=0 >> [data-additem]', 'a2'); await a.waitForTimeout(200);
  await a.selectOption('.rk >> nth=0 >> [data-additem]', 'a1'); await a.waitForTimeout(200);
  ok((await a.textContent('#rkDirty')).includes('غير محفوظة'), 'changes are marked as not saved yet');
  await a.click('#rkAdd'); await a.waitForTimeout(200);
  await a.fill('.rk >> nth=1 >> [data-k="ar"]', 'رف السهرة'); await a.fill('.rk >> nth=1 >> [data-k="fr"]', 'Soirée');
  await a.click('.rk >> nth=1 >> [data-addall]'); await a.waitForTimeout(200);
  ok(await a.locator('.rk >> nth=1 >> .rk-item').count() === 7, 'add every remaining piece in one click (7 with the khimar)');
  // keep only the dresses on the evening rack: remove the others
  for (const id of ['a1', 'a2', 'c1', 's1', 'k1']) {
    const items = a.locator('.rk').nth(1).locator('.rk-item');
    const idx = await items.evaluateAll((els, id) => els.findIndex(e => e.textContent.includes(id)), {a1: 'الأطلس', a2: 'النجمة', c1: 'المرجان', s1: 'المدينة', k1: 'خمار'}[id]);
    if (idx >= 0){ await items.nth(idx).locator('[data-itdel]').click(); await a.waitForTimeout(150); }
  }
  ok(await a.locator('.rk').nth(1).locator('.rk-item').count() === 2, 'pieces removed from a rack (2 dresses left)');
  // order inside the first rack: a2, a1 -> a1, a2
  await a.locator('.rk').nth(0).locator('[data-itmove="1"][data-d="-1"]').click(); await a.waitForTimeout(150);
  await a.click('#rkSave'); await a.waitForTimeout(600);
  ok((await a.textContent('#toast')).includes('تم حفظ الرفوف'), 'racks saved');
  await p.reload(); await p.waitForTimeout(1500);
  const racks = await p.$$eval('#racks .rack', rs => rs.map(r => [r.querySelector('h2').textContent, [...r.querySelectorAll('.hang')].map(h => h.dataset.rack).join()]));
  ok(JSON.stringify(racks) === JSON.stringify([['رف العبايات', 'a1,a2'], ['رف السهرة', 'd1,d2']]), 'the store shows the 2 racks, in order, with their own pieces in order: ' + JSON.stringify(racks));
  await p.click('#langBtn'); await p.waitForTimeout(300);
  ok((await p.textContent('#racks .rack:nth-child(2) h2')) === 'Soirée', 'rack names in French');
  await p.click('#langBtn'); await p.waitForTimeout(200);
  await toRack(p); await p.waitForTimeout(600); await p.screenshot({path: OUT + 'racks-two.png', fullPage: false});
  // order of the racks, hide one, delete one
  await a.locator('.rk').nth(1).locator('[data-rkmove="-1"]').click(); await a.waitForTimeout(150);
  await a.locator('.rk').nth(1).locator('[data-k="active"]').uncheck();
  await a.click('#rkSave'); await a.waitForTimeout(600);
  await p.reload(); await p.waitForTimeout(1500);
  ok(JSON.stringify(await p.$$eval('#racks .rack h2', hs => hs.map(h => h.textContent))) === '["رف السهرة"]', 'evening rack moved first; the abayas rack hidden');
  await a.locator('.rk').nth(1).locator('[data-rkdel]').click(); await a.locator('.rk').nth(1).locator('[data-rkdel]').click(); await a.waitForTimeout(150);
  await a.click('#rkSave'); await a.waitForTimeout(600);
  ok(await a.locator('.rk').count() === 1 && await a.evaluate(async () => (await FB_API.adminLoad()).products.some(p => p.id === 'a1')), 'a rack deleted (its pieces stay in the shop)');
  await a.uncheck('#rkOn'); await a.click('#rkSave'); await a.waitForTimeout(600);
  await p.reload(); await p.waitForTimeout(1500);
  ok(await p.locator('#racks .rack').count() === 0 && await p.locator('#grid .card').count() === 7, 'racks switched off: none in the store; the products are all still in the grid');
  // a name is required; pieces without a rack picture listed with a shortcut
  await a.check('#rkOn'); await a.click('#rkAdd'); await a.click('#rkSave'); await a.waitForTimeout(300);
  ok((await a.textContent('#toast')).includes('اكتب اسم كل رف'), 'a rack without a name is refused');
  await a.screenshot({path: OUT + 'racks-admin.png', fullPage: true});
} catch (e) { results.push('FAIL test stopped: ' + e.message.split('\n')[0]); }
console.log(results.join('\n'));
console.log(`\n${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
console.log('page errors:', errs.length ? errs : 'none');
await b.close();
