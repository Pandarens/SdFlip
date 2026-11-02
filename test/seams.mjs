// Gaps between the strips of a curling sheet: node test/seams.mjs
// The dark navy cover of field-guide.pdf curls over a light page: a gap shows as a light vertical line on navy.
// Needs Python with Pillow to read the screenshots.
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, 'test', 'report-seams', '_seam.png');
fs.mkdirSync(path.dirname(TMP), { recursive: true });
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && fs.existsSync(p));
if (!CHROME) { console.error('Chrome or Edge not found. Set its path in CHROME_PATH.'); process.exit(2); }
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.pdf') ? 'application/pdf' : 'text/html; charset=utf-8' }); r.end(d); }); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;
// columns where a pixel is lighter than its navy neighbours two pixels away, in at least half the sampled rows
const count = () => new Promise(res => cp.execFile('python', ['-c', `
from PIL import Image
im=Image.open(r'${TMP}').convert('RGB'); W,H=im.size
rows=list(range(int(H*0.45), int(H*0.95), 4))
hits=[0]*W
def navy(p): return p[0]<90 and p[1]<80 and p[2]<160 and p[2]>p[0]+12
for y in rows:
    for x in range(2,W-2):
        a=im.getpixel((x,y)); l=im.getpixel((x-2,y)); r=im.getpixel((x+2,y))
        if navy(l) and navy(r) and sum(a)-sum(l)>25: hits[x]+=1
print(sum(1 for h in hits if h>=len(rows)*0.5))`], (e, so) => res(e ? -1 : parseInt(so) || 0)));
const b = await chromium.launch({ executablePath: CHROME });
// stripOverlap 0 must show gaps somewhere, otherwise the detector is blind
const CONTROL = process.argv.includes('--control');
let bad = 0;
for (const vp of [{ w: 1100, h: 700 }, { w: 1366, h: 768 }, { w: 1920, h: 1080 }, { w: 820, h: 1180 }]) {
	for (const dpr of [1, 1.25, 1.5, 2, 3]) {
		const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: dpr });
		const page = await ctx.newPage();
		await page.goto(base + '/test/harness.html');
		await page.evaluate(ov => new Promise(r => { window.__v = SdFlip.open({ source: '/docs/samples/field-guide.pdf', layout: 'double', stripOverlap: ov, onReady: r }); }), CONTROL ? 0 : 2);
		await page.waitForFunction(() => __v.sheets[0].front.canvas && __v.sheets[0].back.canvas && __v.sheets[1].front.canvas);
		await page.evaluate(() => __v._curlStart(0, 1));
		let total = 0;
		for (const p of [0.003, 0.01, 0.02, 0.04, 0.07, 0.1, 0.15, 0.2, 0.3]) {
			await page.evaluate(p => { __v._curlSet(p); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }, p);
			fs.writeFileSync(TMP, await page.screenshot({ scale: 'css' }));
			const c = await count();
			if (c < 0) { console.log('No Python with Pillow: check skipped'); process.exit(0); }
			total += c;
		}
		if (total) { bad++; }
		console.log(`${total ? 'FAIL' : 'OK  '} ${vp.w}x${vp.h} at DPR ${dpr}: gaps ${total}`);
		await ctx.close();
	}
}
await b.close(); srv.close(); fs.rmSync(TMP, { force: true });
if (CONTROL) {
	console.log(bad ? `\nControl (stripOverlap 0): gaps seen in ${bad} configurations, the detector works` : '\nControl (stripOverlap 0): no gaps seen, the detector may be blind');
	process.exit(bad ? 0 : 1);
}
console.log(bad ? `\nGaps found in ${bad} configurations` : '\nNo gaps in any configuration');
process.exit(bad ? 1 : 0);
