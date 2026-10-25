// Customer reviews and ad pixels, in demo mode (real browser, dist/ served like Netlify).
// Run: node tests/netlify-local.mjs &  then  node tests/reviews.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8888/';
const OUT = (process.env.OUT || '/tmp') + '/';
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m); const errs = [];
const DEMO_CONFIG = r => r.fulfill({contentType: 'text/javascript', body: 'window.FB_CONFIG={DEMO_PASSWORD_SHA256:"cd782a4fb4e7c57fcab4debf1a47b4e4052d9dd02cdd1fade914b9d7fbeb8221"}'});
const b = await chromium.launch();
try {
  const ctx = await b.newContext({viewport: {width: 1280, height: 860}});
  await ctx.route('**/assets/config.js', DEMO_CONFIG);
  // pixel scripts: the request only reaches here if the page's CSP allows it; answer with an empty script
  const pixelHits = [];
  await ctx.route(/connect\.facebook\.net|analytics\.tiktok\.com/, r => { pixelHits.push(r.request().url()); r.fulfill({contentType: 'text/javascript', body: ''}); });
  ctx.on('page', p => p.on('pageerror', e => errs.push(p.url() + ' ' + e.message)));

  // owner adds one product and an order is placed, then delivered
  const a = await ctx.newPage();
  await a.goto(BASE + 'admin.html'); await a.fill('#pw', 'Fam20@'); await a.click('#loginBtn'); await a.waitForTimeout(700);
  await a.evaluate(async () => {
    await FB_API.saveProduct({id: 'atlas', category: 'abaya', type: 'abaya', price: 8900, compare_price: null, badge: null, cost: 0, name: {ar: 'عباية الأطلس', fr: 'Abaya Atlas'},
      description: {ar: '', fr: ''}, sizes: ['M'], stock: null, active: true, sort: 0, image: '', images: [], colors: [{ar: 'أسود', fr: 'Noir', hex: '#211B20', image: ''}]});
    await FB_API.saveRates([{wilaya_code: 34, scope: 0, home_price: 400, desk_price: 250, home_available: true, desk_available: true}]);
  });
  const s = await a.evaluate(async () => {
    const communes = await FB_API.communes(34);
    return FB_API.placeOrder({idempotency_key: crypto.randomUUID(), first_name: 'هاجر', last_name: 'طالبي', phone: '0770000000', wilaya: 34, commune_id: communes[0].id,
      delivery: 'desk', items: [{id: 'atlas', size: 'M', color: 0, qty: 1}]});
  });
  const t = await ctx.newPage();
  await t.goto(BASE + 'track.html'); await t.fill('#tCode', s.tracking_code); await t.fill('#tPhone', '0770000000'); await t.click('#tBtn'); await t.waitForTimeout(800);
  ok(await t.locator('#revForm').count() === 0, 'no review form before the order is delivered');

  await a.reload(); await a.waitForTimeout(800);
  await a.evaluate(async () => { const d = await FB_API.adminLoad(); await FB_API.setOrderStatus(d.orders[0].id, 'delivered', ''); });
  await t.click('#tBtn'); await t.waitForTimeout(800);
  ok(await t.isVisible('#revForm'), 'delivered order: the tracking page asks for a review');
  await t.click('#rBtn'); await t.waitForTimeout(200);
  ok((await t.textContent('#eRating')).length > 0, 'stars are required');
  await t.click('label[for="r4"]'); await t.mouse.move(5, 5); await t.waitForTimeout(400);  // let the colour transition finish
  ok(await t.$eval('label[for="r1"]', l => getComputedStyle(l).color) === await t.$eval('label[for="r4"]', l => getComputedStyle(l).color)
    && await t.$eval('label[for="r5"]', l => getComputedStyle(l).color) !== await t.$eval('label[for="r4"]', l => getComputedStyle(l).color), '4 stars light up, the 5th stays off');
  await t.fill('#rBody', 'قماش ثقيل والمقاس مضبوط، وصلتني في يومين.');
  await t.screenshot({path: OUT + 'review-form.png', fullPage: true});
  await t.click('#rBtn'); await t.waitForTimeout(900);
  ok(await t.isVisible('.thanks') && await t.locator('#revForm').count() === 0, 'review sent, thanks shown');
  await t.click('#tBtn'); await t.waitForTimeout(800);
  ok(await t.locator('#revForm').count() === 0 && await t.isVisible('.thanks'), 'one review per order');

  const st = await ctx.newPage(); await st.goto(BASE); await st.waitForTimeout(1500);
  ok(await st.isHidden('#reviews') && await st.locator('.card-rate').count() === 0, 'a review waiting for approval is not shown in the store');

  // dashboard: pending count, publish
  await a.reload(); await a.waitForTimeout(800);
  ok((await a.textContent('[data-tab=reviews] .count')) === '1', 'reviews tab shows 1 waiting');
  await a.click('[data-tab=reviews]'); await a.waitForTimeout(400);
  ok((await a.textContent('.rrow')).includes('مشترية مؤكدة') && (await a.textContent('.rrow')).includes('هاجر ط.'), 'review shows as verified buyer with a short name');
  await a.click('[data-rset=approved]'); await a.waitForTimeout(500);
  // owner adds a review she received on WhatsApp
  await a.click('#addRev'); await a.fill('#rv-name', 'سارة ب.'); await a.fill('#rv-w', 'سطيف'); await a.selectOption('#rv-rating', '5'); await a.fill('#rv-body', 'خدمة ممتازة');
  await a.click('#rvSave'); await a.waitForTimeout(500);
  ok(await a.locator('.rrow').count() === 2 && (await a.textContent('.rlist')).includes('أضفته أنت'), 'owner review published, marked as added by the owner');
  await a.screenshot({path: OUT + 'admin-reviews.png', fullPage: true});

  await st.reload(); await st.waitForTimeout(1500);
  ok(await st.isVisible('#reviews') && await st.locator('#revRow .rev').count() === 2, 'store shows the 2 published reviews');
  ok((await st.textContent('#revAvg')).includes('4,5') || (await st.textContent('#revAvg')).includes('4.5') || (await st.textContent('#revAvg')).includes('٤'), 'average 4.5 shown: ' + await st.textContent('#revAvg'));
  ok(await st.locator('#revRow .rev-ok').count() === 1, 'only the customer review has the verified mark');
  ok(await st.locator('.card-rate').count() === 1 && (await st.textContent('.card-rate')).includes('(1)'), 'product card shows its rating (1 review)');
  await st.locator('#reviews').scrollIntoViewIfNeeded(); await st.screenshot({path: OUT + 'store-reviews.png'});
  await st.click('#revRow .rev-prod'); await st.waitForTimeout(600);
  ok(await st.isVisible('#quick') && await st.isVisible('#qRate') && await st.locator('#qReviews .rev').count() === 1, 'product window lists its review');
  await st.click('#quick [data-close]'); await st.waitForTimeout(400);

  // pixels: nothing loads without IDs
  ok(pixelHits.length === 0 && await st.evaluate(() => !window.fbq && !window.ttq), 'no pixel loads while no ID is set');
  await a.click('[data-tab=site]'); await a.waitForTimeout(300);
  await a.fill('#s-fbpx', '12345'); await a.click('#saveSite'); await a.waitForTimeout(300);
  ok((await a.textContent('#toast')).includes('أرقام فقط'), 'invalid Meta pixel ID refused');
  await a.fill('#s-fbpx', '123456789012345'); await a.fill('#s-ttpx', 'c1a2b3c4d5e6f7g8h9i0'); await a.click('#saveSite'); await a.waitForTimeout(400);
  ok((await a.textContent('#toast')).includes('تم حفظ'), 'pixel IDs saved');

  await st.reload(); await st.waitForTimeout(1500);
  ok(pixelHits.some(u => u.includes('connect.facebook.net')) && pixelHits.some(u => u.includes('analytics.tiktok.com') && u.includes('C1A2B3C4D5E6F7G8H9I0')), 'both pixel scripts load (allowed by the site security policy)');
  await st.click('.card [data-open]'); await st.waitForTimeout(500);
  await st.click('#qAdd'); await st.waitForTimeout(900);
  await st.click('#cartBtn'); await st.waitForTimeout(400); await st.click('#toCheckout'); await st.waitForTimeout(500);
  await st.fill('#f_first', 'ريم'); await st.fill('#f_last', 'قاسمي'); await st.fill('#f_phone', '0550000001');
  await st.fill('#f_wilaya', '34'); await st.waitForTimeout(200); await st.keyboard.press('Enter'); await st.waitForTimeout(500);
  await st.click('#f_commune'); await st.waitForTimeout(200); await st.keyboard.press('ArrowDown'); await st.keyboard.press('Enter'); await st.waitForTimeout(200);
  await st.click('#f_delivery label:nth-child(2)'); await st.click('#coNext'); await st.waitForTimeout(300); await st.click('#coConfirm'); await st.waitForTimeout(1200);
  const code = await st.textContent('#trackCode').catch(() => '');
  const fbEv = await st.evaluate(() => (window.fbq?.queue || []).map(a => [...a]));
  const ttEv = await st.evaluate(() => (window.ttq || []).filter(a => Array.isArray(a)).map(a => [...a]));
  const fbNames = fbEv.filter(e => e[0] === 'track').map(e => e[1]), ttNames = ttEv.filter(e => e[0] === 'track').map(e => e[1]);
  ok(['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase'].every(n => fbNames.includes(n)), 'Meta events: ' + fbNames.join(', '));
  ok(['ViewContent', 'AddToCart', 'InitiateCheckout', 'CompletePayment'].every(n => ttNames.includes(n)), 'TikTok events: ' + ttNames.join(', '));
  const buy = fbEv.find(e => e[1] === 'Purchase');
  ok(code && buy && buy[2].value === 8900 + 250 && buy[2].currency === 'DZD' && buy[3]?.eventID === code, 'purchase sent after the server saved it: value with delivery, DZD, tracking code as event id');
} catch (e) { results.push('FAIL test stopped: ' + e.message.split('\n')[0]); }
console.log(results.join('\n'));
console.log(`\n${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
console.log('page errors:', errs.length ? errs : 'none');
await b.close();
