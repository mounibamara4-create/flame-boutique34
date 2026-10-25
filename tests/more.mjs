// "You may also like" in the product window, and the payment / delivery / exchange page. Demo mode.
// Run: node tests/netlify-local.mjs &  then  node tests/more.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8888/';
const OUT = (process.env.OUT || '/tmp') + '/';
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m); const errs = [];
const DEMO_CONFIG = r => r.fulfill({contentType: 'text/javascript', body: 'window.FB_CONFIG={DEMO_PASSWORD_SHA256:"cd782a4fb4e7c57fcab4debf1a47b4e4052d9dd02cdd1fade914b9d7fbeb8221"}'});
const b = await chromium.launch();
try {
  const ctx = await b.newContext({viewport: {width: 1280, height: 860}});
  await ctx.route('**/assets/config.js', DEMO_CONFIG);
  ctx.on('page', p => p.on('pageerror', e => errs.push(p.url() + ' ' + e.message)));
  const a = await ctx.newPage();
  await a.goto(BASE + 'admin.html'); await a.fill('#pw', 'Fam20@'); await a.click('#loginBtn'); await a.waitForTimeout(700);
  await a.addScriptTag({path: new URL('./fixtures/products.js', import.meta.url).pathname});
  await a.evaluate(async () => {
    const ps = JSON.parse(JSON.stringify(window.FB_TEST_PRODUCTS));
    ps.find(p => p.id === 'nassim').stock = Object.fromEntries(ps.find(p => p.id === 'nassim').sizes.map(s => [s, 0]));  // sold out
    for (const p of ps) await FB_API.saveProduct(p);
  });

  const st = await ctx.newPage(); await st.goto(BASE); await st.waitForTimeout(1500);
  await st.click('[data-open="atlas"] >> nth=0'); await st.waitForTimeout(600);
  const ids = await st.$$eval('#qMore [data-more]', bs => bs.map(b => b.dataset.more));
  ok(ids.length === 4, 'product window suggests 4 other pieces: ' + ids.join(', '));
  ok(ids[0] === 'nedjma' && !ids.includes('atlas') && !ids.includes('nassim'), 'same section first; not the piece itself, not a sold-out piece');
  await st.locator('#qMore').scrollIntoViewIfNeeded(); await st.screenshot({path: OUT + 'related.png'});
  await st.click('#qMore [data-more="nedjma"]'); await st.waitForTimeout(700);
  ok((await st.textContent('#qName')).includes('النجمة') && await st.$eval('#quick', d => d.scrollTop) < 50 && (await st.inputValue('#qQty').catch(() => st.textContent('#qQty'))) === '1', 'tapping a suggestion opens it in the same window, from the top');
  ok(await st.locator('#quick .policy-link a[href="policy.html"]').count() === 1, 'product window links to the policy page');
  await st.click('#quick [data-close]'); await st.waitForTimeout(300);
  ok(await st.locator('footer a[href="policy.html"]').count() === 1, 'footer links to the policy page');

  // search and sort
  await st.reload(); await st.waitForTimeout(1500);
  const names = () => st.$$eval('.card [data-open].card-media', bs => bs.map(b => b.dataset.open));
  ok(await st.isVisible('#q') && (await st.textContent('#shopCount')).includes('12'), 'search box and count shown (12 pieces)');
  await st.fill('#q', 'عباية سوداء'); await st.waitForTimeout(200);
  let n = await names();
  ok(n.length && n.every(id => ['atlas', 'nedjma'].includes(id)) && n.includes('atlas'), '"عباية سوداء" finds the black abayas: ' + n.join(', '));
  await st.fill('#q', 'قفاطين'); await st.waitForTimeout(200); n = await names();
  ok(n.includes('mordjane') && n.includes('yaqout') && !n.includes('atlas'), '"قفاطين" (plural) finds the caftans: ' + n.join(', '));
  await st.fill('#q', 'abayas noires'); await st.waitForTimeout(200); n = await names();
  ok(n.join() === 'atlas,nedjma', '"abayas noires" in French: ' + n.join(', '));
  await st.fill('#q', 'robes'); await st.waitForTimeout(200); n = await names();
  ok(n.includes('loulou') && n.includes('chafaq') && !n.includes('atlas'), '"robes" finds the dresses: ' + n.join(', '));
  await st.fill('#q', 'زززز'); await st.waitForTimeout(200);
  ok(await st.isVisible('.grid-none') && (await st.textContent('.grid-none')).includes('زززز'), 'no result: says so, with the word typed');
  await st.click('#searchClear2'); await st.waitForTimeout(200);
  ok((await names()).length === 12 && await st.inputValue('#q') === '', 'clear search shows everything again');
  await st.selectOption('#sort', 'priceUp'); await st.waitForTimeout(200); n = await names();
  ok(n[0] === 'soie' && n[n.length - 1] === 'nassim', 'price low to high (sold-out piece last): ' + n[0] + ' … ' + n[n.length - 1]);
  await st.selectOption('#sort', 'priceDown'); await st.waitForTimeout(200); n = await names();
  ok(n[0] === 'yaqout', 'price high to low starts with the caftan at 21 000');
  await st.selectOption('#sort', 'new'); await st.waitForTimeout(200); n = await names();
  ok(n[0] === 'soie', 'newest first (last piece added)');
  await st.click('[data-cat="hijab"]'); await st.waitForTimeout(200); await st.fill('#q', 'عباية'); await st.waitForTimeout(200);
  ok(await st.isVisible('#searchAll'), 'nothing in this section: offers to search all sections');
  await st.click('#searchAll'); await st.waitForTimeout(200);
  ok((await names()).includes('atlas'), 'search in all sections finds it');
  await st.setViewportSize({width: 390, height: 844}); await st.fill('#q', ''); await st.waitForTimeout(300);
  ok(await st.evaluate(() => document.documentElement.scrollWidth) <= 390, 'phone: no sideways scroll with the search bar');
  await st.locator('#shop').scrollIntoViewIfNeeded(); await st.screenshot({path: OUT + 'search-phone.png'});
  await st.setViewportSize({width: 1280, height: 860});

  // nothing written yet: the page shows only what the site already states
  const pp = await ctx.newPage(); await pp.goto(BASE + 'policy.html'); await pp.waitForTimeout(1200);
  const body = await pp.textContent('#body');
  ok(body.includes('الدفع عند الاستلام') && body.includes('الاستبدال عند المعاينة') && !body.includes('['), 'empty policy: page states only the shop\'s own promises');
  ok(await pp.isVisible('#wa') && (await pp.getAttribute('#wa', 'href')).includes('213549902289'), 'WhatsApp button on the policy page');

  // owner: draft with blanks cannot be saved; filled draft is published
  await a.click('[data-tab=site]'); await a.waitForTimeout(300);
  await a.click('#polDraft'); await a.waitForTimeout(200);
  ok((await a.inputValue('#s-pol-ar')).includes('## الاستبدال') && (await a.inputValue('#s-pol-ar')).includes('['), 'draft inserted');
  await a.click('#saveSite'); await a.waitForTimeout(300);
  ok((await a.textContent('#toast')).includes('بلا قرار'), 'draft with [ ] blanks is refused');
  const filled = (await a.inputValue('#s-pol-ar')).replace(/\[([^\]]*)\]/g, (m, x) => x.replace(/^مثلاً:?\s*/, '')).replace(/^.*(?:اكتبي هل|أو احذفي هذا السطر).*$\n?/gm, '');
  await a.fill('#s-pol-ar', filled); await a.fill('#s-pol-fr', '');
  await a.click('#saveSite'); await a.waitForTimeout(400);
  ok((await a.textContent('#toast')).includes('تم حفظ'), 'completed policy saved');
  await pp.reload(); await pp.waitForTimeout(1200);
  ok(await pp.locator('#body h2').count() >= 4 && await pp.locator('#body li').count() >= 6 && (await pp.textContent('#body')).includes('غير ملبوسة'), 'policy page shows the owner\'s headings and lists');
  await pp.screenshot({path: OUT + 'policy.png', fullPage: true});
  await pp.click('#langBtn'); await pp.waitForTimeout(300);
  ok((await pp.textContent('h1')).includes('Paiement') && (await pp.textContent('#body')).includes('غير ملبوسة'), 'French visitor: Arabic text shown when no French text');
  const esc = await a.evaluate(async () => { const d = await FB_API.adminLoad(); d.settings.policy.ar = '## <img src=x onerror=alert(1)>\n- ok'; await FB_API.saveSettings(d.settings); });
  await pp.reload(); await pp.waitForTimeout(1000);
  ok(await pp.locator('#body img').count() === 0 && (await pp.textContent('#body h2')).includes('<img'), 'policy text is shown as text, never as HTML');
} catch (e) { results.push('FAIL test stopped: ' + e.message.split('\n')[0]); }
console.log(results.join('\n'));
console.log(`\n${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
console.log('page errors:', errs.length ? errs : 'none');
await b.close();
