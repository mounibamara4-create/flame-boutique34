// Run: node tests/netlify-local.mjs &  then: node tests/e2e.mjs   (tests dist/ in demo mode)
// End-to-end test of the store, checkout, tracking and dashboard (demo mode, real browser).
import { chromium } from 'playwright';
const OUT = (process.env.OUT || '/tmp/fb34-e2e') + '/';
import fs from 'fs'; fs.mkdirSync(OUT, {recursive: true});
const BASE = process.env.BASE || 'http://localhost:8888/';
const results = []; const errs = [];
const ok = (c, m) => { results.push((c ? 'PASS ' : 'FAIL ') + m); };
const b = await chromium.launch();
const ctx = await b.newContext({viewport: {width: 1280, height: 860}, permissions: ['clipboard-read', 'clipboard-write']});
await ctx.addInitScript(() => { addEventListener('DOMContentLoaded', () => { const s = document.getElementById('splash'); if (s) s.remove(); }); });
const DEMO_CONFIG = r => r.fulfill({contentType: 'text/javascript', body: 'window.FB_CONFIG={DEMO_PASSWORD_SHA256:"cd782a4fb4e7c57fcab4debf1a47b4e4052d9dd02cdd1fade914b9d7fbeb8221"}'});  // this test runs the site in demo mode
await ctx.route('**/assets/config.js', DEMO_CONFIG);
ctx.on('page', p => { p.on('pageerror', e => errs.push(p.url() + ' ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(p.url() + ' console ' + m.text()); }); });
const shot = (p, n) => p.screenshot({path: OUT + n + '.png'});

try {
// ---------- a new shop: no sample products ----------
const p0 = await ctx.newPage(); await p0.goto(BASE + 'index.html'); await p0.waitForTimeout(2000);
ok(await p0.locator('.card').count() === 0 && await p0.isVisible('.grid-empty') && await p0.locator('.grid-empty a[href*="instagram.com/flame_boutique_34"]').count() === 1, 'new shop: no sample products, a "coming soon" note with the social links');
ok(await p0.locator('footer a.owner-link[href="admin.html"]').count() === 1 && (await p0.textContent('footer .owner-link')).includes('صفحة المالك'), 'footer has the owner page button (relative link admin.html)');
await p0.close();

// ---------- owner prepares prices and stock ----------
const a = await ctx.newPage();
await a.goto(BASE + 'admin.html'); await a.fill('#pw', 'Fam20@'); await a.click('#loginBtn'); await a.waitForTimeout(700);
ok(await a.isVisible('#app'), 'owner logs in with Fam20@');
// the shop starts empty: the test adds the sample catalog of tests/fixtures/products.js
await a.addScriptTag({path: new URL('./fixtures/products.js', import.meta.url).pathname});
await a.evaluate(async () => { for (const p of window.FB_TEST_PRODUCTS) await FB_API.saveProduct(JSON.parse(JSON.stringify(p))); });
await a.click('[data-tab=shipping]'); await a.waitForTimeout(300);
await a.fill('tr[data-w="34"] [data-k="home_price"]', '400'); await a.fill('tr[data-w="34"] [data-k="desk_price"]', '250');
await a.fill('tr[data-w="19"] [data-k="home_price"]', '600'); await a.uncheck('tr[data-w="19"] [data-k="desk_available"]');
await a.click('#saveShip'); await a.waitForTimeout(400);
await a.click('[data-communes="34"]'); await a.waitForTimeout(500);
const medjana = await a.$eval('#communeRates tr[data-name*="medjana"]', tr => tr.dataset.c);
await a.fill(`#communeRates tr[data-c="${medjana}"] [data-k="home_price"]`, '500'); await a.fill(`#communeRates tr[data-c="${medjana}"] [data-k="desk_price"]`, '300');
await a.click('#saveCommunes'); await a.waitForTimeout(400);
await shot(a, 'admin-shipping');
await a.click('[data-tab=products]'); await a.waitForTimeout(300);
await a.click('[data-edit=atlas]'); await a.waitForTimeout(300);
await a.check('#e-track'); await a.waitForTimeout(150);
for (const s of ['S','L','XL','XXL']) await a.fill(`[data-stock="${s}"]`, '0');
await a.fill('[data-stock="M"]', '3'); await a.fill('#e-cmp', '10500');
await a.click('#edSave'); await a.waitForTimeout(500);

// ---------- 1-4: product, order now, form, delivery price ----------
const p = await ctx.newPage();
await p.goto(BASE + 'index.html'); await p.waitForTimeout(2500);
ok(await p.locator('.card').count() === 12, 'store shows 12 products');
const atlasCard = p.locator('article.card', {has: p.locator('[data-buy="atlas"]')});
ok(/تخفيض 15%/.test(await atlasCard.innerText()) && /10 500/.test(await atlasCard.innerText()), 'card shows the real discount and the original price');
ok(/كمية محدودة/.test(await atlasCard.innerText()), 'card shows stock status (limited)');
await p.click('[data-open="atlas"] >> nth=0'); await p.waitForTimeout(500);
ok(await p.isDisabled('#qSizes input[value="S"]'), 'sold-out size cannot be chosen');
await p.click('#qColors label:nth-child(2)'); await p.click('#qSizes label:has(input[value="M"])'); await p.click('#qPlus');
await shot(p, '1-product');
await p.click('#qBuy'); await p.waitForTimeout(700);
const items = await p.innerText('.co-items');
ok(/كحلي/.test(items) && /M/.test(items) && /×2/.test(items), 'order now opens the form with color, size and quantity already set');
await p.click('#coNext'); await p.waitForTimeout(200);
ok((await p.textContent('#e_phone')).includes('إجباري') && await p.getAttribute('#f_phone', 'aria-invalid') === 'true', 'missing phone is flagged next to the field');
await p.fill('#f_first', 'أمينة'); await p.fill('#f_last', 'بن علي'); await p.fill('#f_phone', '0555 12 34 56');
await p.fill('#f_phone2', '123'); await p.click('#coNext'); await p.waitForTimeout(200);
ok((await p.textContent('#e_phone2')).length > 0, 'invalid optional phone is flagged');
await p.fill('#f_phone2', '');
await p.fill('#f_instagram', 'amina.style');
await p.click('#f_wilaya'); await p.fill('#f_wilaya', 'برج'); await p.waitForTimeout(150);
await shot(p, '2-wilaya-search');
await p.click('#f_wilaya-list li:has-text("برج بوعريريج")'); await p.waitForTimeout(400);
await p.click('#f_commune'); await p.fill('#f_commune', 'مجانة'); await p.waitForTimeout(150);
await p.click('#f_commune-list li >> nth=0'); await p.waitForTimeout(200);
await p.click('#f_delivery label:has(input[value="home"])'); await p.waitForTimeout(200);
ok((await p.innerText('#coTotals')).includes('500') && (await p.innerText('#coTotals')).includes('18 300'), 'commune price applied: 2 × 8900 + 500 = 18 300');
await p.click('#f_delivery label:has(input[value="desk"])'); await p.waitForTimeout(200);
ok((await p.innerText('#coTotals')).includes('18 100'), 'switching to desk recalculates: 17 800 + 300 = 18 100');
await p.click('#f_delivery label:has(input[value="home"])');
await p.fill('#f_address', 'حي 500 مسكن، عمارة 3');
await shot(p, '3-form');
// another wilaya: Sétif has no desk delivery; Algiers has no price yet
await p.click('#f_wilaya'); await p.fill('#f_wilaya', '19'); await p.waitForTimeout(150); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
ok(await p.isDisabled('#f_delivery input[value="desk"]'), 'desk delivery unavailable where the owner disabled it');
await p.click('#f_wilaya'); await p.fill('#f_wilaya', 'alger'); await p.waitForTimeout(150); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
ok((await p.innerText('#f_delivery')).includes('يحتاج إلى تأكيد'), 'no price set -> "needs confirmation", nothing invented');
await p.click('#f_wilaya'); await p.fill('#f_wilaya', '34'); await p.waitForTimeout(150); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
await p.click('#f_commune'); await p.fill('#f_commune', 'Medjana'); await p.waitForTimeout(150); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
await p.click('#f_delivery label:has(input[value="home"])');
await p.click('#coNext'); await p.waitForTimeout(300);
const review = await p.innerText('#coBody');
ok(/مراجعة الطلب/.test(await p.textContent('#coTitle')) && /أمينة/.test(review) && /amina\.style/.test(review) && /مجانة/.test(review), 'review shows items, customer and delivery before confirming');
await shot(p, '4-review');

// ---------- 5-8: confirm with a failed first attempt, success, copy ----------
await p.evaluate(() => { const real = FB_API.placeOrder; let n = 0; FB_API.placeOrder = async x => { if (n++ === 0) { await new Promise(r=>setTimeout(r,300)); throw new Error('Failed to fetch'); } return real(x); }; });
await p.click('#coConfirm'); await p.waitForTimeout(150);
ok(await p.isDisabled('#coConfirm'), 'confirm button locked while sending');
await p.waitForTimeout(500);
ok(/لم يصل الطلب/.test(await p.innerText('#coBody')) && !(await p.isVisible('.check-mark')), 'failed save shows an error and no success mark');
await shot(p, '5-error');
await p.click('#coRetry'); await p.dblclick('#coRetry').catch(()=>{}); await p.waitForTimeout(1200);
ok(await p.isVisible('.check-mark'), 'green check after the order is saved');
ok((await p.innerText('#coBody')).includes('تم استلام طلبك بنجاح!') && (await p.innerText('#coBody')).includes('سيتم الاتصال بك لإتمام طلبك وتأكيد تفاصيل التوصيل.'), 'success messages as specified');
const code1 = await p.textContent('#trackCode');
ok(/^FLM-[A-HJ-NP-Z2-9]{8}$/.test(code1), 'tracking code ' + code1);
await shot(p, '6-success');
await p.click('#copyTrack'); await p.waitForTimeout(300);
ok(await p.evaluate(() => navigator.clipboard.readText()) === code1 && (await p.textContent('#toast')).includes('تم نسخ رقم التتبع'), 'copy puts the real tracking code in the clipboard');
await p.click('#backShop'); await p.waitForTimeout(500);

// ---------- 5: several products through the cart, one order ----------
await p.click('[data-add="khimar"]'); await p.waitForTimeout(500);   // 3 colors -> window opens
await p.click('#qColors label:nth-child(2)'); await p.click('#qAdd'); await p.waitForTimeout(500);
await p.click('[data-add="soie"]'); await p.waitForTimeout(500);
await p.click('#qAdd'); await p.waitForTimeout(500);
await p.click('[data-add="nassim"]'); await p.waitForTimeout(500);
await p.click('#qSizes label:has(input[value="L"])'); await p.click('#qAdd'); await p.waitForTimeout(500);
ok(await p.textContent('#cartCount') === '3', 'cart counter shows 3 pieces');
await p.click('#cartBtn'); await p.waitForTimeout(600);
await p.selectOption('.line >> nth=0 >> select[data-k="color"]', '2'); await p.waitForTimeout(200);
await p.click('.line >> nth=2 >> [data-inc]'); await p.waitForTimeout(200);
const foot = await p.innerText('#dFoot');
ok(foot.includes(String((2500 + 1800 + 7500*2).toLocaleString('fr-FR')).replace(/ /g,' ')) && foot.includes('500 دج'), 'cart totals with delivery estimate from the saved commune (Medjana 500): ' + foot.replace(/\n/g,' | '));
await shot(p, '7-cart');
await p.reload(); await p.waitForTimeout(2200);
ok(await p.textContent('#cartCount') === '4', 'cart kept after reload');
await p.click('#cartBtn'); await p.waitForTimeout(500); await p.click('#toCheckout'); await p.waitForTimeout(700);
ok(await p.inputValue('#f_wilaya') !== '' && await p.inputValue('#f_first') === '', 'place kept for the next order, personal details cleared');
await p.fill('#f_first', 'سارة'); await p.fill('#f_last', 'مرابط'); await p.fill('#f_phone', '0661 00 00 00');
await p.click('#f_wasame'); await p.fill('#f_whatsapp', '0770 11 22 33');
await p.click('#f_delivery label:has(input[value="desk"])'); await p.waitForTimeout(200);
await p.click('#coNext'); await p.waitForTimeout(300);
await p.click('#coConfirm'); await p.waitForTimeout(1200);
const code2 = await p.textContent('#trackCode');
ok(code2 && code2 !== code1, 'cart order confirmed with its own tracking code ' + code2);
ok(await p.textContent('#cartCount') === '0', 'cart emptied after the cart order');
await p.click('#backShop'); await p.waitForTimeout(400);

// ---------- 6: saved, visible to the owner ----------
await a.click('[data-tab=orders]'); await a.waitForTimeout(700);
const ordersText = await a.innerText('#main');
ok((await a.locator('.order').count()) === 2, 'owner sees exactly 2 orders (retry and double tap made no duplicate)');
await a.fill('#oq', code2); await a.waitForTimeout(300);
ok((await a.locator('.order').count()) === 1, 'search by tracking code');
await a.click('.order summary'); await a.waitForTimeout(200);
const detail = await a.innerText('.order');
ok(/سارة مرابط/.test(detail) && /0770112233/.test(detail) && /خمار جورجيت/.test(detail) && /حجاب حرير/.test(detail) && /عباية نسيم/.test(detail), 'order details: customer, WhatsApp, 3 products');
await shot(a, 'admin-order');

// ---------- 9-10: tracking, then status update from the dashboard ----------
const t = await ctx.newPage();
await t.goto(BASE + 'track.html#' + code1); await t.waitForTimeout(500);
await t.fill('#tPhone', '0666666666'); await t.click('#tBtn'); await t.waitForTimeout(900);
ok((await t.innerText('#out')).includes('لم نجد طلباً') && !(await t.innerText('#out')).includes('أمينة'), 'wrong phone: generic message, nothing revealed');
await t.fill('#tPhone', '0555123456'); await t.click('#tBtn'); await t.waitForTimeout(900);
ok((await t.innerText('.now')) === 'تم استلام الطلب', 'tracking shows the recorded status');
await a.fill('#oq', code1); await a.waitForTimeout(300); await a.click('.order summary'); await a.waitForTimeout(200);
const id1 = await a.getAttribute('.order', 'data-id');
const openOrder = async () => { if (!(await a.$eval('.order', d => d.open))) await a.click('.order summary'); await a.waitForTimeout(150); };
await a.selectOption('#st-' + id1, 'confirmed'); await a.fill('#sn-' + id1, 'اتصلنا بالزبونة'); await a.click(`[data-status="${id1}"]`); await a.waitForTimeout(600);
await openOrder();
await a.selectOption('#st-' + id1, 'handed_to_carrier'); await a.click(`[data-status="${id1}"]`); await a.waitForTimeout(600);
await t.click('#tBtn'); await t.waitForTimeout(900);
ok((await t.innerText('.now')) === 'تم تسليم الطلب لشركة التوصيل' && (await t.locator('.steps li.done').count()) === 3, 'new status and 3 recorded steps appear on the tracking page');
await shot(t, '8-track');
await openOrder();
await a.selectOption('#st-' + id1, 'cancelled'); await a.click(`[data-status="${id1}"]`); await a.waitForTimeout(600);
await a.click('[data-tab=products]'); await a.waitForTimeout(500);
ok(/3 قطعة/.test(await a.innerText('.prow >> nth=0')), 'cancel put the 2 pieces back in stock (3 again)');
await a.click('[data-tab=overview]'); await a.waitForTimeout(500);
ok(/أُلغي الطلب\s*1/.test(await a.innerText('.status-grid')) && /تم استلام الطلب\s*1/.test(await a.innerText('.status-grid')), 'overview counts orders by status');
await shot(a, 'admin-overview');

// ---------- 11: social links, theme, video, water ----------
ok(await p.getAttribute('#socialBar a[aria-label="Instagram"]', 'href') === 'https://www.instagram.com/flame_boutique_34/' && await p.getAttribute('#socialBar a[aria-label="TikTok"]', 'href') === 'https://www.tiktok.com/@flame.boutique' && await p.getAttribute('#socialBar a[aria-label="Facebook"]', 'href') === 'https://www.facebook.com/share/1Jvk2UUsFk/', 'shop social links in the top bar');
ok(await p.getAttribute('#socialBar a[aria-label="WhatsApp"]', 'href') === 'https://wa.me/213549902289' && await p.locator('#socialBar .soc.is-empty').count() === 0, 'WhatsApp 0549902289 in the top bar');
ok(/google\.com\/maps\/place\/Flame\+boutique/.test(await p.getAttribute('#socialBar a.soc-map', 'href')) && (await p.textContent('#socialBar a.soc-map')).includes('موقع المحل'), 'shop location next to the social icons');
ok((await p.textContent('#phoneTxt')).trim() === '0549 90 22 89' && await p.isVisible('#phoneBox'), 'shop phone shown in the visit section');
await p.locator('#visit').scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
ok((await p.getAttribute('#mapBox iframe', 'src') || '').includes('36.0710359,4.7574911') && /google\.com\/maps\/place\/Flame\+boutique/.test(await p.getAttribute('#mapLink', 'href')), 'shop map and map link from the Google Maps place');
ok(!(await p.isHidden('#fab')) && await p.getAttribute('#fab', 'href') === 'https://wa.me/213549902289', 'floating WhatsApp button opens a chat with 0549902289');
await p.click('#themeBtn'); await p.waitForTimeout(300);
const dark = await p.evaluate(() => document.documentElement.dataset.theme);
await p.reload(); await p.waitForTimeout(1500);
ok(dark === 'dark' && await p.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'dark mode chosen and remembered after reload');
await shot(p, '9-dark');
await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(600);
// a returning visitor (welcomed flag seeded on the context): no one-time splash, the store and header show at once
const topState = await p.evaluate(() => ({splash: !document.querySelector('#splash'), header: !!document.querySelector('.site-header') && document.querySelector('.site-header').offsetHeight > 0}));
ok(topState.splash && topState.header, 'top of the page: the welcome splash does not show for a returning visitor; the store and header are visible');
// the page background is a still CSS marble texture: no canvas, no animation (kinder to the battery than the old water)
const bg = await p.evaluate(() => { const a = getComputedStyle(document.body, '::after'); return {noCanvas: !document.querySelector('#ripple'), grain: a.backgroundImage, page: getComputedStyle(document.body).backgroundImage, raf: typeof FBUI.ripple === 'function' && FBUI.ripple() === undefined}; });
ok(bg.noCanvas && bg.grain.includes('svg') && bg.page.includes('gradient') && bg.raf, 'background is a still CSS texture (marble grain + soft depth), no water canvas, nothing to animate');
await p.evaluate(() => scrollTo({top: 0, behavior: 'instant'})); await p.waitForTimeout(400);
await p.click('#themeBtn');

// ---------- admin social links appear in the store ----------
await a.click('[data-tab=site]'); await a.waitForTimeout(300);
await a.fill('#s-ig', 'https://instagram.com/flameboutique34'); await a.fill('#s-wa', '213555000111'); await a.click('#saveSite'); await a.waitForTimeout(400);
await p.reload(); await p.waitForTimeout(1800);
ok(await p.getAttribute('#socialBar a[aria-label="Instagram"]', 'href') === 'https://instagram.com/flameboutique34' && await p.locator('#socialBar .soc.is-empty').count() === 0 && !(await p.isHidden('#fab')), 'links entered in the dashboard appear in the top bar');

// ---------- 12: phone ----------
const m = await b.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
await m.addInitScript(() => { addEventListener('DOMContentLoaded', () => { const s = document.getElementById('splash'); if (s) s.remove(); }); });
await m.route('**/assets/config.js', DEMO_CONFIG);
const mp = await m.newPage(); mp.on('pageerror', e => errs.push('mobile ' + e.message));
await mp.goto(BASE + 'index.html'); await mp.waitForTimeout(1200);
await mp.addScriptTag({path: new URL('./fixtures/products.js', import.meta.url).pathname});
await mp.evaluate(async () => { for (const p of window.FB_TEST_PRODUCTS) await FB_API.saveProduct(JSON.parse(JSON.stringify(p))); });
await mp.reload(); await mp.waitForTimeout(2200);
const over = async (pg, n) => { const w = await pg.evaluate(() => document.documentElement.scrollWidth); ok(w <= 390, `no sideways scroll on phone: ${n} (${w}px)`); };
await over(mp, 'store'); await shot(mp, 'm1-store');
await mp.locator('#shop').scrollIntoViewIfNeeded(); await mp.waitForTimeout(300); await shot(mp, 'm2-cards');
await mp.tap('[data-buy="soie"]'); await mp.waitForTimeout(600); await mp.tap('#qBuy'); await mp.waitForTimeout(700);
await over(mp, 'checkout'); await shot(mp, 'm3-checkout');
await mp.fill('#f_first', 'ريم'); await mp.fill('#f_last', 'قاسمي'); await mp.fill('#f_phone', '0550000001');
await mp.tap('#f_wilaya'); await mp.fill('#f_wilaya', 'بريكة'); await mp.waitForTimeout(150); await mp.tap('#f_wilaya-list li >> nth=0'); await mp.waitForTimeout(500);
ok(await mp.isVisible('#f_commune_text') && await mp.isVisible('#communeHint'), 'new wilaya without a commune list asks for the commune name');
await mp.fill('#f_commune_text', 'بريكة');
await mp.tap('#f_delivery label:has(input[value="desk"])'); await mp.waitForTimeout(200);
await mp.tap('#coNext'); await mp.waitForTimeout(300); await mp.tap('#coConfirm'); await mp.waitForTimeout(1300);
ok(/^FLM-/.test(await mp.textContent('#trackCode')), 'phone: order confirmed with tracking code');
await shot(mp, 'm4-success');
await mp.tap('a[href^="track.html#"]'); await mp.waitForTimeout(800);
await over(mp, 'tracking'); await shot(mp, 'm5-track');
const ma = await m.newPage(); await ma.goto(BASE + 'admin.html'); await ma.fill('#pw', 'Fam20@'); await ma.tap('#loginBtn'); await ma.waitForTimeout(700);
for (const tb of ['overview','orders','shipping','site']) { await ma.tap(`[data-tab=${tb}]`); await ma.waitForTimeout(400); await over(ma, 'dashboard ' + tb); }
await shot(ma, 'm6-admin');

} catch (e) { results.push('FAIL test stopped: ' + e.message.split('\n')[0]); }
console.log(results.join('\n'));
console.log(`\n${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
console.log('page errors:', errs.length ? errs : 'none');
await b.close();
