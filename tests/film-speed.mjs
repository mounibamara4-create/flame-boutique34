// Film smoothness on a slow phone: CPU 4x slower, 390x844 at 3x, the film scrolled through in 4 s.
// Before the fix (pictures decoded while drawing, 2x canvas, water running behind): ~6 frames a second.
// The check is generous because a test machine's speed varies: at least 20 frames a second, no frame stuck over 150 ms.
// Run: node tests/netlify-local.mjs &  then  node tests/film-speed.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8888/';
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m);
const b = await chromium.launch();
try {
  const ctx = await b.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 3, isMobile: true, hasTouch: true});
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', {rate: 4});
  await p.goto(BASE, {waitUntil: 'load'}); await p.waitForTimeout(3000);
  const r = await p.evaluate(async () => {
    const box = document.querySelector('#film'), cv = document.querySelector('#filmCanvas');
    const end = box.offsetTop + box.offsetHeight - innerHeight;
    const gaps = []; let last = performance.now(), stop = false;
    (function f(t){ gaps.push(t - last); last = t; if (!stop) requestAnimationFrame(f); })(performance.now());
    const s = performance.now();
    await new Promise(ok => { (function step(){ const k = Math.min(1, (performance.now() - s) / 4000); scrollTo(0, end * k); if (k < 1) setTimeout(step, 16); else setTimeout(ok, 1200); })(); });
    stop = true; gaps.shift();
    return {fps: Math.round(1000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length)), worst: Math.round(Math.max(...gaps)), frame: +cv.dataset.frame, last: +cv.dataset.last};
  });
  ok(r.fps >= 20, `slow phone: ${r.fps} frames a second while scrolling the film (was ~6)`);
  ok(r.worst <= 150, `slow phone: longest pause ${r.worst} ms`);
  ok(r.frame >= r.last - 1, 'the film is at its last picture (or the one before, still easing in) 1.2 s after the scroll stops ' + r.frame + '/' + r.last);
} finally { await b.close(); }
console.log(results.join('\n'));
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
