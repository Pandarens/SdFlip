// Smoothness and edge clipping: node test/perf.mjs [name filter]
//  - frame times while flipping (phone: CPU throttled 4x)
//  - delay from the call to the first movement of the sheet
//  - how far the curling sheet leaves the viewport at the top and bottom (under the header and toolbar)
// Frame times are printed for comparison only; the run fails if a sheet leaves the viewport by more than 1px.
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test', 'report-perf');
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.pdf') ? 'application/pdf' : 'text/html; charset=utf-8' }); r.end(d); }); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && fs.existsSync(p));
if (!CHROME) { console.error('Chrome or Edge not found. Set its path in CHROME_PATH.'); process.exit(2); }
const b = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
const SETUPS = [
	{ name: 'Desktop 1366×768', vp: { width: 1366, height: 768 }, dpr: 1, cpu: 1, file: 'field-guide.pdf' },
	{ name: 'Desktop 1920×1080', vp: { width: 1920, height: 1080 }, dpr: 1, cpu: 1, file: 'field-guide.pdf' },
	{ name: 'Phone 390×844, CPU 4x slower', vp: { width: 390, height: 844 }, dpr: 3, cpu: 4, mobile: true, file: 'field-guide.pdf' },
	{ name: 'Phone, landscape deck 8 slides', vp: { width: 390, height: 844 }, dpr: 3, cpu: 4, mobile: true, file: 'landscape-deck.pdf' }
];
const ONLY = (process.argv[2] || '').toLowerCase();
const results = [];
for (const s of SETUPS.filter(x => !ONLY || x.name.toLowerCase().includes(ONLY))) {
	const ctx = await b.newContext({ viewport: s.vp, deviceScaleFactor: s.dpr, isMobile: !!s.mobile, hasTouch: !!s.mobile });
	const page = await ctx.newPage();
	const cdp = await ctx.newCDPSession(page);
	await page.goto(base + '/test/harness.html');
	await page.evaluate(f => new Promise(r => { window.__v = SdFlip.open({ source: '/docs/samples/' + f, onReady: r }); }), s.file);
	await page.waitForTimeout(800);
	if (s.cpu > 1) { await cdp.send('Emulation.setCPUThrottlingRate', { rate: s.cpu }); }
	const m = await page.evaluate(async () => {
		const v = __v;
		const vpR = v.viewport.getBoundingClientRect();
		const tbR = v.toolbar.getBoundingClientRect();
		const frames = [], starts = [];
		let over = 0, under = 0, grow = 0;
		const flipOnce = (dir) => new Promise(res => {
			const t0 = performance.now(); let last = t0, started = false;
			if (dir > 0) { v.next(); } else { v.prev(); }
			const tick = (t) => {
				frames.push(t - last); last = t;
				const curl = document.querySelector('.sdf-curl');
				if (curl && !started) { started = true; starts.push(t - t0); }
				if (curl) {
					let top = 1e9, bot = -1e9;
					curl.querySelectorAll('.sdf-sf, .sdf-sb').forEach(f => { const r = f.getBoundingClientRect(); if (r.height > 0) { top = Math.min(top, r.top); bot = Math.max(bot, r.bottom); } });
					const book = v.book.getBoundingClientRect();
					over = Math.max(over, vpR.top - top);              // above the viewport (under the header)
					under = Math.max(under, bot - tbR.top);             // under the toolbar
					grow = Math.max(grow, ((bot - top) / book.height - 1) * 100);
				}
				if (v.busy || performance.now() - t0 < 60) { requestAnimationFrame(tick); } else { res(); }
			};
			requestAnimationFrame(tick);
		});
		for (let i = 0; i < 4; i++) { await flipOnce(1); await new Promise(r => setTimeout(r, 250)); }
		for (let i = 0; i < 2; i++) { await flipOnce(-1); await new Promise(r => setTimeout(r, 250)); }
		const sorted = frames.slice(1).sort((a, b) => a - b);
		const q = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
		return { p50: q(0.5), p95: q(0.95), max: sorted[sorted.length - 1], long: sorted.filter(x => x > 25).length, n: sorted.length,
			start: Math.max(...starts), flips: starts.length, over, under, grow, pw: v.pw, ph: v.ph, single: v.single };
	});
	results.push({ name: s.name, ...m, ok: m.flips === 6 && m.over <= 1 && m.under <= 1 });
	await ctx.close();
}
await b.close(); srv.close();
const r1 = x => (x == null ? '-' : Math.round(x * 10) / 10);
console.log('    ' + 'setup'.padEnd(34), 'frame p50', 'p95 ', 'max  ', 'frames>25ms', 'start ms', 'above', 'under bar', 'growth %');
for (const r of results) {
	console.log((r.ok ? 'OK  ' : 'FAIL') + r.name.padEnd(34), String(r1(r.p50)).padEnd(9), String(r1(r.p95)).padEnd(4), String(r1(r.max)).padEnd(5), String(r.long + '/' + r.n).padEnd(11), String(r1(r.start)).padEnd(8), String(r1(Math.max(0, r.over))).padEnd(5), String(r1(Math.max(0, r.under))).padEnd(9), r1(r.grow));
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'perf-last.json'), JSON.stringify(results, null, 1));
const bad = results.filter(r => !r.ok).length;
console.log(bad ? `\n${bad} of ${results.length} setups: sheet left the viewport or did not flip 6 times` : `\nAll ${results.length} setups: 6 flips each, sheet edges within the viewport`);
process.exit(bad ? 1 : 0);
