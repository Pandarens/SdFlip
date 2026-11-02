// SdFlip autotest.
//   node test/run.mjs              — every PDF in docs/samples
//   node test/run.mjs --headed     — show the browser window
//   node test/run.mjs --only=deck  — only files whose name contains the string
//   node test/run.mjs --no-mobile  — skip the phone and tablet scenarios
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SAMPLES = path.join(ROOT, 'docs', 'samples');
const REPORT = process.env.SDF_REPORT ? path.resolve(process.env.SDF_REPORT) : path.join(HERE, 'report');
const args = process.argv.slice(2);
const HEADED = args.includes('--headed');
const ONLY = (args.find(a => a.startsWith('--only=')) || '').slice(7).toLowerCase();

const CHROME = [
	process.env.CHROME_PATH,
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/usr/bin/google-chrome',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(p => p && fs.existsSync(p));

// what each sample must turn into; see tools/make-samples.py
const EXPECT = {
	'field-guide': { pdf: 12, book: 12, single: false, outline: 12, word: 'lighthouse', wordPage: 8 },
	'chroma-spreads': { pdf: 6, book: 10, single: false, spreads: 4 },
	'landscape-deck': { pdf: 8, book: 8, single: true },
	'mixed-sizes': { pdf: 8, book: 8, single: false, fit: 2 }
};
// first library frame of a page error: "sdflip.js:1426"
const where = e => { const m = /\/(sdflip\.js:\d+)/.exec(e.stack || ''); return m ? ' @ ' + m[1] : ''; };

/* ---------- local server with Range support, like a regular host ---------- */
const MIME = {
	'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript',
	'.css': 'text/css; charset=utf-8', '.pdf': 'application/pdf', '.png': 'image/png', '.json': 'application/json'
};
function startServer() {
	const srv = http.createServer((req, res) => {
		let rel;
		try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
		catch { res.writeHead(400); return res.end(); }
		const file = path.normalize(path.join(ROOT, rel));
		if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
		fs.stat(file, (err, st) => {
			if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
			const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
			const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
			if (m) {
				let start = m[1] ? +m[1] : 0;
				let end = m[2] ? +m[2] : st.size - 1;
				if (!m[1] && m[2]) { start = st.size - +m[2]; end = st.size - 1; }
				end = Math.min(end, st.size - 1);
				res.writeHead(206, {
					'Content-Type': type, 'Accept-Ranges': 'bytes',
					'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1
				});
				return fs.createReadStream(file, { start, end }).pipe(res);
			}
			res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
			fs.createReadStream(file).pipe(res);
		});
	});
	return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

/* ---------- file list ---------- */
function sampleFiles() {
	return fs.readdirSync(SAMPLES).filter(f => f.toLowerCase().endsWith('.pdf')).sort().map(f => ({
		title: f.replace(/\.pdf$/i, ''),
		src: '/docs/samples/' + f,
		size: fs.statSync(path.join(SAMPLES, f)).size
	}));
}

/* ---------- scenario for one PDF ---------- */
async function testPdf(browser, base, item, idx) {
	const r = { idx, title: item.title, size: item.size, pages: 0, checks: [], shots: [], ok: true };
	const check = (name, pass, info = '', skip = false) => {
		r.checks.push({ name, pass, info, skip });
		if (!pass && !skip) { r.ok = false; }
	};
	const want = EXPECT[item.title];

	const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
	const page = await ctx.newPage();
	const errors = [];
	page.on('pageerror', e => errors.push('JS error: ' + e.message + where(e)));
	// "Failed to load resource" in the console has no URL, so watch the responses instead
	page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) { errors.push('console: ' + m.text()); } });
	page.on('response', q => { if (q.status() >= 400) { errors.push('HTTP ' + q.status() + ': ' + decodeURI(q.url())); } });
	page.on('requestfailed', q => {
		const u = q.url();
		if (!/favicon/.test(u) && !/ERR_ABORTED/.test((q.failure() || {}).errorText || '')) {
			errors.push('request failed: ' + decodeURI(u) + ' ' + ((q.failure() || {}).errorText || ''));
		}
	});
	const shot = async (step) => {
		const f = `${String(idx).padStart(2, '0')}-${step}.png`;
		await page.screenshot({ path: path.join(REPORT, f) });
		r.shots.push({ step, file: f });
	};
	const idle = () => page.waitForFunction(() => window.__v && !window.__v.busy, null, { timeout: 8000 });
	// a book page is on screen: in a spread, either half counts
	const showing = n => page.evaluate(n => { const p = __v.page(); return __v.single ? p === n : (p === n || p + 1 === n); }, n);

	try {
		await page.goto(base + '/test/harness.html');
		const t0 = Date.now();
		const ready = await page.evaluate(({ src, title }) => new Promise(resolve => {
			const snd = window.__snd = { turn: 0, land: 0, thud: 0 };
			const v = window.__v = SdFlip.open({
				source: src, title,
				onReady: () => resolve('ok'),
				onError: e => resolve('error: ' + (e && e.message))
			});
			['turn', 'land', 'thud'].forEach(k => {
				const orig = v.sound[k];
				v.sound[k] = function () { snd[k]++; return orig.apply(v.sound, arguments); };
			});
			setTimeout(() => resolve('did not open in 45 s'), 45000);
		}), { src: item.src, title: item.title });
		check('Opens', ready === 'ok', ready === 'ok' ? `${Date.now() - t0} ms` : ready);
		if (ready !== 'ok') { await shot('error'); throw new Error('stop'); }

		check('Appears with pages already drawn', await page.evaluate(() => __v.revealedWithPages === true));
		// unusual PDFs: no page is distorted, spreads come together as in the original
		const geo = await page.evaluate(async () => {
			const d = __v.doc, n = d.count(), bad = [];
			for (let v = 1; v <= n; v++) {
				const c = await d.render(v, 160);
				const r = c.width / c.height;
				if (Math.abs(r / d._aspect - 1) > 0.02) { bad.push(v + ': ' + r.toFixed(2)); }
			}
			const pages = d.pages || [];
			const misaligned = pages.map((pg, i) => ({ pg, num: i + 1 })).filter(x => x.pg.part === 'left' && (x.num % 2 !== 0 || !pages[x.num] || pages[x.num].part !== 'right')).map(x => x.num);
			return {
				bad, misaligned, n, pdf: d.pdf.numPages, aspect: d._aspect.toFixed(2),
				spreads: pages.filter(x => x.part === 'left').length,
				fit: pages.filter(x => x.fit).length,
				blank: pages.filter(x => x.part === 'blank').length,
				single: __v.single
			};
		});
		check('Pages are not distorted', geo.bad.length === 0,
			`book aspect ${geo.aspect}; PDF pages ${geo.pdf} → book pages ${geo.n}` + (geo.spreads ? `, spreads ${geo.spreads}` : '') + (geo.fit ? `, fitted with margins ${geo.fit}` : '') + (geo.blank ? `, blank ${geo.blank}` : '') + (geo.bad.length ? '; distorted: ' + geo.bad.join(', ') : ''));
		if (geo.spreads) {
			check('Spreads in their places', geo.misaligned.length === 0, geo.misaligned.length ? 'shifted: ' + geo.misaligned.join(', ') : 'left half on an even page, right half next to it');
		}
		if (want) {
			const got = { pdf: geo.pdf, book: geo.n, single: geo.single, spreads: geo.spreads, fit: geo.fit };
			const diff = ['pdf', 'book', 'single', 'spreads', 'fit'].filter(k => (want[k] || (k === 'single' ? false : 0)) !== got[k]);
			check('Layout matches the sample', diff.length === 0,
				`${geo.pdf} → ${geo.n} pages, ${geo.single ? 'single' : 'double'}` + (diff.length ? '; differs: ' + diff.map(k => `${k} ${got[k]} (want ${want[k] || 0})`).join(', ') : ''));
		}
		const info = await page.evaluate(() => ({ pages: __v.doc.count(), single: __v.single, aspect: __v.doc._aspect }));
		r.pages = info.pages;
		r.layout = info.single ? 'single' : 'double';

		await page.waitForFunction(() => { const s = __v.sheets[__v.state]; return s && s.front.canvas; }, null, { timeout: 20000 });
		const ink = await page.evaluate(() => {
			const c = __v.sheets[__v.state].front.canvas;
			const t = document.createElement('canvas');
			t.width = 80; t.height = Math.max(1, Math.round(80 * c.height / c.width));
			const x = t.getContext('2d');
			x.drawImage(c, 0, 0, t.width, t.height);
			const d = x.getImageData(0, 0, t.width, t.height).data;
			let n = 0;
			for (let i = 0; i < d.length; i += 4) { if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) { n++; } }
			return n / (d.length / 4);
		});
		check('Page is rendered', ink > 0.003, `${(ink * 100).toFixed(1)}% of the page has ink`);
		await shot('open');

		if (info.pages > 1) {
			// flip forward: the sheet curls, one rustle and one slap sound
			await page.evaluate(() => __v.next());
			await page.waitForTimeout(380);
			const mid = await page.evaluate(() => ({
				curl: !!document.querySelector('.sdf-curl'),
				strips: document.querySelectorAll('.sdf-strip').length,
				cast: parseFloat(getComputedStyle(__v.cast).opacity)
			}));
			await shot('flip-mid');
			check('Sheet curls in an arc', mid.curl && mid.strips >= 14, `${mid.strips} strips, shadow ${mid.cast.toFixed(2)}`);
			await idle();
			const st = await page.evaluate(() => ({ state: __v.state, label: __v.pageInput.value, snd: { ...__snd }, audio: __v.sound.ctx && __v.sound.ctx.state }));
			check('Flip forward', st.state === 1, `showing: ${st.label}`);
			check('Flip sound: one rustle and one slap', st.snd.turn === 1 && st.snd.land === 1, `rustle ${st.snd.turn}, slap ${st.snd.land}`);
			check('Audio running', st.audio === 'running', String(st.audio));
			await shot('page2');

			await page.evaluate(() => __v.prev());
			await idle();
			check('Flip back', await page.evaluate(() => __v.state === 0));

			await page.evaluate(() => __v.goTo(__v.doc.count()));
			await idle();
			check('Go to the end', await page.evaluate(() => __v.state === __v._stateFor(__v.doc.count())));
			await page.evaluate(() => __v.goTo(1));
			await idle();

			// smoothness and edges: per frame, book shift and bounds of the curling sheet
			const sm = await page.evaluate(() => new Promise(res => {
				const v = __v, xs = [];
				const vpR = v.viewport.getBoundingClientRect(), tbR = v.toolbar.getBoundingClientRect();
				let over = 0, under = 0, alive = true;
				const tick = () => {
					const q = v.book.getBoundingClientRect();
					xs.push(q.left + q.width / 2);
					const curl = document.querySelector('.sdf-curl');
					if (curl) {
						let top = 1e9, bot = -1e9;
						curl.querySelectorAll('.sdf-sf, .sdf-sb').forEach(f => { const r = f.getBoundingClientRect(); if (r.height > 0) { top = Math.min(top, r.top); bot = Math.max(bot, r.bottom); } });
						over = Math.max(over, vpR.top - top);
						under = Math.max(under, bot - tbR.top);
					}
					if (alive) { requestAnimationFrame(tick); }
				};
				requestAnimationFrame(tick);
				v.next();
				const done = () => {
					if (v.busy) { setTimeout(done, 30); return; }
					setTimeout(() => {
						alive = false;
						let m = 0;
						for (let i = 1; i < xs.length; i++) { m = Math.max(m, Math.abs(xs[i] - xs[i - 1])); }
						res({ max: m, pw: v.pw, frames: xs.length, moved: Math.abs(xs[xs.length - 1] - xs[0]), over, under, single: v.single });
					}, 300);
				};
				setTimeout(done, 60);
			}));
			if (!sm.single) {
				check('Cover opens without a jump', sm.max < sm.pw * 0.12,
					`book moved ${Math.round(sm.moved)}px over ${sm.frames} frames, at most ${Math.round(sm.max)}px per frame`);
			}
			check('Sheet edges stay off the header and toolbar', sm.over <= 1 && sm.under <= 1,
				`above the viewport: ${Math.max(0, Math.round(sm.over))}px, under the toolbar: ${Math.max(0, Math.round(sm.under))}px`);
			await page.evaluate(() => __v.prev());
			await idle();

			// drag by the page edge
			const b = await page.evaluate(() => { const q = __v.book.getBoundingClientRect(); return { l: q.left, r: q.right, t: q.top, b: q.bottom }; });
			const y = Math.round((b.t + b.b) / 2);
			await page.mouse.move(b.r - 25, y);
			await page.mouse.down();
			await page.mouse.move(b.r - 160, y - 12, { steps: 10 });
			const dragging = await page.evaluate(() => !!document.querySelector('.sdf-curl'));
			await shot('drag');
			await page.mouse.move(b.l - 200, y, { steps: 14 });
			await page.mouse.up();
			await idle();
			const dragged = await page.evaluate(() => __v.state);
			check('Mouse drag', dragging && dragged === 1, dragging ? `after the throw, spread ${dragged} is open` : 'the sheet did not lift');

			await page.keyboard.press('ArrowRight');
			await idle();
			check('Keyboard (arrows)', await page.evaluate(() => __v.state === Math.min(2, __v.sheets.length)));

			// rapid flipping: three presses in a row, three sheets, none dropped
			const total = await page.evaluate(() => __v.sheets.length);
			if (total >= 2) {
				await page.evaluate(() => __v.goTo(1));
				await idle();
				const want3 = Math.min(3, total);
				await page.keyboard.press('ArrowRight');
				await page.waitForTimeout(60);
				await page.keyboard.press('ArrowRight');
				await page.waitForTimeout(60);
				await page.keyboard.press('ArrowRight');
				await page.waitForTimeout(200);
				await page.waitForFunction(() => !__v.busy && !__v._queue.length, null, { timeout: 10000 });
				const got = await page.evaluate(() => __v.state);
				check('Rapid flipping: 3 presses in a row', got === want3, `sheets turned: ${got} of ${want3}`);
			}

			// the corner lifts on mouse hover, a click on it flips
			await page.evaluate(() => __v.goTo(1));
			await idle();
			const bb = await page.evaluate(() => { const q = __v.book.getBoundingClientRect(); return { r: q.right, b: q.bottom }; });
			await page.mouse.move(bb.r - 120, bb.b - 140);
			await page.mouse.move(bb.r - 14, bb.b - 16, { steps: 6 });
			await page.waitForTimeout(450);
			const peek = await page.evaluate(() => ({ curl: !!__v.curl, p: __v.curl ? __v.curl.p : 0, peek: !!__v._peek }));
			await shot('peel');
			check('Corner lifts on hover', peek.curl && peek.peek && peek.p > 0.01 && peek.p < 0.15, `lifted ${(peek.p * 100).toFixed(1)}% of the travel`);
			const before = await page.evaluate(() => __v.state);
			await page.mouse.down();
			await page.mouse.up();
			await idle();
			const after = await page.evaluate(() => __v.state);
			check('Click on the corner flips', after === before + 1, `was ${before}, now ${after}`);
			await page.mouse.move(5, 5);
			await page.waitForTimeout(300);
			check('Corner drops when the mouse leaves', await page.evaluate(() => !__v.curl && !__v._peek));

			// memory: only pages near the open one are kept
			await page.evaluate(() => __v.goTo(__v.doc.count()));
			await idle();
			await page.evaluate(() => __v.goTo(1));
			await idle();
			await page.waitForTimeout(600);
			const mem = await page.evaluate(() => {
				let faces = 0;
				__v.sheets.forEach(s => { if (s.front.canvas) { faces++; } if (s.back.canvas) { faces++; } });
				return { faces, limit: __v.single ? 7 : 14, pages: __v.doc.count() };
			});
			check('Memory: keeps only nearby pages', mem.faces <= mem.limit, `pages in memory: ${mem.faces} (limit ${mem.limit}, in file ${mem.pages})`);
		} else {
			check('Flipping', true, 'single-page file', true);
		}

		// PDF links: the last page of the guide and of the deck links to the repo
		const linkInfo = await page.evaluate(async () => {
			let total = 0, sample = '';
			for (let p = 1; p <= __v.doc.count(); p++) {
				const l = await __v.doc.links(p);
				total += l.length;
				if (l.length && !sample) { sample = l[0].url || 'internal destination'; }
			}
			return { total, sample };
		});
		if (linkInfo.total) {
			await page.evaluate(() => __v.goTo(__v.doc.count()));
			await idle();
			await page.waitForTimeout(500);
			const shown = await page.evaluate(() => [...document.querySelectorAll('.sdf-link')].map(a => a.getAttribute('href')));
			check('PDF links are clickable', shown.length >= 1, `links in file ${linkInfo.total}, on screen: ${shown.join(', ')}`);
			await page.evaluate(() => __v.goTo(1));
			await idle();
		} else {
			check('PDF links are clickable', true, 'no links in file', true);
		}

		if (want && want.outline) {
			// web, email and phone links on the "Search, outline and links" page
			await page.evaluate(() => __v.goTo(7));
			await idle();
			const ext = await page.waitForFunction(() => {
				const h = [...document.querySelectorAll('.sdf-link')].map(a => a.getAttribute('href'));
				return ['https://github.com/Pandarens/SdFlip', 'mailto:hello@example.com', 'tel:+15550100'].every(u => h.includes(u)) && h;
			}, null, { timeout: 8000 }).then(h => h.jsonValue()).catch(() => null);
			const titles = await page.evaluate(() => [...document.querySelectorAll('.sdf-link')].map(a => a.title));
			check('Web, email and phone links', !!ext && titles.includes('Email: hello@example.com') && titles.includes('Call: +15550100'),
				ext ? [...new Set(ext)].join(', ') : 'missing; on screen: ' + titles.join(', '));

			// internal links on the contents page: the last one leads to "Options at a glance" (page 11)
			await page.evaluate(() => __v.goTo(2));
			await idle();
			const clicked = await page.waitForFunction(() => {
				const face = [...document.querySelectorAll('.sdf-links')].find(l => l.querySelectorAll('.sdf-link[href="#"]').length >= 9);
				if (!face) { return false; }
				const links = [...face.querySelectorAll('.sdf-link[href="#"]')];
				links.sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));
				links[links.length - 1].click();
				return links.length + ' / ' + links[links.length - 1].title;
			}, null, { timeout: 8000 }).then(h => h.jsonValue()).catch(() => null);
			await page.waitForTimeout(150);
			await idle();
			check('Internal link jumps to its page', !!clicked && await showing(11), clicked ? `${clicked} → page ${await page.evaluate(() => __v.page())}` : 'no internal links on the contents page');

			// outline: 12 entries, an entry leads to its page
			await page.evaluate(() => __v._togglePanel('outline'));
			const outN = await page.waitForFunction(n => document.querySelectorAll('.sdf-out-item').length >= n && document.querySelectorAll('.sdf-out-item').length,
				want.outline, { timeout: 10000 }).then(h => h.jsonValue()).catch(() => page.evaluate(() => document.querySelectorAll('.sdf-out-item').length));
			await page.evaluate(() => [...document.querySelectorAll('.sdf-out-item')].find(b => b.textContent === 'Fast on slow phones').click());
			await page.waitForTimeout(150);
			await idle();
			check('Outline', outN === want.outline && await showing(8), `${outN} entries; "Fast on slow phones" → page ${await page.evaluate(() => __v.page())}`);
			await shot('outline');
			await page.evaluate(() => __v._togglePanel('outline'));
			await page.evaluate(() => __v.goTo(1));
			await idle();
		}
		const prepared = await page.evaluate(() => !!(__v.sound.turnBufs && __v.sound.turnBufs.length === 3 && __v.sound.landBufs));
		check('Sounds prepared in advance', prepared, prepared ? '6 rustle variants, 4 slaps' : 'synthesized on the fly');

		// thumbnails
		await page.evaluate(() => __v._togglePanel('thumbs'));
		const thumbsOk = await page.waitForFunction(n => document.querySelectorAll('.sdf-thumb canvas').length >= n,
			Math.min(3, info.pages), { timeout: 15000 }).then(() => true).catch(() => false);
		check('Thumbnails', thumbsOk, await page.evaluate(() => document.querySelectorAll('.sdf-thumb canvas').length + ' ready'));
		await shot('thumbs');

		// text search
		const runSearch = async q => {
			await page.evaluate(() => __v._showPane('search'));
			await page.fill('.sdf-search-form input', q);
			await page.press('.sdf-search-form input', 'Enter');
			await page.waitForFunction(() => /^(Pages found|Nothing found)/.test((document.querySelector('.sdf-results .sdf-note') || {}).textContent || ''), null, { timeout: 30000 });
			return page.evaluate(() => ({
				note: document.querySelector('.sdf-results .sdf-note').textContent,
				pages: [...document.querySelectorAll('.sdf-hit i')].map(i => parseInt(i.textContent.replace(/\D+/g, ''), 10))
			}));
		};
		const word = want && want.word ? want.word : await page.evaluate(async () => {
			for (let p = 1; p <= Math.min(4, __v.doc.count()); p++) {
				const t = await __v.doc.pageText(p);
				const w = (t.match(/[A-Za-z]{5,}/g) || [])[0];
				if (w) { return w; }
			}
			return null;
		});
		if (!word) {
			check('Text search', true, 'the PDF has no text layer (image only), skipped', true);
		} else {
			const res = await runSearch(word);
			if (want && want.wordPage) {
				// the expected set comes straight from pdf.js, not from the viewer's search
				const truth = await page.evaluate(async w => {
					const out = [];
					for (let p = 1; p <= __v.doc.pdf.numPages; p++) {
						const tc = await (await __v.doc.pdf.getPage(p)).getTextContent();
						if (tc.items.map(i => i.str).join(' ').toLowerCase().includes(w)) { out.push(p); }
					}
					return out;
				}, word);
				check('Text search', res.pages.includes(want.wordPage) && res.pages.join() === truth.join() && res.note === `Pages found: ${truth.length}`,
					`"${word}": pages ${res.pages.join(', ')} (text layer has it on ${truth.join(', ')}); "${res.note}"`);
			} else {
				check('Text search', res.pages.length >= 1 && /^Pages found: \d+$/.test(res.note), `"${word}": pages ${res.pages.length}; "${res.note}"`);
			}
			const none = await runSearch('qzxjvw');
			check('Search with no hits', none.pages.length === 0 && none.note === 'Nothing found.', `"${none.note}"`);
		}
		await page.evaluate(() => __v._togglePanel(__v._pane));
		await page.waitForTimeout(300);

		// zoom
		await page.evaluate(() => __v.setZoom(2));
		const z = await page.evaluate(() => __v.zoomer.style.transform);
		check('Zoom', /scale\(2(\.0+)?\)/.test(z), z);
		await page.evaluate(() => __v.setZoom(1));

		// download
		const dl = await Promise.all([
			page.waitForEvent('download', { timeout: 8000 }),
			page.evaluate(() => __v.bDown.click())
		]).then(([d]) => d.suggestedFilename()).catch(e => 'none: ' + e.message.split('\n')[0]);
		check('Download button', !/^none:/.test(dl), dl);

		// close
		await page.keyboard.press('Escape');
		await page.waitForTimeout(400);
		check('Esc closes', await page.evaluate(() => !document.querySelector('.sdf-root')));

		check('No console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
	} catch (e) {
		if (e.message !== 'stop') { check('Scenario ran without a crash', false, e.message.split('\n')[0]); }
		if (errors.length) { check('No console errors', false, errors.slice(0, 3).join(' | ')); }
	}
	await ctx.close();
	return r;
}

/* ---------- phones and tablets: real touches through the Chrome protocol ---------- */
const DEVICES = [
	{ name: 'iPhone 13', width: 390, height: 844, dpr: 3 },
	{ name: 'Android 360', width: 360, height: 740, dpr: 3 },
	{ name: 'Narrow 320', width: 320, height: 568, dpr: 2 },
	{ name: 'Phone landscape', width: 844, height: 390, dpr: 3 },
	{ name: 'iPad', width: 820, height: 1180, dpr: 2 }
];

async function testDevice(browser, base, item, dev, idx) {
	const r = { idx, title: `${dev.name} ${dev.width}×${dev.height}: ${item.title}`, checks: [], shots: [], ok: true };
	const check = (name, pass, info = '', skip = false) => {
		r.checks.push({ name, pass, info, skip });
		if (!pass && !skip) { r.ok = false; }
	};
	const ctx = await browser.newContext({
		viewport: { width: dev.width, height: dev.height }, deviceScaleFactor: dev.dpr,
		isMobile: true, hasTouch: true,
		userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
	});
	const page = await ctx.newPage();
	const errors = [];
	page.on('pageerror', e => errors.push('JS error: ' + e.message + where(e)));
	page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) { errors.push('console: ' + m.text()); } });
	page.on('response', q => { if (q.status() >= 400) { errors.push('HTTP ' + q.status() + ': ' + decodeURI(q.url())); } });
	const cdp = await ctx.newCDPSession(page);
	const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', {
		type, touchPoints: pts.map((p, i) => ({ x: Math.round(p.x), y: Math.round(p.y), id: i, radiusX: 4, radiusY: 4, force: 1 }))
	});
	const wait = ms => page.waitForTimeout(ms);
	const swipe = async (x1, y1, x2, y2, opts = {}) => {
		const steps = opts.steps || 12, dur = opts.dur || 260;
		await touch('touchStart', [{ x: x1, y: y1 }]);
		let mid = null;
		for (let i = 1; i <= steps; i++) {
			await touch('touchMove', [{ x: x1 + (x2 - x1) * i / steps, y: y1 + (y2 - y1) * i / steps }]);
			await wait(dur / steps);
			if (i === Math.round(steps / 2) && opts.atMiddle) { mid = await opts.atMiddle(); }
		}
		await touch('touchEnd', []);
		return mid;
	};
	const tap = async (x, y) => { await touch('touchStart', [{ x, y }]); await wait(45); await touch('touchEnd', []); };
	// a tap on a PDF link follows the link by design, and mobile browsers snap taps to links nearby,
	// so tap-zone checks aim at a spot with no link within 30px
	const freeY = (x, y0) => page.evaluate(([x, y0]) => {
		const clear = (x, y) => {
			for (let dy = -30; dy <= 30; dy += 5) {
				for (let dx = -30; dx <= 30; dx += 10) {
					const el = document.elementFromPoint(x + dx, y + dy);   // null off screen: nothing to snap to
					if (el && el.closest('.sdf-link')) { return false; }
				}
			}
			const el = document.elementFromPoint(x, y);
			return !!(el && el.closest('.sdf-stage'));
		};
		for (let d = 0; d < 320; d += 6) {
			for (const y of [y0 + d, y0 - d]) { if (clear(x, y)) { return y; } }
		}
		return y0;
	}, [x, y0]);
	const pinch = async (cx, cy, d0, d1) => {
		const pts = d => [{ x: cx - d / 2, y: cy }, { x: cx + d / 2, y: cy }];
		await touch('touchStart', pts(d0));
		for (let i = 1; i <= 10; i++) { await touch('touchMove', pts(d0 + (d1 - d0) * i / 10)); await wait(25); }
		await touch('touchEnd', []);
	};
	const idle = () => page.waitForFunction(() => !window.__v.busy, null, { timeout: 8000 });
	const shot = async step => {
		const f = `m${String(idx).padStart(2, '0')}-${step}.png`;
		await page.screenshot({ path: path.join(REPORT, f) });
		r.shots.push({ step, file: f });
	};
	const geom = () => page.evaluate(() => {
		const b = __v.book.getBoundingClientRect(), t = __v.toolbar.getBoundingClientRect();
		const h = __v.root.querySelector('.sdf-head').getBoundingClientRect();
		return { W: innerWidth, H: innerHeight, b: { l: b.left, r: b.right, t: b.top, bt: b.bottom, w: b.width },
			tb: { l: t.left, r: t.right, t: t.top, bt: t.bottom }, headBottom: h.bottom, single: __v.single, page: __v.page(), state: __v.state, zoom: __v.zoom };
	});
	const fits = g => g.b.l >= -1 && g.b.r <= g.W + 1 && g.b.t >= g.headBottom - 1 && g.b.bt <= g.tb.t + 6;

	try {
		await page.goto(base + '/test/harness.html');
		// open on a tap, as on a real site: this also checks the audio unlock
		await page.evaluate(src => {
			const b = document.createElement('button');
			b.id = 'opener';
			b.textContent = 'Open';
			b.style.cssText = 'position:fixed;left:20px;top:60px;width:160px;height:60px;z-index:5';
			b.addEventListener('click', () => {
				window.__snd = { turn: 0, land: 0 };
				const v = window.__v = SdFlip.open({ source: src, title: 'Test', onReady: () => { window.__ready = 'ok'; }, onError: e => { window.__ready = 'error: ' + e.message; } });
				['turn', 'land'].forEach(k => { const o = v.sound[k]; v.sound[k] = function () { __snd[k]++; return o.apply(v.sound, arguments); }; });
			});
			document.body.appendChild(b);
		}, item.src);
		await page.tap('#opener');
		const ready = await page.waitForFunction(() => window.__ready, null, { timeout: 45000 }).then(h => h.jsonValue()).catch(() => 'timeout');
		check('Opens on a tap', ready === 'ok', ready);
		if (ready !== 'ok') { throw new Error('stop'); }
		await page.waitForFunction(() => { const s = __v.sheets[__v.state]; return s && s.front.canvas; }, null, { timeout: 20000 });
		await wait(250);

		let g = await geom();
		const phonePortrait = dev.width < 600 && dev.height > dev.width;
		if (phonePortrait) { check('Single page on a phone', g.single === true); }
		check('Whole book on screen', fits(g), `book ${Math.round(g.b.w)}px, bottom ${Math.round(g.b.bt)} / toolbar ${Math.round(g.tb.t)}`);
		check('Toolbar fits', g.tb.l >= -1 && g.tb.r <= g.W + 1, `${Math.round(g.tb.r - g.tb.l)}px of ${g.W}`);
		const btnMin = await page.evaluate(() => Math.min(...[...__v.toolbar.querySelectorAll('.sdf-btn')].filter(b => b.offsetParent).map(b => b.getBoundingClientRect().width)));
		check('Buttons are finger-sized', btnMin >= 34, `smallest ${Math.round(btnMin)}px`);
		await shot('open');

		const cy = (g.b.t + g.b.bt) / 2;
		const multi = await page.evaluate(() => __v.sheets.length > 1);
		if (multi) {
			// swipe left: forward
			const midCurl = await swipe(g.W * 0.8, cy, g.W * 0.12, cy + 10, {
				atMiddle: async () => { await shot('swipe'); return page.evaluate(() => !!document.querySelector('.sdf-curl')); }
			});
			await idle();
			const s1 = await page.evaluate(() => __v.state);
			check('Swipe left flips forward', s1 === 1, `sheet curled under the finger: ${midCurl ? 'yes' : 'no'}`);
			check('Sheet curls under the finger', midCurl === true);
			const snd = await page.evaluate(() => ({ ...__snd, audio: __v.sound.ctx && __v.sound.ctx.state }));
			check('Swipe sound: one rustle and one slap', snd.turn === 1 && snd.land === 1 && snd.audio === 'running', `rustle ${snd.turn}, slap ${snd.land}, audio ${snd.audio}`);

			// swipe right: back
			await swipe(g.W * 0.2, cy, g.W * 0.9, cy - 8);
			await idle();
			check('Swipe right flips back', await page.evaluate(() => __v.state === 0));

			// a vertical gesture must not flip
			await swipe(g.W * 0.5, cy - 120, g.W * 0.52, cy + 120);
			await wait(150);
			check('Vertical gesture does not flip', await page.evaluate(() => __v.state === 0 && !__v.busy && !document.querySelector('.sdf-curl')));

			// taps near the edges
			await tap(g.W * 0.92, await freeY(g.W * 0.92, cy));
			await idle();
			const afterRight = await page.evaluate(() => __v.state);
			await wait(400);
			await tap(g.W * 0.08, await freeY(g.W * 0.08, cy));
			await idle();
			const afterLeft = await page.evaluate(() => __v.state);
			check('Edge tap flips', afterRight === 1 && afterLeft === 0, `right → ${afterRight}, left → ${afterLeft}`);

			// gestures that start on a PDF link: a swipe still flips, a tap follows the link
			const linkAt = async () => {
				await wait(500);
				return page.evaluate(() => {
					const ls = [...document.querySelectorAll('.sdf-face .sdf-link')].map(a => a.getBoundingClientRect())
						.filter(r => r.width > 20 && r.top > 0 && r.bottom < innerHeight);
					const r = ls[ls.length - 1];
					return r ? { x: r.left + r.width * 0.6, y: r.top + r.height / 2, n: ls.length } : null;
				});
			};
			const toContents = async () => { await page.evaluate(() => __v.goTo(2)); await idle(); await wait(300); };
			await toContents();
			const lk = await linkAt();
			if (lk && await page.evaluate(() => __v.page() === 2 && __v.single)) {
				await swipe(lk.x, lk.y, lk.x - g.W * 0.7, lk.y + 6);
				await idle();
				const sw = await page.evaluate(() => __v.page());
				await toContents();
				const lk2 = await linkAt();
				await tap(lk2.x, lk2.y);
				await wait(200);
				await idle();
				const tp = await page.evaluate(() => __v.page());
				check('Swipe that starts on a link flips', sw === 3, `page ${sw}`);
				check('Tap on a link follows it', tp === 11, `page ${tp}`);
			}
			await page.evaluate(() => __v.goTo(1));
			await idle();
		} else {
			check('Swipes', true, 'single-page file', true);
		}

		// double tap and panning the zoomed page
		await wait(400);
		const cyFree = await freeY(g.W * 0.5, cy);
		await tap(g.W * 0.5, cyFree);
		await wait(120);
		await tap(g.W * 0.5, cyFree);
		await wait(250);
		const z1 = await page.evaluate(() => __v.zoom);
		check('Double tap zooms in', z1 > 1.8, `zoom ${z1.toFixed(2)}`);
		const pan0 = await page.evaluate(() => ({ ...__v.pan }));
		await swipe(g.W * 0.6, cy, g.W * 0.35, cy - 60, { steps: 8 });
		const pan1 = await page.evaluate(() => ({ ...__v.pan, state: __v.state }));
		check('Zoomed page pans with a finger', Math.abs(pan1.x - pan0.x) > 20 && pan1.state === 0, `moved ${Math.round(pan1.x - pan0.x)}px, no flip`);
		await shot('zoom');
		await wait(400);
		const cyFree2 = await freeY(g.W * 0.5, cy);
		await tap(g.W * 0.5, cyFree2);
		await wait(120);
		await tap(g.W * 0.5, cyFree2);
		await wait(250);
		check('Double tap resets zoom', await page.evaluate(() => __v.zoom === 1));

		// pinch
		await pinch(g.W / 2, cy, 80, Math.min(g.W - 40, 300));
		await wait(150);
		const zp = await page.evaluate(() => __v.zoom);
		await pinch(g.W / 2, cy, Math.min(g.W - 40, 300), 60);
		await wait(250);
		const zp2 = await page.evaluate(() => __v.zoom);
		check('Pinch zooms in and out', zp > 1.5 && zp2 === 1, `${zp.toFixed(2)} → ${zp2.toFixed(2)}`);

		// thumbnails over the book
		const wBefore = (await geom()).b.w;
		await page.tap('.sdf-head .sdf-btn[aria-label="Thumbnails (T)"]');
		await page.waitForFunction(() => document.querySelectorAll('.sdf-thumb canvas').length >= 1, null, { timeout: 15000 });
		await wait(300);
		const wOpen = (await geom()).b.w;
		await shot('thumbs');
		const overlay = dev.width <= 760;
		if (overlay) { check('Thumbnails slide over without shrinking the book', Math.abs(wOpen - wBefore) < 2, `book width ${Math.round(wBefore)} → ${Math.round(wOpen)}`); }
		const n = await page.evaluate(() => __v.doc.count());
		if (n >= 3) {
			await page.tap('.sdf-thumb[data-page="3"]');
			await idle();
			await wait(250);
			const st = await page.evaluate(() => ({ page: __v.page(), single: __v.single, open: __v.side.classList.contains('sdf-open') }));
			const shown = st.single ? st.page === 3 : (st.page === 2 || st.page === 3);
			check('Tapping a thumbnail opens its page', shown && (!overlay || !st.open), `page ${st.page}${overlay ? ', panel closed: ' + (!st.open ? 'yes' : 'no') : ''}`);
		} else {
			await page.tap('.sdf-head .sdf-btn[aria-label="Thumbnails (T)"]');
		}

		// the search field does not zoom the page on iPhone (font 16px or more)
		const fs16 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.sdf-search-form input')).fontSize));
		check('Search field without iPhone auto-zoom', fs16 >= 16, `font ${fs16}px`);

		// rotation
		const before = await page.evaluate(() => __v.page());
		await page.setViewportSize({ width: dev.height, height: dev.width });
		await wait(700);
		await idle();
		g = await geom();
		const visible = g.single ? g.page === before : (before >= g.page && before <= g.page + 1) || g.page === before;
		check('Screen rotation', fits(g) && visible, `was page ${before}, now ${g.page} (${g.single ? 'single' : 'double'})`);
		await shot('rotated');

		await page.keyboard.press('Escape');
		await page.waitForTimeout(400);
		check('Focus returns to the opener after close', await page.evaluate(() => document.activeElement && document.activeElement.id === 'opener'));
		check('No console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
	} catch (e) {
		if (e.message !== 'stop') { check('Scenario ran without a crash', false, e.message.split('\n')[0]); }
	}
	await ctx.close();
	return r;
}

/* ---------- viewer embedded in a page ---------- */
async function testInline(browser, base, item) {
	const r = { idx: 96, title: 'Embedded in a page: ' + item.title, checks: [], shots: [], ok: true };
	const check = (name, pass, info = '') => { r.checks.push({ name, pass, info }); if (!pass) { r.ok = false; } };
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const page = await ctx.newPage();
	const errors = [];
	page.on('pageerror', e => errors.push('JS error: ' + e.message + where(e)));
	try {
		await page.goto(base + '/test/harness.html');
		const ready = await page.evaluate(src => new Promise(res => {
			document.body.insertAdjacentHTML('beforeend', '<div style="height:300px">site header</div><div id="box" style="height:600px"></div><div style="height:1500px">site footer</div>');
			window.__v = SdFlip.inline('#box', { source: src, title: 'Catalog', onReady: () => res('ok'), onError: e => res('error: ' + e.message) });
			setTimeout(() => res('timeout'), 30000);
		}), item.src);
		check('Opens inside the page', ready === 'ok', ready);
		await page.waitForFunction(() => __v.sheets[__v.state] && __v.sheets[__v.state].front.canvas, null, { timeout: 20000 });
		const box = await page.evaluate(() => { const q = document.getElementById('box').getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
		// the wheel over the viewer scrolls the page and does not flip
		await page.mouse.move(box.x, box.y);
		const y0 = await page.evaluate(() => scrollY);
		await page.mouse.wheel(0, 400);
		await page.waitForTimeout(500);
		const after = await page.evaluate(() => ({ y: scrollY, state: __v.state, busy: __v.busy }));
		check('Mouse wheel scrolls the site', after.y > y0 && after.state === 0 && !after.busy, `scroll ${y0} → ${after.y}, spread ${after.state}`);
		// arrows are not captured while the mouse is outside the viewer
		await page.evaluate(() => window.scrollTo(0, 0));
		await page.waitForTimeout(150);
		await page.mouse.move(640, 150);   // over the "site header", outside the viewer
		await page.keyboard.press('ArrowRight');
		await page.waitForTimeout(300);
		check('Arrows are not captured outside the viewer', await page.evaluate(() => __v.state === 0 && !__v.busy));
		// over the viewer an arrow flips
		const box2 = await page.evaluate(() => { const q = document.getElementById('box').getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
		await page.mouse.move(box2.x, box2.y);
		await page.keyboard.press('ArrowRight');
		await page.waitForFunction(() => !__v.busy, null, { timeout: 8000 });
		check('Arrow flips over the viewer', await page.evaluate(() => __v.state === 1));
		await page.screenshot({ path: path.join(REPORT, 'inline.png') });
		r.shots.push({ step: 'inline', file: 'inline.png' });
		check('No console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
	} catch (e) { check('Scenario', false, e.message.split('\n')[0]); }
	await ctx.close();
	return r;
}

/* ---------- UI language: English from <html lang="en">, Russian from the lang option ---------- */
async function testLocale(browser, base, item) {
	const r = { idx: 97, title: 'UI language: ' + item.title, checks: [], shots: [], ok: true };
	const check = (name, pass, info = '') => { r.checks.push({ name, pass, info }); if (!pass) { r.ok = false; } };
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'de-DE' });
	const page = await ctx.newPage();
	const errors = [];
	page.on('pageerror', e => errors.push('JS error: ' + e.message + where(e)));
	const open = lang => page.evaluate(({ src, lang }) => new Promise(res => {
		if (window.__v) { __v.destroy(); }
		window.__v = SdFlip.open({ source: src, lang, onReady: () => res('ok'), onError: e => res('error: ' + e.message) });
		setTimeout(() => res('timeout'), 30000);
	}), { src: item.src, lang });
	const labels = () => page.evaluate(() => ({
		thumbs: __v.bThumbs.getAttribute('aria-label'),
		down: __v.bDown.getAttribute('aria-label'),
		tabs: [...__v.tabs.children].map(t => t.textContent).join(' / '),
		live: __v.live.textContent
	}));
	try {
		await page.goto(base + '/test/harness.html');
		check('Opens', await open(null) === 'ok');
		const en = await labels();
		check('English from <html lang="en">', en.thumbs === 'Thumbnails (T)' && en.down === 'Download PDF' && en.tabs === 'Pages / Contents / Search' && /^Page 1 of \d+$/.test(en.live),
			`${en.thumbs}; ${en.down}; ${en.tabs}; "${en.live}"`);
		check('Opens with lang: ru', await open('ru') === 'ok');
		const ru = await labels();
		check('Russian from the lang option', ru.thumbs === 'Миниатюры (T)' && ru.down === 'Скачать PDF' && ru.tabs === 'Страницы / Содержание / Поиск' && /^Страница 1 из \d+$/.test(ru.live),
			`${ru.thumbs}; ${ru.down}; ${ru.tabs}; "${ru.live}"`);
		await page.evaluate(() => __v._togglePanel('search'));
		await page.fill('.sdf-search-form input', 'qzxjvw');
		await page.press('.sdf-search-form input', 'Enter');
		const note = await page.waitForFunction(() => {
			const t = (document.querySelector('.sdf-results .sdf-note') || {}).textContent || '';
			return !/…/.test(t) && t;
		}, null, { timeout: 15000 }).then(h => h.jsonValue()).catch(() => 'timeout');
		check('Russian search note', note === 'Ничего не найдено.', `"${note}"`);
		await page.screenshot({ path: path.join(REPORT, 'locale-ru.png') });
		r.shots.push({ step: 'lang: ru', file: 'locale-ru.png' });
		check('No console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
	} catch (e) { check('Scenario', false, e.message.split('\n')[0]); }
	await ctx.close();
	return r;
}

/* ---------- harness opened from disk (file://) ---------- */
async function testFileProtocol(browser, item) {
	const r = { idx: 98, title: 'Harness opened from disk (file://)', checks: [], shots: [], ok: true };
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const page = await ctx.newPage();
	const result = () => page.waitForFunction(() => {
		const err = document.querySelector('.sdf-error');
		if (err) { return 'error:' + err.innerText; }
		return document.querySelector('.sdf-face canvas') ? 'ok' : false;
	}, null, { timeout: 30000 }).then(h => h.jsonValue()).catch(() => 'timeout');
	try {
		await page.goto(pathToFileURL(path.join(HERE, 'harness.html')).href);
		await page.waitForFunction(() => !!window.SdFlip, null, { timeout: 10000 });
		// a URL source cannot be read from file://: the viewer must say why instead of failing silently
		await page.evaluate(() => { window.__v = SdFlip.open({ source: '../docs/samples/field-guide.pdf' }); });
		const res = await result();
		await page.screenshot({ path: path.join(REPORT, 'file-protocol.png') });
		r.shots.push({ step: 'file://', file: 'file-protocol.png' });
		const explained = /^error:Could not open the document/.test(res) && /opened from disk \(file:\/\/\)/.test(res);
		r.checks.push({ name: 'Clear message instead of a silent failure', pass: explained, info: res.replace(/\n/g, ' ').slice(0, 200) });

		// a PDF picked from disk must open without a server
		await page.keyboard.press('Escape');
		await page.waitForFunction(() => !document.querySelector('.sdf-root'), null, { timeout: 5000 });
		await page.setInputFiles('#own-pdf', path.join(SAMPLES, item.title + '.pdf'));
		const own = await result();
		await page.waitForTimeout(500);
		await page.screenshot({ path: path.join(REPORT, 'file-own.png') });
		r.shots.push({ step: 'own pdf', file: 'file-own.png' });
		const pages = own === 'ok' ? await page.evaluate(() => __v.doc && __v.doc.count()) : 0;
		r.checks.push({ name: 'Own PDF from disk opens without a server', pass: own === 'ok' && pages > 0, info: own === 'ok' ? `${pages} pages` : own.replace(/\n/g, ' ').slice(0, 160) });
	} catch (e) {
		r.checks.push({ name: 'Scenario', pass: false, info: e.message.split('\n')[0] });
	}
	r.ok = r.checks.every(c => c.pass);
	await ctx.close();
	return r;
}

/* ---------- report ---------- */
function writeReport(results, title) {
	const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
	const ok = results.filter(r => r.ok).length;
	const rows = results.map(r => `
<section class="${r.ok ? 'ok' : 'bad'}">
 <h2>${r.ok ? '✔' : '✖'} ${esc(r.title)} <small>${r.pages ? r.pages + ' pages' : ''} ${r.size ? (r.size / 1024).toFixed(0) + ' KB' : ''} ${r.layout || ''}</small></h2>
 <ul>${r.checks.map(c => `<li class="${c.skip ? 'skip' : (c.pass ? 'p' : 'f')}">${c.skip ? '—' : (c.pass ? '✔' : '✖')} ${esc(c.name)} <i>${esc(c.info)}</i></li>`).join('')}</ul>
 <div class="shots">${r.shots.map(s => `<a href="${s.file}"><img src="${s.file}" alt="${esc(s.step)}" loading="lazy"><span>${esc(s.step)}</span></a>`).join('')}</div>
</section>`).join('');
	const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font:14px/1.45 Arial,sans-serif;margin:0;padding:24px;background:#f4f6f8;color:#1d2430}h1{margin:0 0 4px}
.sum{margin:0 0 20px;color:#5d6775}section{background:#fff;border:1px solid #e1e5ea;border-left:5px solid #36a05c;border-radius:8px;padding:12px 16px;margin:0 0 14px}
section.bad{border-left-color:#d64545}h2{font-size:15px;margin:0 0 8px}h2 small{color:#8a929f;font-weight:400;margin-left:6px}
ul{margin:0 0 8px;padding:0;list-style:none;columns:2;column-gap:28px}li{padding:2px 0;break-inside:avoid}li.f{color:#c0392b;font-weight:600}li.skip{color:#8a929f}li i{color:#8a929f;font-style:normal;font-weight:400;margin-left:4px}
.shots{display:flex;gap:8px;flex-wrap:wrap}.shots a{display:block;text-decoration:none;color:#5d6775;font-size:11px;text-align:center}.shots img{width:200px;border:1px solid #e1e5ea;border-radius:4px;display:block}
@media(max-width:700px){ul{columns:1}}</style></head><body>
<h1>${esc(title)}</h1><p class="sum">Passed ${ok} of ${results.length} · ${new Date().toLocaleString('en-GB')}</p>${rows}</body></html>`;
	fs.writeFileSync(path.join(REPORT, 'index.html'), html);
}

/* ---------- run ---------- */
if (!CHROME) { console.error('Chrome or Edge not found. Set its path in CHROME_PATH.'); process.exit(2); }
fs.mkdirSync(REPORT, { recursive: true });
for (const f of fs.readdirSync(REPORT)) { fs.rmSync(path.join(REPORT, f), { recursive: true, force: true }); }

const srv = await startServer();
const base = `http://127.0.0.1:${srv.address().port}`;
console.log(`SdFlip autotest · browser: ${path.basename(CHROME)} · files from docs/samples`);

let items = sampleFiles();
if (ONLY) { items = items.filter(i => i.title.toLowerCase().includes(ONLY)); }

const browser = await chromium.launch({
	executablePath: CHROME,
	headless: !HEADED,
	args: ['--autoplay-policy=no-user-gesture-required']
});

const results = [];
for (let i = 0; i < items.length; i++) {
	const res = await testPdf(browser, base, items[i], i + 1);
	results.push(res);
	const failed = res.checks.filter(c => !c.pass && !c.skip).map(c => c.name + (c.info ? ' (' + c.info + ')' : ''));
	console.log(`${res.ok ? 'OK  ' : 'FAIL'} ${String(i + 1).padStart(2)}. ${res.title} (${res.pages || '?'} pages)${failed.length ? ' — ' + failed.join('; ') : ''}`);
}
function logResult(m) {
	const f = m.checks.filter(c => !c.pass && !c.skip);
	console.log(`${m.ok ? 'OK  ' : 'FAIL'}     ${m.title}${f.length ? ' — ' + f.map(c => c.name + (c.info ? ' (' + c.info + ')' : '')).join('; ') : ''}`);
}
const portrait = items.find(i => i.title === 'field-guide') || items[0];
const wide = items.find(i => i.title === 'landscape-deck');
if (portrait && !args.includes('--no-mobile')) {
	let mi = 1;
	for (const dev of DEVICES) {
		const m = await testDevice(browser, base, portrait, dev, mi++);
		results.push(m);
		logResult(m);
	}
	if (wide) {
		const m = await testDevice(browser, base, wide, DEVICES[0], mi++);
		results.push(m);
		logResult(m);
	}
}
if (portrait) {
	for (const t of [testInline, testLocale]) {
		const m = await t(browser, base, portrait);
		results.push(m);
		logResult(m);
	}
	const f = await testFileProtocol(browser, portrait);
	results.push(f);
	console.log(`${f.ok ? 'OK  ' : 'FAIL'}     ${f.title} — ${f.checks.map(c => c.info).join(' | ')}`);
}

await browser.close();
srv.close();
writeReport(results, 'SdFlip: autotest');
const bad = results.filter(r => !r.ok).length;
console.log(`\nTotal: passed ${results.length - bad} of ${results.length}. Report: ${path.join(REPORT, 'index.html')}`);
process.exit(bad ? 1 : 0);
