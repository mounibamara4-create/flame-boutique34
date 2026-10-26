// Size guide: shown in the product window for sized garments, hidden for one-size pieces,
// and editable by the owner from the dashboard (demo mode, real browser).
// Run: node tests/netlify-local.mjs &  then  node tests/sizeguide.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8888/';
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m); const errs = [];
const DEMO_CONFIG = r => r.fulfill({contentType: 'text/javascript', body: 'window.FB_CONFIG={DEMO_PASSWORD_SHA256:"cd782a4fb4e7c57fcab4debf1a47b4e4052d9dd02cdd1fade914b9d7fbeb8221"}'});
const b = await chromium.launch();
try {
  const ctx = await b.newContext({viewport: {width: 1280, height: 900}});
  await ctx.route('**/assets/config.js', DEMO_CONFIG);
  ctx.on('page', p => p.on('pageerror', e => errs.push(p.url() + ' ' + e.message)));

  // seed: one sized piece, one one-size piece
  const a = await ctx.newPage();
  await a.goto(BASE + 'admin.html'); await a.fill('#pw', 'Fam20@'); await a.click('#loginBtn'); await a.waitForTimeout(700);
  await a.evaluate(async () => {
    await FB_API.saveProduct({id: 'ab1', category: 'abaya', type: 'abaya', price: 4500, compare_price: null, badge: null, cost: 0, name: {ar: 'عباية', fr: 'Abaya'},
      description: {ar: '', fr: ''}, sizes: ['S', 'M', 'L'], stock: {S: 5, M: 5, L: 5}, active: true, sort: 0, image: '', images: [], colors: [{ar: 'أسود', fr: 'Noir', hex: '#211B20', image: ''}]});
    await FB_API.saveProduct({id: 'kh1', category: 'hijab', type: 'khimar', price: 1500, compare_price: null, badge: null, cost: 0, name: {ar: 'خمار', fr: 'Khimar'},
      description: {ar: '', fr: ''}, sizes: ['TU'], stock: {TU: 9}, active: true, sort: 1, image: '', images: [], colors: [{ar: 'أسود', fr: 'Noir', hex: '#211B20', image: ''}]});
  });

  // --- storefront: the link shows for a sized piece and opens a filled table ---
  const s = await ctx.newPage();
  await s.goto(BASE); await s.waitForFunction(() => typeof PRODUCTS!=='undefined' && PRODUCTS.length >= 2);
  await s.evaluate(() => openProduct('ab1'));
  await s.waitForTimeout(200);
  ok(!(await s.locator('#qSizeGuide').isHidden()), 'sized piece: the "size guide" link is shown in the product window');
  await s.click('#qSizeGuide'); await s.waitForTimeout(200);
  ok(await s.locator('#sizeGuide').evaluate(d => d.open), 'clicking the link opens the size-guide dialog');
  const rows = await s.locator('#sgTable tbody tr').count();
  ok(rows === 5, 'default guide has 5 rows (S–XXL) — got ' + rows);
  const html = await s.locator('#sgTable').innerHTML();
  ok(html.includes('84 – 88') && html.includes('S'), 'table shows the default bust measurement for S');
  const heads = await s.locator('#sgTable thead th').allTextContents();
  ok(heads.join('|').includes('محيط الصدر') && heads.join('|').includes('محيط الخصر') && heads.join('|').includes('محيط الورك'), 'columns: size, FR, bust, waist, hips');

  // one-size piece: no link
  await s.evaluate(() => { document.getElementById('sizeGuide').close(); openProduct('kh1'); });
  await s.waitForTimeout(200);
  ok(await s.locator('#qSizeGuide').isHidden(), 'one-size piece (TU): the size-guide link is hidden');

  // --- dashboard: edit a measurement and add a row, then save ---
  await a.click('[data-tab=site]'); await a.waitForTimeout(500);
  await a.locator('#sgRows .sg-row').first().locator('[data-sg="bust"]').fill('80 – 86');
  await a.click('#sgAdd'); await a.waitForTimeout(200);
  await a.locator('#sgRows .sg-row').last().locator('[data-sg="label"]').fill('3XL');
  await a.locator('#sgRows .sg-row').last().locator('[data-sg="bust"]').fill('128 – 134');
  await a.click('#saveSite'); await a.waitForTimeout(600);
  const saved = await a.evaluate(() => JSON.parse(localStorage.getItem('fb34-demo-db')).settings.size_guide);
  ok(saved.length === 6 && saved[0].bust === '80 – 86' && saved[5].label === '3XL', 'dashboard: edited bust + added 3XL row are saved');

  // storefront reflects the owner's edit after reload
  await s.reload(); await s.waitForFunction(() => typeof PRODUCTS!=='undefined' && PRODUCTS.length >= 2);
  await s.evaluate(() => openProduct('ab1')); await s.waitForTimeout(150);
  await s.click('#qSizeGuide'); await s.waitForTimeout(150);
  const html2 = await s.locator('#sgTable').innerHTML();
  ok(html2.includes('80 – 86') && html2.includes('3XL'), 'storefront shows the owner-edited measurement and the new row');

  // --- toggle off: the link disappears ---
  await a.locator('#sg-on').uncheck(); await a.click('#saveSite'); await a.waitForTimeout(600);
  await s.reload(); await s.waitForFunction(() => typeof PRODUCTS!=='undefined' && PRODUCTS.length >= 2);
  await s.evaluate(() => openProduct('ab1')); await s.waitForTimeout(150);
  ok(await s.locator('#qSizeGuide').isHidden(), 'owner turned the guide off: the link no longer shows');
} catch (e) { errs.push('EXC ' + (e && e.stack || e)); }
await b.close();
for (const r of results) console.log(r);
if (errs.length) { console.log('\nERRORS:'); for (const e of errs) console.log(e); }
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed || errs.length ? 1 : 0);
