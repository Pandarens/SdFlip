/*!
 * SdFlip — a PDF flipbook with a realistic page curl, paper sounds and perfect mobile support.
 * https://github.com/Pandarens/SdFlip · MIT License
 * Depends on pdf.js (loaded automatically). No jQuery, no build step.
 */
(function (window, document) {
	'use strict';
	if (window.SdFlip) { return; }

	var PDFJS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
	var PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

	var DEFAULTS = {
		source: null,            // PDF URL, File, Blob or bytes
		title: '',               // caption in the header
		page: 1,                 // start page
		mode: 'lightbox',        // 'lightbox' | 'inline'
		layout: 'auto',          // 'auto' | 'double' | 'single'
		download: true,          // download button
		downloadUrl: null,       // when the downloadable file differs from the viewed one
		downloadName: null,
		print: true,
		fullscreen: true,
		thumbs: true,
		outline: true,
		search: true,
		sound: true,             // page flip sound
		soundUrl: null,          // your own mp3 instead of the synthesized sound
		volume: 0.6,
		duration: 900,           // flip duration, ms
		bend: 1.45,              // page curl strength: 1 is almost flat, 2.2 is strong
		stripOverlap: 2,         // overlap of the curl strips, px (1px leaves seams on some screens)
		perspective: 5,          // perspective depth in page widths: smaller means stronger 3D
		depth: 0.45,             // how far the page lifts toward the viewer (0..1): smaller means it grows less
		queue: true,             // rapid repeated clicks flip one after another instead of being dropped
		peel: true,              // the page corner lifts on mouse hover
		links: true,             // PDF links (web, phone, email, internal) are clickable
		fitHeight: true,         // inline mode: the container height follows the document proportions
		maxZoom: 4,
		lang: null,             // UI language: 'en', 'ru' or any key of SdFlip.locales; auto-detected by default
		strings: null,           // override individual UI strings: { download: 'Save' }
		pdfjs: PDFJS_SRC,
		pdfjsWorker: PDFJS_WORKER,
		cMapUrl: null,
		onReady: null,
		onFlip: null,
		onClose: null,
		onError: null
	};

	// A site can set options before the library loads: window.SdFlipConfig = { pdfjs: '/path/pdf.min.js' }
	if (window.SdFlipConfig) { extend(DEFAULTS, window.SdFlipConfig); }

	/* ======================= 1. Utilities ======================= */

	function extend(target) {
		for (var i = 1; i < arguments.length; i++) {
			var src = arguments[i];
			if (!src) { continue; }
			for (var key in src) {
				if (Object.prototype.hasOwnProperty.call(src, key)) { target[key] = src[key]; }
			}
		}
		return target;
	}
	function el(tag, cls, html) {
		var node = document.createElement(tag);
		if (cls) { node.className = cls; }
		if (html != null) { node.innerHTML = html; }
		return node;
	}
	function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }
	function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
	function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
	function nowMs() { return window.performance && performance.now ? performance.now() : Date.now(); }
	function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
	function reduceMotion() {
		return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}
	var RAD = Math.PI / 180;

	/* ======================= UI strings ======================= */

	// Add a language with SdFlip.locales.de = { ... }; missing keys fall back to English.
	var LOCALES = {
		en: {
			viewer: 'PDF viewer',
			thumbs: 'Thumbnails (T)',
			outline: 'Contents',
			search: 'Search text',
			close: 'Close (Esc)',
			tabPages: 'Pages',
			tabOutline: 'Contents',
			tabSearch: 'Search',
			first: 'First page (Home)',
			prev: 'Previous (Left arrow)',
			next: 'Next (Right arrow)',
			last: 'Last page (End)',
			pageNumber: 'Page number',
			zoomOut: 'Zoom out (−)',
			zoomIn: 'Zoom in (+)',
			sound: 'Page flip sound (S)',
			download: 'Download PDF',
			print: 'Print',
			fullscreen: 'Fullscreen (F)',
			loading: 'Loading document…',
			preparing: 'Preparing pages…',
			errorTitle: 'Could not open the document',
			fileProtocol: 'This page was opened from disk (file://), and the browser does not let it read PDF files. Serve the folder over HTTP, for example with "npx serve", or open a local file through a file picker.',
			openDirect: 'Open the file directly',
			call: 'Call: ',
			mail: 'Email: ',
			goTo: 'Go to',
			outlineLoading: 'Loading…',
			noOutline: 'This file has no table of contents.',
			outlineError: 'The table of contents is unavailable.',
			searchPlaceholder: 'Search text',
			find: 'Find',
			minChars: 'Type at least two characters.',
			searching: 'Searching… {n} of {total}',
			searchingFound: 'Searching… {n} of {total}, found {found}',
			found: 'Pages found: {found}',
			notFound: 'Nothing found.',
			page: 'Page {n}',
			pageOf: 'Page {page} of {total}'
		},
		ru: {
			viewer: 'Просмотр документа',
			thumbs: 'Миниатюры (T)',
			outline: 'Оглавление',
			search: 'Поиск по тексту',
			close: 'Закрыть (Esc)',
			tabPages: 'Страницы',
			tabOutline: 'Содержание',
			tabSearch: 'Поиск',
			first: 'В начало (Home)',
			prev: 'Назад (стрелка влево)',
			next: 'Вперёд (стрелка вправо)',
			last: 'В конец (End)',
			pageNumber: 'Номер страницы',
			zoomOut: 'Уменьшить (−)',
			zoomIn: 'Увеличить (+)',
			sound: 'Звук перелистывания (S)',
			download: 'Скачать PDF',
			print: 'Печать',
			fullscreen: 'Во весь экран (F)',
			loading: 'Загрузка документа…',
			preparing: 'Подготовка страниц…',
			errorTitle: 'Не удалось открыть документ',
			fileProtocol: 'Страница открыта как файл с диска (file://), а браузер запрещает такой странице читать PDF. Откройте папку через локальный сервер, например «npx serve», или выберите файл через окно выбора файла.',
			openDirect: 'Открыть файл напрямую',
			call: 'Позвонить: ',
			mail: 'Написать: ',
			goTo: 'Перейти',
			outlineLoading: 'Загрузка…',
			noOutline: 'В этом файле нет оглавления.',
			outlineError: 'Оглавление недоступно.',
			searchPlaceholder: 'Поиск по тексту',
			find: 'Найти',
			minChars: 'Введите минимум два символа.',
			searching: 'Поиск… {n} из {total}',
			searchingFound: 'Поиск… {n} из {total}, найдено {found}',
			found: 'Найдено страниц: {found}',
			notFound: 'Ничего не найдено.',
			page: 'Страница {n}',
			pageOf: 'Страница {page} из {total}'
		}
	};

	/** Picks the UI language: the lang option, then <html lang>, then the browser language, then English. */
	function pickLocale(lang) {
		var tries = [lang, document.documentElement.getAttribute('lang'), navigator.language];
		for (var i = 0; i < tries.length; i++) {
			var code = String(tries[i] || '').toLowerCase();
			if (LOCALES[code]) { return code; }
			code = code.split('-')[0];
			if (LOCALES[code]) { return code; }
		}
		return 'en';
	}

	/* ======================= 2. Icons ======================= */

	var ICONS = {
		first: '<path d="M18 6l-6 6 6 6"/><path d="M7 5v14"/>',
		prev: '<path d="M15 6l-6 6 6 6"/>',
		next: '<path d="M9 6l6 6-6 6"/>',
		last: '<path d="M6 6l6 6-6 6"/><path d="M17 5v14"/>',
		zoomIn: '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5L16 16M11 8.5v5M8.5 11h5"/>',
		zoomOut: '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5L16 16M8.5 11h5"/>',
		thumbs: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
		outline: '<path d="M4 6h16M4 12h11M4 18h7"/>',
		search: '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5L16 16"/>',
		sound: '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4z"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/>',
		mute: '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
		download: '<path d="M12 3v12M7.5 11l4.5 4.5L16.5 11M4 20h16"/>',
		print: '<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
		expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
		shrink: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
		close: '<path d="M6 6l12 12M18 6L6 18"/>'
	};
	function icon(name) {
		return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
			'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
	}
	function button(name, title, cls) {
		var b = el('button', 'sdf-btn' + (cls ? ' ' + cls : ''), icon(name));
		b.type = 'button';
		b.title = title;
		b.setAttribute('aria-label', title);
		return b;
	}

	/* ======================= 3. Page flip sound ======================= */
	/*
	 * The sound is synthesized with Web Audio and runs in sync with the animation:
	 *   turn()  — paper rustle and crackle while the page lifts and flies;
	 *   land()  — a soft slap when the page lands on the stack.
	 * If soundUrl is set, that file is played instead of the synthesized sound.
	 */
	function SoundKit(enabled, volume, url) {
		this.enabled = enabled !== false;
		this.volume = volume == null ? 0.6 : volume;
		this.url = url || null;
		this.ctx = null;
		this.noise = null;
		this.master = null;
		this.sample = null;
	}
	/** White noise buffer: the raw material for every paper sound. */
	function makeNoise(rate) {
		var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
		if (!OAC) { return null; }
		var len = Math.floor(rate * 2), buf;
		try { buf = new OAC(1, len, rate).createBuffer(1, len, rate); } catch (e) { return null; }
		var d = buf.getChannelData(0);
		for (var i = 0; i < len; i++) { d[i] = Math.random() * 2 - 1; }
		return buf;
	}
	SoundKit.prototype.ensure = function () {
		if (this.ctx) {
			if (this.ctx.state === 'suspended') { this.ctx.resume(); }
			return this.ctx;
		}
		var AC = window.AudioContext || window.webkitAudioContext;
		if (!AC) { return null; }
		try { this.ctx = new AC(); } catch (e) { return null; }
		if (!this.noise) { this.noise = makeNoise(this.ctx.sampleRate); }
		this.master = this.ctx.createGain();
		this.master.gain.value = this.volume;
		// gentle compression so loud moments do not pop
		var comp = this.ctx.createDynamicsCompressor();
		comp.threshold.value = -18;
		comp.ratio.value = 3;
		this.master.connect(comp);
		comp.connect(this.ctx.destination);
		if (this.url) { this._loadSample(); }
		this.prepare();
		return this.ctx;
	};
	/**
	 * Pre-renders several rustle and slap variants in the background, outside the animation.
	 * A flip then just plays a buffer, which takes a fraction of a millisecond even on a slow phone.
	 */
	SoundKit.prototype.prepare = function () {
		var self = this;
		if (this._prep) { return this._prep; }
		var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
		if (!OAC) { this._prep = Promise.resolve(); return this._prep; }
		var rate = 44100;
		if (!this.noise) { this.noise = makeNoise(rate); }
		if (!this.noise) { this._prep = Promise.resolve(); return this._prep; }
		function render(len, fn) {
			var oc = new OAC(1, Math.ceil(rate * len), rate);
			fn(oc, oc.destination);
			return new Promise(function (res, rej) {
				oc.oncomplete = function (e) { res(e.renderedBuffer); };
				var r = oc.startRendering();
				if (r && r.then) { r.then(res, rej); }
			});
		}
		var jobs = [];
		[0.5, 0.78, 1].forEach(function (s) {
			for (var v = 0; v < 2; v++) { jobs.push(render(1.05, function (oc, d) { self._synthTurn(oc, d, 0.004, 0.9, s); })); }
		});
		[0.55, 0.95].forEach(function (s) {
			for (var v = 0; v < 2; v++) { jobs.push(render(0.3, function (oc, d) { self._synthLand(oc, d, 0.004, s); })); }
		});
		this._prep = Promise.all(jobs).then(function (b) {
			self.turnBufs = [b.slice(0, 2), b.slice(2, 4), b.slice(4, 6)];
			self.landBufs = [b.slice(6, 8), b.slice(8, 10)];
		})['catch'](function () { /* fall back to live synthesis */ });
		return this._prep;
	};
	SoundKit.prototype._play = function (buf, rate) {
		var ctx = this.ensure();
		if (!ctx || !buf) { return; }
		var src = ctx.createBufferSource();
		src.buffer = buf;
		src.playbackRate.value = rate;
		src.connect(this.master);
		src.start(ctx.currentTime + 0.003);
	};
	SoundKit.prototype._loadSample = function () {
		var self = this;
		if (!window.fetch) { return; }
		fetch(this.url).then(function (r) { return r.arrayBuffer(); }).then(function (data) {
			return new Promise(function (res, rej) { self.ctx.decodeAudioData(data, res, rej); });
		}).then(function (buf) { self.sample = buf; })['catch'](function () { self.sample = null; });
	};
	/** Unlocks audio on iPhone/iPad: call from a touch handler. */
	SoundKit.prototype.unlock = function () {
		if (!this.enabled || this._unlocked) { return; }
		var ctx = this.ensure();
		if (!ctx) { return; }
		try {
			var src = ctx.createBufferSource();
			src.buffer = ctx.createBuffer(1, 1, 22050);
			src.connect(ctx.destination);
			src.start(0);
		} catch (e) { /* ignore */ }
		if (ctx.state === 'suspended') { ctx.resume(); }
		this._unlocked = ctx.state === 'running';
	};
	SoundKit.prototype.setEnabled = function (on) {
		this.enabled = !!on;
		if (on) { this.ensure(); }
	};
	SoundKit.prototype.setVolume = function (v) {
		this.volume = clamp(v, 0, 1);
		if (this.master) { this.master.gain.value = this.volume; }
	};
	/** A noise band with an envelope (into any audio context, including offline). */
	SoundKit.prototype._band = function (ctx, dest, at, dur, type, f0, f1, q, peak, attack, offset) {
		var src = ctx.createBufferSource();
		src.buffer = this.noise;
		var f = ctx.createBiquadFilter();
		f.type = type;
		f.Q.value = q;
		f.frequency.setValueAtTime(f0, at);
		f.frequency.exponentialRampToValueAtTime(Math.max(f1, 40), at + dur);
		var g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, at);
		g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + dur * attack);
		g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
		src.connect(f); f.connect(g); g.connect(dest);
		src.start(at, offset || Math.random() * 1.5);
		src.stop(at + dur + 0.05);
	};
	SoundKit.prototype._noiseBand = function (at, dur, type, f0, f1, q, peak, attack, offset) {
		this._band(this.ctx, this.master, at, dur, type, f0, f1, q, peak, attack, offset);
	};
	/** Paper rustle and crackle. */
	SoundKit.prototype._synthTurn = function (ctx, dest, t, dur, s) {
		// 1. whoosh: air under the page
		this._band(ctx, dest, t, dur * 0.85, 'bandpass', 1900 + 900 * s, 520, 0.55, 0.32 * s + 0.06, 0.38);
		// 2. rustle of the paper surface
		this._band(ctx, dest, t + 0.02, dur * 0.7, 'highpass', 3800, 2400, 0.7, 0.07 * s + 0.02, 0.3);
		// 3. crackle: short grains as the page lifts and bends
		var grains = 7 + Math.round(9 * s);
		for (var i = 0; i < grains; i++) {
			var at = t + Math.pow(Math.random(), 1.6) * dur * 0.55;
			var len = 0.006 + Math.random() * 0.02;
			var fq = 2500 + Math.random() * 4200;
			this._band(ctx, dest, at, len, 'bandpass', fq, fq * 0.8, 1.6, (0.06 + Math.random() * 0.16) * s, 0.15);
		}
	};
	/** The page landed on the stack. */
	SoundKit.prototype._synthLand = function (ctx, dest, t, s) {
		this._band(ctx, dest, t, 0.12, 'lowpass', 1400, 380, 0.8, 0.34 * s + 0.08, 0.08);
		this._band(ctx, dest, t, 0.05, 'bandpass', 3200, 2200, 1.2, 0.08 * s, 0.1);
		var osc = ctx.createOscillator();
		osc.type = 'sine';
		osc.frequency.setValueAtTime(115, t);
		osc.frequency.exponentialRampToValueAtTime(58, t + 0.1);
		var g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(0.12 * s + 0.02, t + 0.008);
		g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
		osc.connect(g); g.connect(dest);
		osc.start(t); osc.stop(t + 0.15);
	};
	/** Rustle of a turning page. dur is the flight time in seconds, strength is how sharply it is flipped. */
	SoundKit.prototype.turn = function (dur, strength) {
		if (!this.enabled) { return; }
		var ctx = this.ensure();
		if (!ctx) { return; }
		var s = clamp(strength == null ? 0.7 : strength, 0.2, 1);
		if (this.sample) {
			var src = ctx.createBufferSource();
			src.buffer = this.sample;
			src.playbackRate.value = 0.94 + Math.random() * 0.12;
			src.connect(this.master);
			src.start(ctx.currentTime + 0.003);
			return;
		}
		dur = clamp(dur || 0.9, 0.25, 1.6);
		if (this.turnBufs) {
			var set = this.turnBufs[s < 0.64 ? 0 : (s < 0.9 ? 1 : 2)];
			// a faster page gives a shorter, higher rustle; a little jitter keeps it from repeating
			this._play(set[Math.floor(Math.random() * set.length)], clamp(0.9 / dur, 0.8, 1.35) * (0.96 + Math.random() * 0.08));
			return;
		}
		this._synthTurn(ctx, this.master, ctx.currentTime + 0.005, dur, s);
	};
	/** The page landed on the stack. */
	SoundKit.prototype.land = function (strength) {
		if (!this.enabled || this.sample) { return; }
		var ctx = this.ensure();
		if (!ctx) { return; }
		var s = clamp(strength == null ? 0.7 : strength, 0.2, 1);
		if (this.landBufs) {
			var set = this.landBufs[s < 0.75 ? 0 : 1];
			this._play(set[Math.floor(Math.random() * set.length)], 0.95 + Math.random() * 0.1);
			return;
		}
		this._synthLand(ctx, this.master, ctx.currentTime + 0.005, s);
	};
	/** Dull sound of a closing cover. */
	SoundKit.prototype.thud = function () {
		if (!this.enabled || this.sample) { return; }
		var ctx = this.ensure();
		if (!ctx) { return; }
		var t = ctx.currentTime + 0.005;
		var osc = ctx.createOscillator();
		osc.type = 'sine';
		osc.frequency.setValueAtTime(140, t);
		osc.frequency.exponentialRampToValueAtTime(50, t + 0.2);
		var g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(0.4, t + 0.015);
		g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
		osc.connect(g); g.connect(this.master);
		osc.start(t); osc.stop(t + 0.3);
		this._noiseBand(t, 0.2, 'lowpass', 900, 200, 0.7, 0.3, 0.06);
	};
	/** Short UI click. */
	SoundKit.prototype.click = function () {
		if (!this.enabled) { return; }
		var ctx = this.ensure();
		if (!ctx) { return; }
		var t = ctx.currentTime + 0.005;
		var osc = ctx.createOscillator();
		osc.type = 'triangle';
		osc.frequency.setValueAtTime(1500, t);
		var g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(0.1, t + 0.004);
		g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
		osc.connect(g); g.connect(this.master);
		osc.start(t); osc.stop(t + 0.06);
	};

	/* ======================= 4. Loading pdf.js ======================= */

	var pdfjsPromise = null;
	function loadPdfJs(opts) {
		if (window.pdfjsLib) {
			if (opts.pdfjsWorker && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
				window.pdfjsLib.GlobalWorkerOptions.workerSrc = opts.pdfjsWorker;
			}
			return Promise.resolve(window.pdfjsLib);
		}
		if (pdfjsPromise) { return pdfjsPromise; }
		pdfjsPromise = new Promise(function (resolve, reject) {
			var s = document.createElement('script');
			s.src = opts.pdfjs;
			s.async = true;
			s.onload = function () {
				if (!window.pdfjsLib) { reject(new Error('pdf.js loaded but did not define pdfjsLib')); return; }
				try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = opts.pdfjsWorker; } catch (e) { /* ignore */ }
				resolve(window.pdfjsLib);
			};
			s.onerror = function () { pdfjsPromise = null; reject(new Error('Failed to load pdf.js: ' + opts.pdfjs)); };
			document.head.appendChild(s);
		});
		return pdfjsPromise;
	}

	/** pdf.js parameters: a URL, a File/Blob from disk, or bytes already read. */
	function sourceParams(src) {
		if (window.Blob && src instanceof window.Blob) {
			return src.arrayBuffer().then(function (buf) { return { data: new Uint8Array(buf) }; });
		}
		if (src instanceof ArrayBuffer) { return Promise.resolve({ data: new Uint8Array(src) }); }
		if (src && ArrayBuffer.isView && ArrayBuffer.isView(src)) { return Promise.resolve({ data: src }); }
		if (typeof src !== 'string' || !src) { return Promise.reject(new Error('No PDF source given')); }
		return Promise.resolve({ url: src });
	}
	function isFileProtocol() { return window.location && window.location.protocol === 'file:'; }

	/* ======================= 5. Document: pages, rendering and cache ======================= */
	/*
	 * The book is made of "virtual" pages. Usually they are just PDF pages, but:
	 *  - double-width spreads (InDesign often exports catalogs this way) are split into left and right halves,
	 *    and the book puts the spread back together exactly as the designer intended;
	 *  - a page of a different size is fitted into the book format whole, with margins, never stretched;
	 *  - if a spread would start on an odd page, a blank page is inserted before it so spreads stay aligned.
	 */
	function makeCanvas(w, h) {
		var c = document.createElement('canvas');
		c.width = Math.max(1, Math.round(w));
		c.height = Math.max(1, Math.round(h));
		return c;
	}
	function paperCanvas(w, h, color) {
		var c = makeCanvas(w, h);
		var x = c.getContext('2d', { alpha: false });
		x.fillStyle = color || '#ffffff';
		x.fillRect(0, 0, c.width, c.height);
		return c;
	}

	function PdfDoc(pdf) {
		this.pdf = pdf;
		this.cache = {};        // virtual page -> {canvas, width}
		this.pending = {};
		this.rawPending = {};   // whole PDF page render (shared by both halves of a spread)
		this.text = {};
		this.pages = null;
		this.sizes = null;
		this._aspect = null;
		this.hasSpreads = false;
	}
	PdfDoc.prototype.count = function () { return this.pages ? this.pages.length : this.pdf.numPages; };
	/** Reads page sizes and builds the list of book pages. Resolves to the book page aspect ratio. */
	PdfDoc.prototype.aspect = function () {
		var self = this;
		if (this._ready) { return this._ready; }
		var n = this.pdf.numPages;
		var jobs = [];
		// for very large files we do not read every page size and assume they are equal
		var limit = n > 400 ? 1 : n;
		for (var i = 1; i <= limit; i++) {
			jobs.push(this.pdf.getPage(i).then(function (p) {
				var vp = p.getViewport({ scale: 1 });
				return { w: vp.width, h: vp.height };
			}));
		}
		this._ready = Promise.all(jobs).then(function (sizes) {
			if (sizes.length === n) { self.sizes = sizes; }
			self._layout(sizes);
			return self._aspect;
		});
		return this._ready;
	};
	PdfDoc.prototype._layout = function (sizes) {
		var n = this.pdf.numPages;
		if (!this.sizes) {
			this._aspect = sizes[0].w / sizes[0].h;
			this.pages = [];
			for (var i = 1; i <= n; i++) { this.pages.push({ p: i, part: 'full' }); }
			return;
		}
		var same = function (a, b) { return Math.abs(a / b - 1) < 0.03; };
		var aspects = sizes.map(function (s) { return s.w / s.h; });
		// book format: the aspect s that the most pages match, either as s or as a 2s spread;
		// on a tie, the one with more real single pages wins
		var best = null, bestScore = -1, bestFull = -1;
		aspects.forEach(function (s) {
			var full = 0, spread = 0;
			aspects.forEach(function (a) { if (same(a, s)) { full++; } else if (same(a, 2 * s)) { spread++; } });
			var score = full + spread;
			if (score > bestScore || (score === bestScore && full > bestFull)) { best = s; bestScore = score; bestFull = full; }
		});
		this._aspect = best;
		var pages = [];
		// height of a regular page: a spread has the same height, while e.g. landscape A4 in a portrait catalog is shorter
		var baseH = 0;
		for (var j = 0; j < n; j++) { if (same(aspects[j], best)) { baseH = sizes[j].h; break; } }
		for (var p = 1; p <= n; p++) {
			var a = aspects[p - 1];
			if (baseH && same(a, 2 * best) && Math.abs(sizes[p - 1].h / baseH - 1) < 0.04) {
				// the left half of a spread must land on an even book page
				if ((pages.length + 1) % 2 === 1) { pages.push({ p: 0, part: 'blank' }); }
				pages.push({ p: p, part: 'left' });
				pages.push({ p: p, part: 'right' });
				this.hasSpreads = true;
			} else {
				pages.push({ p: p, part: 'full', fit: !same(a, best) });
			}
		}
		this.pages = pages;
	};
	/** Book page where a PDF page starts (for the outline). */
	PdfDoc.prototype.virtualOf = function (pdfIndex0) {
		for (var i = 0; i < this.pages.length; i++) { if (this.pages[i].p === pdfIndex0 + 1) { return i + 1; } }
		return 1;
	};
	/** Renders a whole PDF page at the given width in pixels. */
	PdfDoc.prototype._raw = function (p, widthPx) {
		var self = this;
		var key = p + ':' + widthPx;
		if (this.rawPending[key]) { return this.rawPending[key]; }
		var task = this.pdf.getPage(p).then(function (page) {
			var base = page.getViewport({ scale: 1 });
			var vp = page.getViewport({ scale: widthPx / base.width });
			var canvas = paperCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
			var rt = page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport: vp });
			// pdf.js renders in chunks; the viewer pauses rendering while a page flips
			// so the animation stays smooth even on heavy photo pages
			if (self.gate) { rt.onContinue = function (cont) { self.gate(cont); }; }
			return rt.promise.then(function () { return canvas; });
		});
		this.rawPending[key] = task;
		// keep the finished render for a couple of seconds so the other half of the spread can reuse it
		task.then(function () { setTimeout(function () { delete self.rawPending[key]; }, 2500); },
			function () { delete self.rawPending[key]; });
		return task;
	};
	/** Book page num at cssWidth CSS pixels. Always in the book format, never distorted. */
	PdfDoc.prototype.render = function (num, cssWidth) {
		var self = this;
		var v = this.pages && this.pages[num - 1];
		if (!v) { return Promise.resolve(null); }
		var dpr = Math.min(window.devicePixelRatio || 1, 2);
		var want = Math.min(Math.round(cssWidth * dpr), 2400);
		var hit = this.cache[num];
		if (hit && hit.width >= want * 0.92) { return Promise.resolve(hit.canvas); }
		var key = num + ':' + want;
		if (this.pending[key]) { return this.pending[key]; }
		var outH = want / this._aspect;
		var task;
		if (v.part === 'blank') {
			task = Promise.resolve(paperCanvas(want, outH, '#f4f1ea'));
		} else if (v.part === 'left' || v.part === 'right') {
			task = this._raw(v.p, want * 2).then(function (full) {
				var c = makeCanvas(want, outH);
				var half = full.width / 2;
				c.getContext('2d', { alpha: false }).drawImage(full, v.part === 'left' ? 0 : half, 0, half, full.height, 0, 0, c.width, c.height);
				return c;
			});
		} else if (v.fit) {
			// non-standard page: whole, centered, with margins
			var s = this.sizes[v.p - 1], pa = s.w / s.h;
			var dw = pa > this._aspect ? want : outH * pa;
			task = this._raw(v.p, Math.max(1, Math.round(dw))).then(function (img) {
				var c = paperCanvas(want, outH);
				var x = c.getContext('2d', { alpha: false });
				var dh = img.height * (dw / img.width);
				x.drawImage(img, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
				return c;
			});
		} else {
			// a regular page is shown with the same canvas, so it is not kept in the shared store:
			// otherwise a request after it was released would get an empty canvas
			task = this._raw(v.p, want).then(function (c) { delete self.rawPending[v.p + ':' + want]; return c; });
		}
		task = task.then(function (canvas) {
			var prev = self.cache[num];
			if (!prev || prev.width < want) { self.cache[num] = { canvas: canvas, width: want }; }
			delete self.pending[key];
			return canvas;
		}, function (e) {
			delete self.pending[key];
			throw e;
		});
		this.pending[key] = task;
		return task;
	};
	/** Links of a book page as fractions of its size: { left, top, width, height, url | dest }. */
	PdfDoc.prototype.links = function (num) {
		var self = this;
		var v = this.pages && this.pages[num - 1];
		if (!v || v.part === 'blank') { return Promise.resolve([]); }
		if (!this._links) { this._links = {}; }
		if (!this._links[v.p]) {
			this._links[v.p] = this.pdf.getPage(v.p).then(function (page) {
				var vp = page.getViewport({ scale: 1 });
				return page.getAnnotations({ intent: 'display' }).then(function (anns) {
					var out = [];
					anns.forEach(function (a) {
						if (a.subtype !== 'Link') { return; }
						var url = a.url || (a.unsafeUrl && /^(https?:|mailto:|tel:)/i.test(a.unsafeUrl) ? a.unsafeUrl : null);
						if (!url && !a.dest) { return; }
						var r = vp.convertToViewportRectangle(a.rect);
						var x1 = Math.min(r[0], r[2]), x2 = Math.max(r[0], r[2]);
						var y1 = Math.min(r[1], r[3]), y2 = Math.max(r[1], r[3]);
						out.push({ left: x1 / vp.width, top: y1 / vp.height, width: (x2 - x1) / vp.width, height: (y2 - y1) / vp.height, url: url, dest: url ? null : a.dest });
					});
					return out;
				});
			})['catch'](function () { return []; });
		}
		return this._links[v.p].then(function (list) {
			if (v.part === 'left' || v.part === 'right') {
				var off = v.part === 'left' ? 0 : 0.5;
				return list.filter(function (l) { var c = l.left + l.width / 2; return v.part === 'left' ? c < 0.5 : c >= 0.5; })
					.map(function (l) { return extend({}, l, { left: (l.left - off) * 2, width: l.width * 2 }); });
			}
			if (v.fit) {
				var s = self.sizes[v.p - 1], pa = s.w / s.h, base = self._aspect;
				var wf = pa > base ? 1 : pa / base, hf = pa > base ? base / pa : 1;
				var ox = (1 - wf) / 2, oy = (1 - hf) / 2;
				return list.map(function (l) { return extend({}, l, { left: ox + l.left * wf, top: oy + l.top * hf, width: l.width * wf, height: l.height * hf }); });
			}
			return list;
		});
	};
	/** Page text for search (a spread reports it once, on its left half). */
	PdfDoc.prototype.pageText = function (num) {
		var self = this;
		var v = this.pages && this.pages[num - 1];
		if (!v || v.part === 'blank' || v.part === 'right') { return Promise.resolve(''); }
		if (this.text[v.p] != null) { return Promise.resolve(this.text[v.p]); }
		return this.pdf.getPage(v.p).then(function (p) { return p.getTextContent(); }).then(function (tc) {
			var s = tc.items.map(function (it) { return it.str; }).join(' ').replace(/\s+/g, ' ');
			self.text[v.p] = s;
			return s;
		})['catch'](function () { self.text[v.p] = ''; return ''; });
	};

	/* ======================= 6. Viewer ======================= */

	function Viewer(options) {
		// site options (window.SdFlipConfig) are read on every open, so script order does not matter
		this.o = extend({}, DEFAULTS, window.SdFlipConfig || {}, options || {});
		this.lang = pickLocale(this.o.lang);
		this.strings = extend({}, LOCALES.en, LOCALES[this.lang], this.o.strings || {});
		this.doc = null;
		this.sheets = [];
		this.state = 0;          // how many sheets are turned to the left
		this.single = false;
		this.pw = 0; this.ph = 0;
		this.zoom = 1; this.pan = { x: 0, y: 0 };
		this.busy = false;
		this.destroyed = false;
		this.curl = null;
		this._ptrs = {};
		this._pre = {};          // sheets prebuilt for the next flips
		this._queue = [];        // queue of rapid next/prev presses
		this._opener = document.activeElement;   // focus returns to the opening button on close
		this.sound = new SoundKit(this.o.sound, this.o.volume, this.o.soundUrl);
		// the viewer is usually opened by a tap, the moment browsers (Safari on iPhone above all) allow audio
		this.sound.unlock();
		this._searchToken = 0;
		this._build();
		this._load();
	}

	/** UI string by key with {placeholders} filled from vars. */
	Viewer.prototype.t = function (key, vars) {
		var s = this.strings[key] != null ? String(this.strings[key]) : key;
		return vars ? s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; }) : s;
	};

	/* ---------- markup ---------- */
	Viewer.prototype._build = function () {
		var self = this;
		var lightbox = this.o.mode !== 'inline';
		var root = el('div', 'sdf-root ' + (lightbox ? 'sdf-lightbox' : 'sdf-inline'));
		this.root = root;
		root.setAttribute('role', 'dialog');
		root.setAttribute('aria-modal', lightbox ? 'true' : 'false');
		root.setAttribute('aria-label', this.o.title || this.t('viewer'));
		root.tabIndex = -1;
		// invisible line for screen readers: "Page 2–3 of 16"
		this.live = el('div', 'sdf-sr');
		this.live.setAttribute('aria-live', 'polite');
		root.appendChild(this.live);

		var head = el('div', 'sdf-head');
		this.titleEl = el('div', 'sdf-title', esc(this.o.title || ''));
		head.appendChild(this.titleEl);
		if (this.o.thumbs) {
			this.bThumbs = button('thumbs', this.t('thumbs'));
			this.bThumbs.onclick = function () { self._togglePanel('thumbs'); };
			head.appendChild(this.bThumbs);
		}
		if (this.o.outline) {
			this.bOutline = button('outline', this.t('outline'), 'sdf-hide-sm');
			this.bOutline.onclick = function () { self._togglePanel('outline'); };
			head.appendChild(this.bOutline);
		}
		if (this.o.search) {
			this.bSearch = button('search', this.t('search'));
			this.bSearch.onclick = function () { self._togglePanel('search'); };
			head.appendChild(this.bSearch);
		}
		if (lightbox) {
			var bClose = button('close', this.t('close'));
			bClose.onclick = function () { self.close(); };
			head.appendChild(bClose);
		}
		root.appendChild(head);

		var body = el('div', 'sdf-body');
		this.side = el('aside', 'sdf-side');
		var sideIn = el('div', 'sdf-side-in');
		this.tabs = el('div', 'sdf-tabs');
		this.panes = {};
		var tabDefs = [];
		if (this.o.thumbs) { tabDefs.push(['thumbs', this.t('tabPages')]); }
		if (this.o.outline) { tabDefs.push(['outline', this.t('tabOutline')]); }
		if (this.o.search) { tabDefs.push(['search', this.t('tabSearch')]); }
		tabDefs.forEach(function (d) {
			var t = el('button', 'sdf-tab', d[1]);
			t.type = 'button';
			t.dataset.pane = d[0];
			t.onclick = function () { self._showPane(d[0]); };
			self.tabs.appendChild(t);
			var pane = el('div', 'sdf-pane');
			pane.dataset.pane = d[0];
			self.panes[d[0]] = pane;
			sideIn.appendChild(pane);
		});
		sideIn.insertBefore(this.tabs, sideIn.firstChild);
		this.side.appendChild(sideIn);
		body.appendChild(this.side);

		this.viewport = el('div', 'sdf-viewport');
		this.stage = el('div', 'sdf-stage');
		this.zoomer = el('div', 'sdf-zoom');
		this.book = el('div', 'sdf-book');
		this.ground = el('div', 'sdf-ground');
		this.book.appendChild(this.ground);
		this.cast = el('div', 'sdf-cast');
		this.book.appendChild(this.cast);
		this.zoomer.appendChild(this.book);
		// a separate wrapper for the entrance animation so it does not fight zoom and pan
		this.enter = el('div', 'sdf-enter');
		this.enter.appendChild(this.zoomer);
		this.stage.appendChild(this.enter);
		this.viewport.appendChild(this.stage);
		body.appendChild(this.viewport);
		root.appendChild(body);

		var bar = el('div', 'sdf-toolbar');
		// phones hide first/last and zoom buttons: swipe, pinch and double tap cover them
		this.bFirst = button('first', this.t('first'), 'sdf-hide-xs');
		this.bPrev = button('prev', this.t('prev'));
		this.bNext = button('next', this.t('next'));
		this.bLast = button('last', this.t('last'), 'sdf-hide-xs');
		this.bFirst.onclick = function () { self.goTo(1); };
		this.bPrev.onclick = function () { self.prev(); };
		this.bNext.onclick = function () { self.next(); };
		this.bLast.onclick = function () { self.goTo(self.doc ? self.doc.count() : 1); };

		this.pager = el('div', 'sdf-pager');
		this.pageInput = el('input');
		this.pageInput.type = 'text';
		this.pageInput.inputMode = 'numeric';
		this.pageInput.setAttribute('aria-label', this.t('pageNumber'));
		this.pageInput.onkeydown = function (e) {
			if (e.key === 'Enter') { self.goTo(parseInt(self.pageInput.value, 10) || 1); self.pageInput.blur(); }
			e.stopPropagation();
		};
		this.totalEl = el('span', null, '/ 0');
		this.pager.appendChild(this.pageInput);
		this.pager.appendChild(this.totalEl);

		bar.appendChild(this.bFirst);
		bar.appendChild(this.bPrev);
		bar.appendChild(this.pager);
		bar.appendChild(this.bNext);
		bar.appendChild(this.bLast);
		bar.appendChild(el('div', 'sdf-sep'));

		this.bZoomOut = button('zoomOut', this.t('zoomOut'), 'sdf-hide-xs');
		this.bZoomIn = button('zoomIn', this.t('zoomIn'), 'sdf-hide-xs');
		this.bZoomOut.onclick = function () { self.setZoom(self.zoom / 1.4); };
		this.bZoomIn.onclick = function () { self.setZoom(self.zoom * 1.4); };
		bar.appendChild(this.bZoomOut);
		bar.appendChild(this.bZoomIn);

		this.bSound = button(this.o.sound ? 'sound' : 'mute', this.t('sound'));
		if (this.o.sound) { this.bSound.classList.add('sdf-on'); }
		this.bSound.onclick = function () { self.toggleSound(); };
		bar.appendChild(this.bSound);

		if (this.o.download) {
			this.bDown = button('download', this.t('download'));
			this.bDown.onclick = function () { self.download(); };
			bar.appendChild(this.bDown);
		}
		if (this.o.print) {
			this.bPrint = button('print', this.t('print'), 'sdf-hide-sm');
			this.bPrint.onclick = function () { self.print(); };
			bar.appendChild(this.bPrint);
		}
		if (this.o.fullscreen) {
			this.bFull = button('expand', this.t('fullscreen'), 'sdf-hide-sm');
			this.bFull.onclick = function () { self.toggleFullscreen(); };
			bar.appendChild(this.bFull);
		}
		this.toolbar = bar;
		this.viewport.appendChild(bar);

		this.loader = el('div', 'sdf-loader',
			'<div class="sdf-loader-bar"><i></i></div><span>' + esc(this.t('loading')) + '</span>');
		this.viewport.appendChild(this.loader);

		if (lightbox) {
			document.body.appendChild(root);
			this._prevOverflow = document.body.style.overflow;
			this._prevPadding = document.body.style.paddingRight;
			// the scrollbar disappears: pad by its width so the page underneath does not jump sideways
			var sbw = window.innerWidth - document.documentElement.clientWidth;
			if (sbw > 0) {
				var pr = parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
				document.body.style.paddingRight = (pr + sbw) + 'px';
			}
			document.body.style.overflow = 'hidden';
			requestAnimationFrame(function () { root.classList.add('sdf-in'); });
			try { root.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
		} else {
			var host = typeof this.o.container === 'string' ? document.querySelector(this.o.container) : this.o.container;
			host.appendChild(root);
		}
		this._bindEvents();
	};

	/* ---------- events ---------- */
	Viewer.prototype._bindEvents = function () {
		var self = this;

		this._onKey = function (e) {
			if (self.destroyed) { return; }
			// an inline viewer does not capture arrow keys unless the user is working with it
			if (self.o.mode === 'inline' && !self._hovered && !self.root.contains(document.activeElement)) { return; }
			// Esc always closes the viewer, even from the search field
			if (e.key === 'Escape' && self.o.mode !== 'inline') { e.preventDefault(); self.close(); return; }
			if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) { return; }
			// letter shortcuts follow the physical key, so they work in any keyboard layout
			var key = /^Key[FST]$/.test(e.code || '') ? e.code.charAt(3).toLowerCase() : e.key;
			switch (key) {
				case 'ArrowRight': case 'PageDown': self.next(); break;
				case 'ArrowLeft': case 'PageUp': self.prev(); break;
				case 'Home': self.goTo(1); break;
				case 'End': self.goTo(self.doc ? self.doc.count() : 1); break;
				case 'Escape': if (self.o.mode !== 'inline') { self.close(); } break;
				case '+': case '=': self.setZoom(self.zoom * 1.4); break;
				case '-': self.setZoom(self.zoom / 1.4); break;
				case '0': self.setZoom(1); break;
				case 'f': case 'F': self.toggleFullscreen(); break;
				case 's': case 'S': self.toggleSound(); break;
				case 't': case 'T': self._togglePanel('thumbs'); break;
				default: return;
			}
			e.preventDefault();
		};
		document.addEventListener('keydown', this._onKey);

		this._onResize = function () {
			clearTimeout(self._rt);
			self._rt = setTimeout(function () { self._relayout(true); }, 160);
		};
		window.addEventListener('resize', this._onResize);
		window.addEventListener('orientationchange', this._onResize);

		this.stage.addEventListener('wheel', function (e) {
			// an inline viewer never blocks page scrolling: the wheel flips pages only in the lightbox
			if (self.o.mode === 'inline' && !(e.ctrlKey || e.metaKey)) { return; }
			if (e.ctrlKey || e.metaKey) {
				e.preventDefault();
				self.setZoom(self.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e);
				return;
			}
			if (self.zoom > 1.02) { return; }
			var t = nowMs();
			if (self._lastWheel && t - self._lastWheel < 450) { e.preventDefault(); return; }
			self._lastWheel = t;
			if (e.deltaY > 0 || e.deltaX > 0) { self.next(); } else { self.prev(); }
			e.preventDefault();
		}, { passive: false });

		this.root.addEventListener('pointerenter', function () { self._hovered = true; });
		this.root.addEventListener('pointerleave', function () { self._hovered = false; });
		var unlock = function () { self.sound.unlock(); };
		this.root.addEventListener('touchend', unlock, { passive: true });
		this.root.addEventListener('click', unlock);

		this.stage.addEventListener('pointerdown', function (e) { self._down(e); });
		this.stage.addEventListener('pointermove', function (e) { self._move(e); });
		this.stage.addEventListener('pointerup', function (e) { self._up(e); });
		this.stage.addEventListener('pointercancel', function (e) { self._up(e); });
		this.stage.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { self._peekEnd(); } });

		this._onFsChange = function () {
			if (!self.bFull) { return; }
			var on = !!document.fullscreenElement;
			self.bFull.innerHTML = icon(on ? 'shrink' : 'expand');
			self.bFull.classList.toggle('sdf-on', on);
			self._onResize();
		};
		document.addEventListener('fullscreenchange', this._onFsChange);
	};

	/* ---------- loading the document ---------- */
	Viewer.prototype._load = function () {
		var self = this;
		var bar = this.loader.querySelector('.sdf-loader-bar i');
		Promise.all([loadPdfJs(this.o), sourceParams(this.o.source)]).then(function (res) {
			var pdfjsLib = res[0], params = res[1];
			if (self.o.cMapUrl) { params.cMapUrl = self.o.cMapUrl; params.cMapPacked = true; }
			var task = pdfjsLib.getDocument(params);
			task.onProgress = function (p) {
				if (p.total) { bar.style.width = Math.round(p.loaded / p.total * 100) + '%'; }
			};
			return task.promise;
		}).then(function (pdf) {
			if (self.destroyed) { pdf.destroy(); return; }
			self.doc = new PdfDoc(pdf);
			self._gateQ = [];
			self.doc.gate = function (cont) {
				// pause while a page flies or is dragged, and a little longer in case flips follow
				var animating = !!self.curl && (self.busy || (self._drag && self._drag.started));
				if (animating) { self._gateQ.push(cont); self._armGate(); } else { cont(); }
			};
			bar.style.width = '100%';
			var label = self.loader.querySelector('span');
			if (label) { label.textContent = self.t('preparing'); }
			return self.doc.aspect().then(function () { self._setup(); });
		})['catch'](function (err) { self._fail(err); });
	};

	Viewer.prototype._fail = function (err) {
		if (this.loader.parentNode) { this.loader.parentNode.removeChild(this.loader); }
		var text = esc(err && err.message ? err.message : err);
		if (isFileProtocol() && typeof this.o.source === 'string') {
			text = esc(this.t('fileProtocol'));
		}
		var box = el('div', 'sdf-error', '<b>' + esc(this.t('errorTitle')) + '</b><span>' + text + '</span>');
		if (typeof this.o.source === 'string') {
			var a = el('a', null, esc(this.t('openDirect')));
			a.href = this.o.source;
			a.target = '_blank';
			a.rel = 'noopener';
			a.style.color = 'var(--sdf-accent)';
			box.appendChild(a);
		}
		this.viewport.appendChild(box);
		this.failed = true;
		if (typeof this.o.onError === 'function') { this.o.onError(err, this); }
	};
	/** URL for download and print: a local file gets a temporary blob URL. */
	Viewer.prototype._fileUrl = function () {
		var src = this.o.downloadUrl || this.o.source;
		if (typeof src === 'string') { return src; }
		if (!this._blobUrl) {
			var blob = (window.Blob && src instanceof window.Blob) ? src : new Blob([src], { type: 'application/pdf' });
			this._blobUrl = URL.createObjectURL(blob);
		}
		return this._blobUrl;
	};

	/* ---------- building the book ---------- */
	Viewer.prototype._setup = function () {
		var n = this.doc.count();
		this.totalEl.textContent = '/ ' + n;
		this._decideLayout();
		this._buildSheets();
		var start = clamp(this.o.page || 1, 1, n);
		this.state = this._stateFor(start);
		this.busy = true;               // no flipping while the book makes its entrance
		this._relayout(false);
		var self = this;
		// show the book only once the visible pages are rendered: no blank sheets, no jumps
		var first = this._visibleFaces().map(function (f) { return self._renderFace(f, true); });
		var timeout = new Promise(function (res) { setTimeout(res, 3500); });
		Promise.race([Promise.all(first), timeout]).then(function () { self._reveal(); }, function () { self._reveal(); });
		this._renderWindow();
		if (this.o.thumbs) { this._buildThumbs(); }
		if (this.o.outline) { this._buildOutline(); }
		if (this.o.search) { this._buildSearch(); }
	};

	Viewer.prototype._visibleFaces = function () {
		var out = [];
		var right = this.sheets[this.state], left = this.sheets[this.state - 1];
		if (right && right.front.page) { out.push(right.front); }
		if (!this.single && left && left.back.page) { out.push(left.back); }
		return out;
	};

	/** Smooth entrance: the loader fades, the book rises, the toolbar slides in. */
	Viewer.prototype._reveal = function () {
		var self = this;
		if (this.destroyed || this.revealed) { return; }
		this.revealed = true;
		this.revealedWithPages = this._visibleFaces().every(function (f) { return !!f.canvas; });
		requestAnimationFrame(function () {
			self.root.classList.add('sdf-ready');
			self.loader.classList.add('sdf-gone');
			setTimeout(function () {
				if (self.loader.parentNode) { self.loader.parentNode.removeChild(self.loader); }
				self.busy = false;
				self._live = true;
				self.sound.prepare();
				self._syncUI();
				self._schedulePrebuild();
				if (typeof self.o.onReady === 'function') { self.o.onReady(self); }
			}, reduceMotion() ? 0 : 520);
		});
	};

	Viewer.prototype._stateFor = function (pageNum) {
		return this.single ? pageNum - 1 : Math.floor(pageNum / 2);
	};

	Viewer.prototype._decideLayout = function () {
		var prev = this.single;
		if (this.o.layout === 'single') { this.single = true; }
		else if (this.o.layout === 'double') { this.single = false; }
		else {
			var box = this.viewport.getBoundingClientRect();
			var aspect = this.doc._aspect || 0.75;
			if (this.doc.hasSpreads) {
				// the file has spreads: show them as a double page if it is at least 60% the size of a single page
				var aw = box.width - 88, ah = box.height - 120;
				// an inline viewer that fits its height has none yet: it may grow up to 85% of the window
				if (this.o.mode === 'inline' && this.o.fitHeight !== false) { ah = Math.max(ah, window.innerHeight * 0.85 - 120); }
				var singleW = Math.min(aw, ah * aspect), doubleW = Math.min(aw / 2, ah * aspect);
				this.single = box.width < 720 || doubleW < singleW * 0.6;
			} else {
				this.single = box.width < 720 || box.width / box.height < 1.05 || aspect > 1.1;
			}
		}
		this.root.classList.toggle('sdf-single', this.single);
		return prev !== this.single;
	};

	Viewer.prototype._facePages = function (k) {
		if (this.single) { return { front: k + 1, back: null }; }
		var f = 2 * k + 1, b = 2 * k + 2, n = this.doc.count();
		return { front: f <= n ? f : null, back: b <= n ? b : null };
	};

	Viewer.prototype._buildSheets = function () {
		this._peekEnd(true);
		this._curlEnd();
		this._pre = {};
		// faces of the old layout may still have renders in flight: mark them so they do not touch shared canvases
		this.sheets.forEach(function (s) {
			s.front.dead = s.back.dead = true;
			if (s.el.parentNode) { s.el.parentNode.removeChild(s.el); }
		});
		this.sheets = [];
		var n = this.doc.count();
		var total = this.single ? n : Math.ceil(n / 2);
		for (var k = 0; k < total; k++) {
			var node = el('div', 'sdf-sheet');
			var pages = this._facePages(k);
			var front = this._makeFace('sdf-front', pages.front, k);
			var back = this._makeFace('sdf-back', pages.back, k);
			node.appendChild(front.el);
			node.appendChild(back.el);
			this.sheets.push({ el: node, front: front, back: back, pages: pages });
			this.book.appendChild(node);
		}
	};

	Viewer.prototype._makeFace = function (cls, pageNum, k) {
		var node = el('div', 'sdf-face ' + cls + (pageNum ? '' : ' sdf-blank'));
		var holder = el('div', 'sdf-holder');
		node.appendChild(holder);
		node.appendChild(el('div', 'sdf-gutter'));
		return { el: node, holder: holder, page: pageNum, k: k, drawnWidth: 0, canvas: null };
	};

	/* ---------- sizing and layout ---------- */
	Viewer.prototype._relayout = function (rerender) {
		if (!this.doc) { return; }
		// remember the page BEFORE changing the layout so rotating the screen keeps it open
		var page = this.page();
		if (this.o.layout === 'auto' && this._decideLayout()) {
			this._buildSheets();
			this.state = this._stateFor(page);
		}
		this._fitHeight();
		var box = this.viewport.getBoundingClientRect();
		var aspect = this.doc._aspect || 0.75;
		var cols = this.single ? 1 : 2;
		// leave room for the toolbar at the bottom (padding is set in .sdf-stage and is smaller on phones)
		var padB = parseFloat(window.getComputedStyle(this.stage).paddingBottom) || 0;
		var narrow = box.width < 600;
		var availW = Math.max(120, box.width - (narrow ? 20 : 88));
		// A lifted page is closer to the viewer and looks taller in perspective. Reserve exactly as
		// much room as it grows so its edges never slide under the header or the toolbar.
		var availH = Math.max(120, (box.height - padB - (narrow ? 12 : 24)) / (1 + this._growth()));
		var ph = availH, pw = ph * aspect;
		if (pw * cols > availW) { pw = availW / cols; ph = pw / aspect; }
		this.pw = Math.floor(pw); this.ph = Math.floor(ph);
		// perspective scales with the page, so the 3D looks the same on a phone and on a big monitor
		this.stage.style.perspective = Math.round(this.pw * this.o.perspective) + 'px';
		this.stage.style.perspectiveOrigin = '50% ' + Math.round((box.height - padB) / 2) + 'px';
		this._pre = {};

		this.book.style.width = (this.pw * cols) + 'px';
		this.book.style.height = this.ph + 'px';
		for (var i = 0; i < this.sheets.length; i++) {
			this.sheets[i].el.style.width = this.pw + 'px';
			this.sheets[i].el.style.height = this.ph + 'px';
		}
		this._applySheets();
		this._syncUI();
		if (rerender !== false) { this._renderWindow(); }
	};

	/**
	 * An inline viewer fits its height to the document proportions:
	 * a landscape document on a phone leaves no empty bands above and below.
	 */
	Viewer.prototype._fitHeight = function () {
		if (this.o.mode !== 'inline' || this.o.fitHeight === false || !this.doc) { return; }
		var host = this.root.parentNode;
		if (!host || !host.clientWidth) { return; }
		var w = host.clientWidth;
		var narrow = w < 600;
		var cols = this.single ? 1 : 2;
		var pw = (w - (narrow ? 20 : 88)) / cols;
		var ph = pw / (this.doc._aspect || 0.75) * (1 + this._growth());
		var head = this.root.querySelector('.sdf-head');
		var padB = parseFloat(window.getComputedStyle(this.stage).paddingBottom) || 0;
		var want = Math.round(ph + (head ? head.offsetHeight : 48) + padB + (narrow ? 12 : 24) + 8);
		var h = Math.max(300, Math.min(want, Math.round(window.innerHeight * 0.85)));
		if (Math.abs(host.offsetHeight - h) > 2) {
			host.style.minHeight = '0';
			host.style.height = h + 'px';
		}
	};

	/** How much taller (as a fraction) a lifted page is: its edge comes at most ~0.9 width × depth closer to the viewer. */
	Viewer.prototype._growth = function () {
		var z = 0.9 * this.o.depth;
		return z / Math.max(0.5, this.o.perspective - z);
	};

	Viewer.prototype._applySheets = function () {
		var s = this.state, total = this.sheets.length;
		for (var k = 0; k < total; k++) {
			var sheet = this.sheets[k];
			var flipped = k < s;
			sheet.el.style.transform = flipped ? 'rotateY(-180deg)' : 'rotateY(0deg)';
			sheet.el.style.zIndex = flipped ? (k + 1) : (total - k + 1);
			sheet.el.style.visibility = (this.single && flipped) ? 'hidden' : '';
		}
		var off = 0;
		if (!this.single) {
			if (s === 0) { off = -this.pw / 2; }
			else if (s >= total) { off = this.pw / 2; }
		}
		this.book.style.transform = 'translateX(' + off + 'px)';
	};

	/* ---------- rendering pages ---------- */
	/** Renders pages around the current spread and releases distant ones. */
	Viewer.prototype._renderWindow = function () {
		var vis = this._visibleFaces();
		var from = Math.max(0, this.state - 2);
		var to = Math.min(this.sheets.length - 1, this.state + 2);
		for (var k = from; k <= to; k++) {
			var sh = this.sheets[k];
			// high resolution when zoomed, only for pages on screen
			this._renderFace(sh.front, vis.indexOf(sh.front) !== -1);
			this._renderFace(sh.back, vis.indexOf(sh.back) !== -1);
		}
		this._releaseFar();
		this._schedulePrebuild();
	};
	Viewer.prototype._renderSheet = function (k) {
		var sheet = this.sheets[k];
		if (!sheet) { return; }
		this._renderFace(sheet.front, false);
		this._renderFace(sheet.back, false);
	};
	Viewer.prototype._renderFace = function (face, hi) {
		var self = this;
		if (!face.page) { return Promise.resolve(); }
		var want = this.pw * (hi ? Math.max(this.zoom, 1) : 1);
		if (face.drawnWidth && face.drawnWidth >= want * 0.92) { return face.task || Promise.resolve(); }
		face.drawnWidth = want;
		// the spinner appears with a CSS delay so fast renders do not flash it
		if (!face.canvas) { face.holder.innerHTML = '<div class="sdf-spin"></div>'; }
		face.task = this.doc.render(face.page, want).then(function (canvas) {
			if (self.destroyed || face.dead || !canvas || canvas === face.canvas) { return; }
			// the reader moved far away while it rendered (e.g. jumped to the start), so drop the page
			if (face.k < self.state - 3 || face.k > self.state + 3) {
				var hit = self.doc.cache[face.page];
				if (hit && hit.canvas === canvas) { delete self.doc.cache[face.page]; }
				canvas.width = 0;
				canvas.height = 0;
				face.drawnWidth = 0;
				return;
			}
			// the page shows the cached canvas itself, without a second copy in memory
			var old = face.canvas;
			// another face may share the old canvas through the cache: free it only if it is still ours alone
			var freeOld = old && old.parentNode === face.holder && !self._cachedCanvas(old);
			canvas.classList.toggle('sdf-fade', !old);   // the first render fades in, a replacement swaps without flicker
			face.holder.innerHTML = '';
			face.holder.appendChild(canvas);
			face.canvas = canvas;
			if (freeOld) { old.width = 0; old.height = 0; }  // free the old canvas right away (matters on iPhone)
			self._renderLinks(face);
			self._schedulePrebuild();
		})['catch'](function () {
			face.holder.innerHTML = '';
			face.drawnWidth = 0;
		});
		return face.task;
	};
	/** Releases pages more than three sheets away so memory stays flat on long documents. */
	Viewer.prototype._releaseFar = function () {
		var from = this.state - 3, to = this.state + 3;
		for (var k = 0; k < this.sheets.length; k++) {
			if (k >= from && k <= to) { continue; }
			this._releaseFace(this.sheets[k].front);
			this._releaseFace(this.sheets[k].back);
		}
	};
	Viewer.prototype._releaseFace = function (f) {
		if (!f.canvas) { return; }
		var hit = this.doc.cache[f.page];
		if (hit && hit.canvas === f.canvas) { delete this.doc.cache[f.page]; }
		if (f.canvas.parentNode === f.holder) {
			f.canvas.width = 0;
			f.canvas.height = 0;
		}
		f.holder.innerHTML = '';
		f.canvas = null;
		f.drawnWidth = 0;
		f.task = null;
	};
	Viewer.prototype._cachedCanvas = function (c) {
		for (var key in this.doc.cache) {
			if (this.doc.cache[key] && this.doc.cache[key].canvas === c) { return true; }
		}
		return false;
	};
	/** PDF links over the page: web, phone, email, internal destinations. */
	Viewer.prototype._renderLinks = function (face) {
		var self = this;
		if (!this.o.links || face.linksDone || !face.page) { return; }
		face.linksDone = true;
		this.doc.links(face.page).then(function (list) {
			if (self.destroyed || !list.length) { return; }
			var layer = el('div', 'sdf-links');
			list.forEach(function (l) {
				var a = el('a', 'sdf-link');
				a.style.left = (l.left * 100) + '%';
				a.style.top = (l.top * 100) + '%';
				a.style.width = (l.width * 100) + '%';
				a.style.height = (l.height * 100) + '%';
				if (l.url) {
					a.href = l.url;
					a.target = '_blank';
					a.rel = 'noopener';
					a.title = l.url.replace(/^tel:/i, self.t('call')).replace(/^mailto:/i, self.t('mail'));
				} else {
					a.href = '#';
					a.title = self.t('goTo');
					a.addEventListener('click', function (e) { e.preventDefault(); self._gotoDest(l.dest); });
				}
				layer.appendChild(a);
			});
			// a swipe or pinch that started on a link must not open it when the finger lifts
			layer.addEventListener('click', function (e) {
				if (self._gestured) { e.preventDefault(); e.stopPropagation(); }
			}, true);
			face.el.appendChild(layer);
		});
	};
	/** Rendering after a flip waits until the browser is idle so the animation never stutters. */
	Viewer.prototype._scheduleRender = function () {
		var self = this;
		if (this._rq) { return; }
		var run = function () {
			self._rq = 0;
			if (self.destroyed) { return; }
			if (self.busy || self.curl) { setTimeout(function () { self._scheduleRender(); }, 80); return; }
			self._renderWindow();
		};
		this._rq = window.requestIdleCallback ? window.requestIdleCallback(run, { timeout: 300 }) : setTimeout(run, 80);
	};
	/** Prebuilds the next and previous sheets so a flip starts instantly. */
	Viewer.prototype._schedulePrebuild = function () {
		var self = this;
		clearTimeout(this._pbT);
		this._pbT = setTimeout(function () {
			var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 1); };
			idle(function () {
				if (self.destroyed || self.busy || self.curl) { return; }
				self._prebuild(self.state);
				self._prebuild(self.state - 1);
			}, { timeout: 600 });
		}, 150);
	};
	Viewer.prototype._prebuild = function (k) {
		var sheet = this.sheets[k];
		if (!sheet) { return; }
		var fc = sheet.front.page ? sheet.front.canvas : null;
		var bc = sheet.back.page ? sheet.back.canvas : null;
		if ((sheet.front.page && !fc) || (sheet.back.page && !bc)) { return; }   // pages are still rendering
		var pb = this._pre[k];
		if (pb && pb.pw === this.pw && pb.ph === this.ph && pb.fc === fc && pb.bc === bc) { return; }
		this._pre[k] = this._buildCurl(sheet, fc, bc);
	};

	/* ---------- page curl (the heart of the flip) ---------- */
	/*
	 * A turning page is built from vertical strips nested inside each other.
	 * Each strip is rotated a small angle relative to its neighbour, so the page
	 * bends in an arc: the free edge leads the spine, like real paper.
	 */
	Viewer.prototype._curlAngles = function (p, shape, n, out) {
		var e = this.o.bend;
		var lag = Math.pow(p, e);               // angle at the spine
		var lead = 1 - Math.pow(1 - p, e);      // angle at the free edge
		var a = shape > 0 ? lag : lead;
		var b = shape > 0 ? lead : lag;
		for (var i = 0; i < n; i++) {
			var s = (i + 0.5) / n;
			out[i] = 180 * (a + (b - a) * Math.pow(s, 0.85));
		}
		return out;
	};
	Viewer.prototype._edgeAt = function (p, shape) {
		var c = this.curl;
		var n = c ? c.n : 20;
		var w = this.pw / n;
		var th = this._curlAngles(p, shape, n, c ? c.tmp : new Array(n));
		var x = 0;
		for (var i = 0; i < n; i++) { x += w * Math.cos(th[i] * RAD); }
		return x;
	};
	Viewer.prototype._solveP = function (target, shape) {
		var lo = 0, hi = 1;
		for (var i = 0; i < 24; i++) {
			var mid = (lo + hi) / 2;
			if (this._edgeAt(mid, shape) > target) { lo = mid; } else { hi = mid; }
		}
		return (lo + hi) / 2;
	};

	Viewer.prototype._slice = function (src, sx, w, h, blank) {
		var c = document.createElement('canvas');
		var dpr = Math.min(window.devicePixelRatio || 1, 2);
		c.width = Math.max(1, Math.ceil(w * dpr));
		c.height = Math.max(1, Math.ceil(h * dpr));
		var ctx = c.getContext('2d', { alpha: false });
		if (src && src.width && src.height) {
			var k = src.width / this.pw;
			ctx.drawImage(src, Math.max(0, sx * k), 0, Math.max(1, w * k), src.height, 0, 0, c.width, c.height);
		} else {
			ctx.fillStyle = blank ? '#f4f1ea' : '#ffffff';
			ctx.fillRect(0, 0, c.width, c.height);
		}
		return c;
	};

	/** Builds the curling page from strips (without inserting it into the page). */
	Viewer.prototype._buildCurl = function (sheet, frontSrc, backSrc) {
		// touch devices get slightly fewer strips so the animation stays smooth on slow phones
		var touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
		var n = clamp(Math.round(this.pw / 14), 14, touch ? 26 : 40);
		var w = this.pw / n, h = this.ph;
		var wrap = el('div', 'sdf-curl');
		wrap.style.width = this.pw + 'px';
		wrap.style.height = h + 'px';
		// The page really bends but lifts toward the viewer less: the Z axis is compressed.
		// The curl and shading stay, while the page does not balloon in height or leave the frame.
		wrap.style.transform = 'scaleZ(' + this.o.depth + ')';
		var parent = wrap, strips = [];
		// each strip overlaps its neighbour and the overlap continues the same image,
		// so there are no gaps and no dark seams
		var ov = this.o.stripOverlap;
		for (var i = 0; i < n; i++) {
			var last = i === n - 1;
			var sw = last ? w : w + ov;
			var strip = el('div', 'sdf-strip');
			strip.style.width = sw + 'px';
			strip.style.height = h + 'px';
			strip.style.left = (i === 0 ? 0 : w) + 'px';
			var f = el('div', 'sdf-sf');
			f.appendChild(this._slice(frontSrc, i * w, sw, h, !sheet.front.page));
			var fs = el('div', 'sdf-ss');
			f.appendChild(fs);
			var b = el('div', 'sdf-sb');
			b.appendChild(this._slice(backSrc, this.pw - i * w - sw, sw, h, true));
			var bs = el('div', 'sdf-ss');
			b.appendChild(bs);
			if (i === n - 1) { f.classList.add('sdf-edge'); b.classList.add('sdf-edge'); }
			strip.appendChild(f);
			strip.appendChild(b);
			parent.appendChild(strip);
			parent = strip;
			strips.push({ el: strip, fs: fs, bs: bs });
		}
		return { wrap: wrap, strips: strips, n: n, w: w, pw: this.pw, ph: this.ph, fc: frontSrc, bc: backSrc };
	};

	Viewer.prototype._curlStart = function (k, shape) {
		this._curlEnd();
		var sheet = this.sheets[k];
		if (!sheet) { return null; }
		var fc = sheet.front.page ? sheet.front.canvas : null;
		var bc = sheet.back.page ? sheet.back.canvas : null;
		var pb = this._pre[k];
		delete this._pre[k];
		var built = (pb && pb.pw === this.pw && pb.ph === this.ph && pb.fc === fc && pb.bc === bc) ? pb : this._buildCurl(sheet, fc, bc);
		var wrap = built.wrap;
		wrap.style.left = this.single ? '0px' : this.pw + 'px';
		wrap.style.zIndex = this.sheets.length + 6;
		this.book.appendChild(wrap);
		sheet.el.style.visibility = 'hidden';
		// when the cover flips, the book shifts frame by frame, so a CSS transition on the offset would get in the way
		if (!this.single && (k === 0 || k === this.sheets.length - 1)) {
			this.book.style.transition = 'width .3s ease, height .3s ease';
		}
		this.curl = { k: k, shape: shape, n: built.n, w: built.w, wrap: wrap, strips: built.strips, p: shape > 0 ? 0 : 1, th: new Array(built.n), tmp: new Array(built.n) };
		this.cast.style.zIndex = this.sheets.length + 5;
		return this.curl;
	};

	Viewer.prototype._curlSet = function (p) {
		var c = this.curl;
		if (!c) { return; }
		c.p = p;
		var th = this._curlAngles(p, c.shape, c.n, c.th);
		var prev = 0, x = 0;
		// light comes from the front: the more a part of the page turns away, the darker it gets
		function front(a) { return (0.42 * (1 - Math.cos(a * RAD))).toFixed(3); }
		function back(a) { return (0.42 * (1 + Math.cos(a * RAD))).toFixed(3); }
		for (var i = 0; i < c.n; i++) {
			var a = th[i];
			var rel = a - prev;
			prev = a;
			var st = c.strips[i];
			st.el.style.transform = 'rotateY(' + (-rel).toFixed(3) + 'deg)';
			// shading inside a strip is a smooth gradient from its left-edge angle to its right-edge angle, no banding
			var aL = i > 0 ? (th[i - 1] + a) / 2 : a - (th[1] - a) / 2;
			var aR = i < c.n - 1 ? (th[i + 1] + a) / 2 : a + (a - th[i - 1]) / 2;
			st.fs.style.background = 'linear-gradient(to right,rgba(0,0,0,' + front(aL) + '),rgba(0,0,0,' + front(aR) + '))';
			st.bs.style.background = 'linear-gradient(to right,rgba(0,0,0,' + back(aR) + '),rgba(0,0,0,' + back(aL) + '))';
			x += c.w * Math.cos(a * RAD);
		}
		// The cover and the last page are centered, and so is a spread.
		// To keep the book from jumping after the flip, it shifts in sync with the page.
		if (!this.single) {
			// soft curve: while the corner is barely lifted the book hardly moves
			var sm = p * p * (3 - 2 * p);
			var total = this.sheets.length, off = null;
			if (c.k === 0) { off = -this.pw / 2 * (1 - sm); }
			if (c.k === total - 1) { off = (off === null ? 0 : off) + this.pw / 2 * sm; }
			if (off !== null) { this.book.style.transform = 'translateX(' + off.toFixed(2) + 'px)'; }
		}
		// shadow the lifted page casts on the page below
		var lift = Math.sin(p * Math.PI);
		var spine = this.single ? 0 : this.pw;
		if (x >= 0) {
			this.cast.style.left = spine + 'px';
			this.cast.style.width = Math.max(0, x + 30) + 'px';
			this.cast.style.background = 'linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,.08) 55%, rgba(0,0,0,.42) 92%, rgba(0,0,0,0) 100%)';
		} else {
			this.cast.style.left = (spine + x - 30) + 'px';
			this.cast.style.width = (-x + 30) + 'px';
			this.cast.style.background = 'linear-gradient(to left, rgba(0,0,0,0) 0%, rgba(0,0,0,.08) 55%, rgba(0,0,0,.42) 92%, rgba(0,0,0,0) 100%)';
		}
		this.cast.style.opacity = (lift * 0.9).toFixed(3);
	};

	Viewer.prototype._curlEnd = function () {
		var c = this.curl;
		if (!c) { return; }
		if (c.wrap.parentNode) { c.wrap.parentNode.removeChild(c.wrap); }
		this.curl = null;
		if (this.cast) { this.cast.style.opacity = '0'; }
		this.book.style.transition = '';
		// animation finished: paused rendering resumes unless more flips follow
		this._lastFlipEnd = nowMs();
		this._armGate();
	};

	/** Resumes paused rendering as soon as the animation is over. */
	Viewer.prototype._armGate = function () {
		var self = this;
		clearTimeout(this._gateT);
		this._gateT = setTimeout(function () {
			if (self.destroyed) { return; }
			if (self.curl && (self.busy || (self._drag && self._drag.started))) { self._armGate(); return; }
			var q = self._gateQ || [];
			self._gateQ = [];
			q.forEach(function (cont) { cont(); });
		}, 40);
	};

	/* ---------- navigation ---------- */
	Viewer.prototype.page = function () {
		return this.single ? this.state + 1 : Math.max(1, this.state * 2);
	};
	Viewer.prototype.next = function () {
		if (!this.doc) { return; }
		if (this.busy) { this._enqueue(1); return; }
		if (this.state >= this.sheets.length) { return; }
		var p = this._takePeek(this.state, 1);
		if (p != null) { this._flip(this.state, 1, p, 1, 0.75, true, true); return; }
		this._flip(this.state, 1, 0, 1, 0.75);
	};
	Viewer.prototype.prev = function () {
		if (!this.doc) { return; }
		if (this.busy) { this._enqueue(-1); return; }
		if (this.state <= 0) { return; }
		var p = this._takePeek(this.state - 1, -1);
		if (p != null) { this._flip(this.state - 1, -1, p, 0, 0.75, true, true); return; }
		this._flip(this.state - 1, -1, 1, 0, 0.75);
	};
	/** Next was pressed mid-flip: remember it, the next sheet goes right away and faster. */
	Viewer.prototype._enqueue = function (dir) {
		if (!this.o.queue || !this._live || this._drag || this._pinch) { return; }
		var q = this._queue;
		if (q.length && q[q.length - 1] !== dir) { q.length = 0; }   // direction changed: reset the queue
		if (q.length < 3) { q.push(dir); }
	};
	Viewer.prototype.goTo = function (pageNum) {
		if (!this.doc || this.busy) { return; }
		this._peekEnd(true);
		this._queue.length = 0;
		var n = this.doc.count();
		var target = this._stateFor(clamp(pageNum || 1, 1, n));
		if (target === this.state) { this._syncUI(); return; }
		// jump straight to the neighbouring spread and animate only the last sheet
		if (target > this.state) {
			this.state = target - 1;
			this._applySheets();
			this._renderWindow();
			this._flip(this.state, 1, 0, 1, 0.9);
		} else {
			this.state = target + 1;
			this._applySheets();
			this._renderWindow();
			this._flip(this.state - 1, -1, 1, 0, 0.9);
		}
	};

	/**
	 * Animates sheet k from progress p0 to p1 (0 lies on the right, 1 is turned to the left).
	 * shape: 1 flies left (forward), -1 flies right (back).
	 */
	Viewer.prototype._flip = function (k, shape, p0, p1, strength, keepCurl, playTurn) {
		var self = this;
		if (!this.sheets[k]) { return; }
		this.busy = true;
		if (!keepCurl || !this.curl) {
			this._renderSheet(k);
			this._renderSheet(shape > 0 ? k + 1 : k - 1);
			if (!this._curlStart(k, shape)) { this.busy = false; return; }
		}
		var span = Math.abs(p1 - p0);
		// when flipping fast (queue not empty) each sheet flies faster, like a real book
		var fast = this._queue.length > 0 || this._fast;
		var dur = reduceMotion() ? 0 : this.o.duration * clamp(span, 0.3, 1) * (fast ? 0.55 : 1);
		var completing = (shape > 0 && p1 === 1) || (shape < 0 && p1 === 0);
		if (completing && (!keepCurl || playTurn)) { this.sound.turn(dur / 1000, strength); }
		var landed = false;
		var t0 = nowMs();
		var ease = keepCurl ? easeOut : easeInOut;
		function step() {
			if (self.destroyed) { return; }
			var t = dur <= 0 ? 1 : clamp((nowMs() - t0) / dur, 0, 1);
			var p = p0 + (p1 - p0) * ease(t);
			self._curlSet(p);
			if (completing && !landed && t > 0.86) { landed = true; self.sound.land(strength); }
			if (t < 1) { requestAnimationFrame(step); return; }
			self.busy = false;
			var before = self.state;
			if (completing) { self.state = shape > 0 ? k + 1 : k; }
			self._applySheets();
			self._curlEnd();
			self._syncUI();
			// the screen is still: the least noticeable moment to prebuild the next sheet
			self._prebuild(self.state);
			if (self.state !== before) {
				if (self.state === 0 || self.state >= self.sheets.length) { self.sound.thud(); }
				if (typeof self.o.onFlip === 'function') { self.o.onFlip(self.page(), shape); }
			}
			// next sheet from the queue of rapid presses
			if (self._queue.length) {
				var dir = self._queue.shift();
				self._fast = true;
				if (dir > 0) { self.next(); } else { self.prev(); }
				self._fast = false;
				if (self.busy) { return; }
			}
			self._scheduleRender();   // neighbouring pages render once the browser is idle
		}
		requestAnimationFrame(step);
	};

	/* ---------- gestures: drag, swipe, pinch, double tap ---------- */
	Viewer.prototype._spineX = function () {
		var r = this.book.getBoundingClientRect();
		return { x: this.single ? r.left : r.left + r.width / 2, rect: r, scale: (r.height / this.ph) || 1 };
	};
	/** Screen point the book zooms around. */
	Viewer.prototype._zoomOrigin = function () {
		var r = this.stage.getBoundingClientRect();
		var padB = parseFloat(window.getComputedStyle(this.stage).paddingBottom) || 0;
		return { x: r.left + r.width / 2, y: r.top + (r.height - padB) / 2 };
	};
	Viewer.prototype._down = function (e) {
		if (!this.doc) { return; }
		if (e.pointerType === 'mouse' && e.button !== 0) { return; }
		// a tap on a PDF link follows the link, but swipes, pinches and pans that start on it still work;
		// the pointer is not captured yet so the browser can deliver the click to the link
		var onLink = !!(e.target && e.target.closest && e.target.closest('.sdf-link'));
		this._gestured = false;
		this._ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
		if (!onLink) { this._capture(e.pointerId); }
		if (Object.keys(this._ptrs).length >= 2) { this._peekEnd(true); this._startPinch(); return; }
		this._p0 = { x: e.clientX, y: e.clientY, t: nowMs(), type: e.pointerType, link: onLink };
		if (this.zoom > 1.02) {
			this._panning = { x: e.clientX, y: e.clientY, px: this.pan.x, py: this.pan.y };
			this.root.classList.add('sdf-grabbing');
			return;
		}
		if (this.busy) { this._drag = { none: true }; return; }
		// the mouse already lifted the corner: pick the page up from there
		if (this._peek && !this._peek.ending && this.curl) {
			var pk = this._peek;
			this._peekStop();
			var sc = this._spineX().scale;
			var edge0 = pk.shape > 0 ? this.pw : -this.pw;
			var ep = this._edgeAt(this.curl.p, pk.shape);
			this._drag = {
				started: true, fromPeek: true, needSound: true, k: pk.k, shape: pk.shape,
				x0: e.clientX - (ep - edge0) * sc / 1.6, y0: e.clientY,
				lastX: e.clientX, lastT: nowMs(), v: 0, scale: sc, target: ep
			};
			return;
		}
		this._drag = {
			x0: e.clientX, y0: e.clientY, started: false,
			lastX: e.clientX, lastT: nowMs(), v: 0, scale: this._spineX().scale
		};
	};
	Viewer.prototype._capture = function (id) {
		if (this.stage.setPointerCapture) { try { this.stage.setPointerCapture(id); } catch (x) { /* ignore */ } }
	};
	Viewer.prototype._startPinch = function () {
		this._gestured = true;
		for (var id in this._ptrs) { this._capture(+id); }
		var ids = Object.keys(this._ptrs);
		var a = this._ptrs[ids[0]], b = this._ptrs[ids[1]];
		this._abortDrag();
		this._panning = null;
		var o = this._zoomOrigin();
		var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
		this._pinch = {
			d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)),
			z0: this.zoom,
			qx: (mx - o.x - this.pan.x) / this.zoom,
			qy: (my - o.y - this.pan.y) / this.zoom
		};
	};
	/** A second finger touched down mid-flip: put the page back. */
	Viewer.prototype._abortDrag = function () {
		var d = this._drag;
		this._drag = null;
		if (d && d.started && this.curl) {
			this._flip(d.k, d.shape, this.curl.p, d.shape > 0 ? 0 : 1, 0.3, true);
		}
	};
	Viewer.prototype._move = function (e) {
		var pt = this._ptrs[e.pointerId];
		if (pt) { pt.x = e.clientX; pt.y = e.clientY; }
		// a hovering mouse only gets the corner hint
		if (e.pointerType === 'mouse' && !e.buttons && !this._drag && !this._pinch && !this._panning) {
			this._hover(e);
			return;
		}

		if (this._pinch) {
			var ids = Object.keys(this._ptrs);
			if (ids.length < 2) { return; }
			var a = this._ptrs[ids[0]], b = this._ptrs[ids[1]];
			var z = clamp(this._pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y) / this._pinch.d0, 1, this.o.maxZoom);
			var o = this._zoomOrigin();
			this.zoom = z;
			this.pan.x = (a.x + b.x) / 2 - o.x - this._pinch.qx * z;
			this.pan.y = (a.y + b.y) / 2 - o.y - this._pinch.qy * z;
			this.root.classList.toggle('sdf-zoomed', z > 1.02);
			this._applyZoom();
			e.preventDefault();
			return;
		}
		if (this._panning) {
			if (!this._isTap(e)) { this._gestured = true; this._capture(e.pointerId); }
			this.pan.x = this._panning.px + (e.clientX - this._panning.x);
			this.pan.y = this._panning.py + (e.clientY - this._panning.y);
			this._clampPan();
			this._applyZoom();
			return;
		}
		var d = this._drag;
		if (!d || d.none) { return; }
		var t = nowMs();
		if (t > d.lastT) {
			d.v = d.v * 0.6 + 0.4 * ((e.clientX - d.lastX) / (t - d.lastT));
			d.lastX = e.clientX;
			d.lastT = t;
		}
		var dx = e.clientX - d.x0, dy = e.clientY - d.y0;
		if (!d.started) {
			// a vertical gesture is not a flip
			if (Math.abs(dx) < 8) { if (Math.abs(dy) > 16) { d.none = true; } return; }
			if (Math.abs(dy) > Math.abs(dx) * 1.2) { d.none = true; return; }
			// the gesture decides: left is forward, right is back, from anywhere on the page
			var shape = dx < 0 ? 1 : -1;
			var k = shape > 0 ? this.state : this.state - 1;
			if (this.busy || k < 0 || k >= this.sheets.length) { d.none = true; return; }
			d.started = true;
			this._gestured = true;
			this._capture(e.pointerId);
			d.shape = shape;
			d.k = k;
			d.x0 = e.clientX - (dx > 0 ? 8 : -8);
			this._renderSheet(k);
			this._renderSheet(shape > 0 ? k + 1 : k - 1);
			this._curlStart(k, shape);
			this._curlSet(shape > 0 ? 0 : 1);
			this.sound.turn(0.7, clamp(Math.abs(d.v) * 1.5, 0.3, 1));
		} else if (d.needSound && Math.abs(dx) > 6) {
			d.needSound = false;
			this.sound.turn(0.7, clamp(Math.abs(d.v) * 1.5, 0.3, 1));
		}
		// the page edge follows the finger; travel is stretched so one stroke turns the page
		var edge0 = d.shape > 0 ? this.pw : -this.pw;
		d.target = clamp(edge0 + (e.clientX - d.x0) / d.scale * 1.6, -this.pw, this.pw);
		// pointers report moves faster than the display refreshes, so the page updates once per frame
		if (!this._dragRaf) {
			var self = this;
			this._dragRaf = requestAnimationFrame(function () {
				self._dragRaf = 0;
				var dd = self._drag;
				if (dd && dd.started && self.curl) { self._curlSet(self._solveP(dd.target, dd.shape)); }
			});
		}
		e.preventDefault();
	};
	Viewer.prototype._up = function (e) {
		delete this._ptrs[e.pointerId];
		if (this._pinch) {
			if (Object.keys(this._ptrs).length < 2) {
				this._pinch = null;
				this._drag = { none: true };   // the remaining finger does not flip
				this._panning = null;
				if (this.zoom < 1.08) { this.setZoom(1); }
				else { this._clampPan(); this._applyZoom(); this._syncUI(); this._scheduleSharpen(); }
			}
			return;
		}
		if (this._panning) {
			this._panning = null;
			this.root.classList.remove('sdf-grabbing');
			if (this._isTap(e)) { this._tap(e); }
			return;
		}
		var d = this._drag;
		this._drag = null;
		if (!d) { return; }
		if (d.none || !d.started) {
			if (this._isTap(e)) { this._tap(e); }
			return;
		}
		if (this._dragRaf) {
			cancelAnimationFrame(this._dragRaf);
			this._dragRaf = 0;
			if (this.curl && d.target != null) { this._curlSet(this._solveP(d.target, d.shape)); }
		}
		var p = this.curl ? this.curl.p : 0;
		// a click on the lifted corner flips the page
		if (d.fromPeek && this._isTap(e)) {
			this._flip(d.k, d.shape, p, d.shape > 0 ? 1 : 0, 0.75, true, true);
			return;
		}
		var v = d.v;   // px/ms, the sign is the direction
		var complete = d.shape > 0 ? (p > 0.5 || v < -0.4) : (p < 0.5 || v > 0.4);
		var strength = clamp(Math.abs(v), 0.3, 1);
		// the landing slap plays inside the animation, once, when the page lands
		if (d.shape > 0) { this._flip(d.k, 1, p, complete ? 1 : 0, strength, true); }
		else { this._flip(d.k, -1, p, complete ? 0 : 1, strength, true); }
	};
	/* ---------- page corner lifts on mouse hover ---------- */
	Viewer.prototype._hover = function (e) {
		if (!this.o.peel || !this._live || this.busy || this.zoom > 1.02 || this._drag) { this._peekEnd(); return; }
		var sp = this._spineX(), r = sp.rect;
		var zx = 90 * sp.scale, zy = 130 * sp.scale;
		var vy = Math.min(r.bottom - e.clientY, e.clientY - r.top);   // vertical distance to the nearest corner
		var dir = 0, dx = 0;
		if (vy > -10 && vy < zy) {
			var dr = r.right - e.clientX, dl = e.clientX - r.left;
			if (this.state < this.sheets.length && dr > -10 && dr < zx) { dir = 1; dx = dr; }
			else if (!this.single && this.state > 0 && dl > -10 && dl < zx) { dir = -1; dx = dl; }
		}
		if (!dir) { this._peekEnd(); return; }
		var near = 1 - clamp(Math.max(dx, 0) / zx, 0, 1);
		var nearY = 1 - clamp(Math.max(vy, 0) / zy, 0, 1);
		var amt = 0.02 + 0.07 * near * (0.4 + 0.6 * nearY);
		var k = dir > 0 ? this.state : this.state - 1;
		if (!this._peek || this._peek.k !== k || this._peek.shape !== dir) {
			this._peekEnd(true);
			if (!this._curlStart(k, dir)) { return; }
			this._curlSet(dir > 0 ? 0 : 1);
			this._peek = { k: k, shape: dir };
			this.root.classList.add('sdf-peeking');
		}
		this._peek.ending = false;
		this._peek.target = dir > 0 ? amt : 1 - amt;
		this._peekLoop();
	};
	Viewer.prototype._peekLoop = function () {
		var self = this;
		if (this._peekRaf) { return; }
		var step = function () {
			self._peekRaf = 0;
			var pk = self._peek;
			if (!pk || !self.curl) { return; }
			var t = pk.ending ? (pk.shape > 0 ? 0 : 1) : pk.target;
			var p = self.curl.p + (t - self.curl.p) * 0.2;
			if (Math.abs(t - p) < 0.0012) { p = t; }
			self._curlSet(p);
			if (p === t) {
				if (pk.ending) { self._peekStop(); self._curlEnd(); self._applySheets(); }
				return;
			}
			self._peekRaf = requestAnimationFrame(step);
		};
		this._peekRaf = requestAnimationFrame(step);
	};
	/** Lowers the corner: smoothly (default) or at once. */
	Viewer.prototype._peekEnd = function (now) {
		if (!this._peek) { return; }
		if (now) { this._peekStop(); this._curlEnd(); this._applySheets(); return; }
		this._peek.ending = true;
		this._peekLoop();
	};
	/** Stops driving the corner and leaves the page where it is. */
	Viewer.prototype._peekStop = function () {
		if (this._peekRaf) { cancelAnimationFrame(this._peekRaf); this._peekRaf = 0; }
		this._peek = null;
		this.root.classList.remove('sdf-peeking');
	};
	/** If this sheet's corner is lifted, take over its position to flip without a jump. */
	Viewer.prototype._takePeek = function (k, shape) {
		if (!this._peek || !this.curl || this._peek.k !== k || this._peek.shape !== shape) { this._peekEnd(true); return null; }
		var p = this.curl.p;
		this._peekStop();
		return p;
	};

	Viewer.prototype._isTap = function (e) {
		return !!this._p0 && nowMs() - this._p0.t < 450 &&
			Math.hypot(e.clientX - this._p0.x, e.clientY - this._p0.y) < 12;
	};
	/**
	 * Tap or click: near the right edge goes forward, near the left edge goes back,
	 * a double tap in the middle (or on a zoomed page) toggles zoom.
	 */
	Viewer.prototype._tap = function (e) {
		// the browser delivers this tap to the PDF link as a click
		if (this._p0 && this._p0.link) { this._lastTap = null; return; }
		var t = nowMs(), last = this._lastTap;
		var r = this.viewport.getBoundingClientRect();
		var rel = (e.clientX - r.left) / r.width;
		var middle = rel >= 0.3 && rel <= 0.7;
		if ((middle || this.zoom > 1.02) && last && t - last.t < 350 &&
			Math.hypot(e.clientX - last.x, e.clientY - last.y) < 40) {
			this._lastTap = null;
			this.setZoom(this.zoom > 1.05 ? 1 : 2.2, e);
			return;
		}
		this._lastTap = { t: t, x: e.clientX, y: e.clientY };
		if (this.zoom > 1.02 || this.busy) { return; }
		if (rel > 0.7) { this.next(); } else if (rel < 0.3) { this.prev(); }
	};

	/* ---------- zoom ---------- */
	Viewer.prototype.setZoom = function (z, ev) {
		var old = this.zoom;
		this.zoom = clamp(z, 1, this.o.maxZoom);
		if (this.zoom === 1) { this.pan.x = 0; this.pan.y = 0; }
		else if (ev && ev.clientX != null) {
			var o = this._zoomOrigin();
			var cx = ev.clientX - o.x, cy = ev.clientY - o.y;
			var f = this.zoom / old;
			this.pan.x = (this.pan.x - cx) * f + cx;
			this.pan.y = (this.pan.y - cy) * f + cy;
		}
		this._clampPan();
		this.root.classList.toggle('sdf-zoomed', this.zoom > 1.02);
		this._applyZoom();
		this._syncUI();
		if (this.zoom > old) { this._scheduleSharpen(); }
	};
	/** After zooming in, pages re-render at a higher resolution so text stays crisp. */
	Viewer.prototype._scheduleSharpen = function () {
		var self = this;
		clearTimeout(this._zt);
		this._zt = setTimeout(function () { if (!self.destroyed) { self._renderWindow(); } }, 200);
	};
	Viewer.prototype._clampPan = function () {
		var r = this.viewport.getBoundingClientRect();
		var bw = this.book.offsetWidth * this.zoom, bh = this.book.offsetHeight * this.zoom;
		var mx = Math.max(0, (bw - r.width) / 2 + 60);
		var my = Math.max(0, (bh - r.height) / 2 + 60);
		this.pan.x = clamp(this.pan.x, -mx, mx);
		this.pan.y = clamp(this.pan.y, -my, my);
	};
	Viewer.prototype._applyZoom = function () {
		this.zoomer.style.transform = 'translate3d(' + Math.round(this.pan.x) + 'px,' + Math.round(this.pan.y) + 'px,0) scale(' + this.zoom.toFixed(3) + ')';
	};

	/* ---------- other actions ---------- */
	Viewer.prototype.toggleSound = function () {
		var on = !this.sound.enabled;
		this.sound.setEnabled(on);
		this.bSound.innerHTML = icon(on ? 'sound' : 'mute');
		this.bSound.classList.toggle('sdf-on', on);
		if (on) { this.sound.click(); }
	};
	Viewer.prototype.download = function () {
		var url = this._fileUrl();
		var a = document.createElement('a');
		a.href = url;
		a.download = this.o.downloadName || (this.o.source && this.o.source.name) || (this.o.title ? this.o.title + '.pdf' : '');
		a.rel = 'noopener';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		this.sound.click();
	};
	Viewer.prototype.print = function () {
		var url = this._fileUrl();
		if (this._printFrame && this._printFrame.parentNode) { this._printFrame.parentNode.removeChild(this._printFrame); }
		var frame = document.createElement('iframe');
		frame.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0';
		frame.src = url;
		frame.onload = function () {
			try { frame.contentWindow.focus(); frame.contentWindow.print(); }
			catch (e) { window.open(url, '_blank', 'noopener'); }
		};
		document.body.appendChild(frame);
		this._printFrame = frame;
	};
	Viewer.prototype.toggleFullscreen = function () {
		// fullscreen is unavailable on iPhone and in iframes, so a refusal is ignored quietly
		var r = null;
		try {
			if (document.fullscreenElement) { r = document.exitFullscreen(); }
			else if (this.root.requestFullscreen) { r = this.root.requestFullscreen(); }
		} catch (e) { r = null; }
		if (r && r['catch']) { r['catch'](function () {}); }
	};

	/* ---------- side panels ---------- */
	Viewer.prototype._togglePanel = function (name) {
		var open = this.side.classList.contains('sdf-open');
		if (open && this._pane === name) {
			this.side.classList.remove('sdf-open');
			this._pane = null;
			this._syncPanelButtons();
		} else {
			this.side.classList.add('sdf-open');
			this._showPane(name);
		}
		this.sound.click();
		// on phones the panel slides over the book, no relayout needed
		if (!this._overlayPanels()) {
			var self = this;
			setTimeout(function () { self._relayout(true); }, 230);
		}
	};
	Viewer.prototype._overlayPanels = function () {
		return !!(window.matchMedia && window.matchMedia('(max-width: 760px)').matches);
	};
	/** On phones, picking a page in the panel closes it to reveal the book. */
	Viewer.prototype._autoClosePanel = function () {
		if (!this._overlayPanels()) { return; }
		this.side.classList.remove('sdf-open');
		this._pane = null;
		this._syncPanelButtons();
	};
	Viewer.prototype._syncPanelButtons = function () {
		var cur = this.side.classList.contains('sdf-open') ? this._pane : null;
		[['thumbs', this.bThumbs], ['outline', this.bOutline], ['search', this.bSearch]].forEach(function (p) {
			if (p[1]) { p[1].classList.toggle('sdf-on', cur === p[0]); }
		});
	};
	Viewer.prototype._showPane = function (name) {
		this._pane = name;
		this._syncPanelButtons();
		for (var key in this.panes) { this.panes[key].classList.toggle('sdf-on', key === name); }
		[].forEach.call(this.tabs.children, function (t) { t.classList.toggle('sdf-on', t.dataset.pane === name); });
		if (name === 'search') {
			var inp = this.panes.search.querySelector('input');
			if (inp) { setTimeout(function () { inp.focus(); }, 60); }
		}
	};

	Viewer.prototype._buildThumbs = function () {
		var self = this;
		var pane = this.panes.thumbs;
		pane.innerHTML = '';
		this.thumbNodes = [];
		var n = this.doc.count();
		var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
			entries.forEach(function (en) {
				if (!en.isIntersecting) { return; }
				io.unobserve(en.target);
				self._drawThumb(en.target);
			});
		}, { root: pane, rootMargin: '200px' }) : null;
		for (var i = 1; i <= n; i++) {
			var b = el('button', 'sdf-thumb', '<div class="sdf-thumb-ph"></div><span>' + i + '</span>');
			b.type = 'button';
			b.dataset.page = i;
			b.onclick = (function (p) { return function () { self._autoClosePanel(); self.goTo(p); }; })(i);
			pane.appendChild(b);
			this.thumbNodes.push(b);
			if (io) { io.observe(b); } else { this._drawThumb(b); }
		}
		this._syncThumbs();
	};
	Viewer.prototype._drawThumb = function (node) {
		var self = this;
		var num = parseInt(node.dataset.page, 10);
		this.doc.render(num, 150).then(function (canvas) {
			if (self.destroyed || !canvas) { return; }
			var copy = document.createElement('canvas');
			var k = Math.min(1, 300 / canvas.width);
			copy.width = Math.round(canvas.width * k);
			copy.height = Math.round(canvas.height * k);
			copy.getContext('2d').drawImage(canvas, 0, 0, copy.width, copy.height);
			var ph = node.querySelector('.sdf-thumb-ph');
			if (ph) { node.replaceChild(copy, ph); }
		})['catch'](function () { /* skip a broken page */ });
	};
	Viewer.prototype._syncThumbs = function () {
		if (!this.thumbNodes) { return; }
		var cur = this.page();
		var pair = this.single ? [cur] : [cur, cur + 1];
		this.thumbNodes.forEach(function (n) {
			n.classList.toggle('sdf-cur', pair.indexOf(parseInt(n.dataset.page, 10)) !== -1);
		});
	};

	Viewer.prototype._buildOutline = function () {
		var self = this;
		var pane = this.panes.outline;
		pane.innerHTML = '<div class="sdf-note">' + esc(this.t('outlineLoading')) + '</div>';
		this.doc.pdf.getOutline().then(function (items) {
			pane.innerHTML = '';
			if (!items || !items.length) {
				pane.innerHTML = '<div class="sdf-note">' + esc(self.t('noOutline')) + '</div>';
				return;
			}
			pane.appendChild(self._outlineList(items));
		})['catch'](function () {
			pane.innerHTML = '<div class="sdf-note">' + esc(self.t('outlineError')) + '</div>';
		});
	};
	Viewer.prototype._outlineList = function (items) {
		var self = this;
		var wrap = el('div');
		items.forEach(function (it) {
			var b = el('button', 'sdf-out-item', esc(it.title || '—'));
			b.type = 'button';
			b.onclick = function () { self._autoClosePanel(); self._gotoDest(it.dest); };
			wrap.appendChild(b);
			if (it.items && it.items.length) {
				var kids = el('div', 'sdf-out-kids');
				kids.appendChild(self._outlineList(it.items));
				wrap.appendChild(kids);
			}
		});
		return wrap;
	};
	Viewer.prototype._gotoDest = function (dest) {
		var self = this;
		var pdf = this.doc.pdf;
		Promise.resolve(typeof dest === 'string' ? pdf.getDestination(dest) : dest).then(function (d) {
			if (!d || !d[0]) { return; }
			return pdf.getPageIndex(d[0]).then(function (idx) { self.goTo(self.doc.virtualOf(idx)); });
		})['catch'](function () { /* invalid outline destination */ });
	};

	Viewer.prototype._buildSearch = function () {
		var self = this;
		var pane = this.panes.search;
		pane.innerHTML = '';
		var form = el('form', 'sdf-search-form');
		var input = el('input');
		input.type = 'search';
		input.placeholder = this.t('searchPlaceholder');
		var btn = el('button', null, esc(this.t('find')));
		btn.type = 'submit';
		form.appendChild(input);
		form.appendChild(btn);
		var res = el('div', 'sdf-results');
		pane.appendChild(form);
		pane.appendChild(res);
		form.onsubmit = function (e) {
			e.preventDefault();
			self._runSearch(input.value, res);
		};
	};
	Viewer.prototype._runSearch = function (query, box) {
		var self = this;
		query = (query || '').trim();
		box.innerHTML = '';
		if (query.length < 2) {
			box.innerHTML = '<div class="sdf-note">' + esc(this.t('minChars')) + '</div>';
			return;
		}
		var token = ++this._searchToken;
		var n = this.doc.count();
		var lower = query.toLowerCase();
		var rx = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
		var found = 0;
		var note = el('div', 'sdf-note', esc(this.t('searching', { n: 0, total: n })));
		box.appendChild(note);
		var i = 1;
		function step() {
			if (self.destroyed || token !== self._searchToken) { return; }
			if (i > n) {
				note.textContent = found ? self.t('found', { found: found }) : self.t('notFound');
				return;
			}
			var num = i++;
			self.doc.pageText(num).then(function (text) {
				if (token !== self._searchToken) { return; }
				var pos = text.toLowerCase().indexOf(lower);
				if (pos !== -1) {
					found++;
					var from = Math.max(0, pos - 40);
					var snippet = (from > 0 ? '…' : '') + text.substr(from, 110) + '…';
					var b = el('button', 'sdf-hit', '<i>' + esc(self.t('page', { n: num })) + '</i>' + esc(snippet).replace(rx, '<b>$1</b>'));
					b.type = 'button';
					b.onclick = function () { self._autoClosePanel(); self.goTo(num); };
					box.insertBefore(b, note);
				}
				note.textContent = self.t(found ? 'searchingFound' : 'searching', { n: num, total: n, found: found });
				step();
			});
		}
		step();
	};

	/* ---------- UI sync ---------- */
	Viewer.prototype._syncUI = function () {
		if (!this.doc) { return; }
		var n = this.doc.count();
		var cur = this.page();
		var label = cur;
		if (!this.single && this.state > 0 && this.state < this.sheets.length && cur + 1 <= n) { label = cur + '-' + (cur + 1); }
		if (document.activeElement !== this.pageInput) { this.pageInput.value = label; }
		this.bPrev.disabled = this.bFirst.disabled = this.state <= 0;
		this.bNext.disabled = this.bLast.disabled = this.state >= this.sheets.length;
		this.bZoomIn.disabled = this.zoom >= this.o.maxZoom - 0.01;
		this.bZoomOut.disabled = this.zoom <= 1.01;
		this._syncThumbs();
		var said = this.t('pageOf', { page: String(label).replace('-', '–'), total: n });
		if (this.live && this.live.textContent !== said) { this.live.textContent = said; }
	};

	/* ---------- teardown ---------- */
	Viewer.prototype.close = function () {
		var self = this;
		if (this.o.mode === 'inline') { this.destroy(); return; }
		this.root.classList.remove('sdf-in');
		setTimeout(function () { self.destroy(); }, 200);
	};
	Viewer.prototype.destroy = function () {
		if (this.destroyed) { return; }
		this.destroyed = true;
		this._searchToken++;
		this._peekStop();
		if (this._rq) { if (window.cancelIdleCallback) { window.cancelIdleCallback(this._rq); } clearTimeout(this._rq); }
		if (this._dragRaf) { cancelAnimationFrame(this._dragRaf); }
		clearTimeout(this._pbT);
		clearTimeout(this._gateT);
		this._pre = {};
		document.removeEventListener('keydown', this._onKey);
		document.removeEventListener('fullscreenchange', this._onFsChange);
		window.removeEventListener('resize', this._onResize);
		window.removeEventListener('orientationchange', this._onResize);
		if (document.fullscreenElement) { document.exitFullscreen()['catch'](function () {}); }
		if (this._printFrame && this._printFrame.parentNode) { this._printFrame.parentNode.removeChild(this._printFrame); }
		if (this.doc && this.doc.pdf) { try { this.doc.pdf.destroy(); } catch (e) { /* ignore */ } }
		if (this.sound.ctx && this.sound.ctx.close) { try { this.sound.ctx.close(); } catch (e) { /* ignore */ } }
		if (this._blobUrl) { URL.revokeObjectURL(this._blobUrl); }
		if (this.root.parentNode) { this.root.parentNode.removeChild(this.root); }
		if (this.o.mode !== 'inline') {
			document.body.style.overflow = this._prevOverflow || '';
			document.body.style.paddingRight = this._prevPadding || '';
		}
		// focus returns to the button that opened the viewer (matters for keyboard and screen reader users)
		if (this._opener && this._opener.focus && document.body.contains(this._opener)) {
			try { this._opener.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
		}
		if (typeof this.o.onClose === 'function') { this.o.onClose(this); }
	};

	/* ======================= 7. Public API ======================= */

	var SdFlip = {
		version: '1.0.0',
		defaults: DEFAULTS,
		locales: LOCALES,
		Viewer: Viewer,

		/** Opens a PDF in a lightbox over the page. */
		open: function (options) {
			if (typeof options === 'string') { options = { source: options }; }
			return new Viewer(extend({}, options, { mode: 'lightbox' }));
		},
		/** Embeds the viewer into a container. */
		inline: function (container, options) {
			return new Viewer(extend({}, options, { mode: 'inline', container: container }));
		},
		/** Draws the cover (first page) into an element. */
		cover: function (url, target, width) {
			return Promise.all([loadPdfJs(extend({}, DEFAULTS, window.SdFlipConfig || {})), sourceParams(url)]).then(function (res) {
				return res[0].getDocument(res[1]).promise;
			}).then(function (pdf) {
				var doc = new PdfDoc(pdf);
				return doc.aspect().then(function () { return doc.render(1, width || 300); }).then(function (canvas) {
					var node = typeof target === 'string' ? document.querySelector(target) : target;
					if (node && canvas) {
						var copy = canvas.cloneNode(false);
						copy.getContext('2d').drawImage(canvas, 0, 0);
						copy.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
						node.innerHTML = '';
						node.appendChild(copy);
					}
					pdf.destroy();
					return canvas;
				});
			});
		},
		/** Binds every [data-sdflip] element to open the viewer on click. */
		scan: function (root) {
			var scope = root || document;
			var nodes = scope.querySelectorAll('[data-sdflip]:not([data-sdf-bound])');
			[].forEach.call(nodes, function (node) {
				node.setAttribute('data-sdf-bound', '1');
				node.addEventListener('click', function (e) {
					var src = node.getAttribute('data-sdflip') || node.getAttribute('href');
					if (!src) { return; }
					e.preventDefault();
					SdFlip.open({
						source: src,
						title: node.getAttribute('data-sdf-title') || node.getAttribute('title') || '',
						downloadUrl: node.getAttribute('data-sdf-download') || src,
						page: parseInt(node.getAttribute('data-sdf-page'), 10) || 1,
						layout: node.getAttribute('data-sdf-layout') || 'auto',
						sound: node.getAttribute('data-sdf-sound') !== 'false',
						lang: node.getAttribute('data-sdf-lang') || undefined
					});
				});
			});
			return nodes.length;
		}
	};

	window.SdFlip = SdFlip;
	if (typeof module === 'object' && module.exports) { module.exports = SdFlip; }
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', function () { SdFlip.scan(); });
	} else {
		SdFlip.scan();
	}
})(window, document);
