(function () {
	'use strict';
	var $ = function (s, r) { return (r || document).querySelector(s); };
	var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };

	/* ---- theme ---- */
	var root = document.documentElement;
	$('#theme').addEventListener('click', function () {
		var dark = root.getAttribute('data-theme') ? root.getAttribute('data-theme') === 'dark'
			: window.matchMedia('(prefers-color-scheme: dark)').matches;
		var next = dark ? 'light' : 'dark';
		root.setAttribute('data-theme', next);
		try { localStorage.setItem('sdflip-theme', next); } catch (e) { /* storage blocked */ }
	});

	/* ---- nav border on scroll ---- */
	var nav = $('#nav');
	var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 8); };
	window.addEventListener('scroll', onScroll, { passive: true });
	onScroll();

	/* ---- lightbox demos ---- */
	$$('[data-open]').forEach(function (b) {
		b.addEventListener('click', function () {
			SdFlip.open({ source: b.getAttribute('data-open'), title: b.getAttribute('data-title') || '', lang: b.getAttribute('data-lang') || 'en' });
		});
	});

	/* ---- own PDF: click or drop, the file never leaves the browser ---- */
	var drop = $('#drop');
	var input = $('#own-pdf');
	var openFile = function (file) {
		if (file) { SdFlip.open({ source: file, title: file.name.replace(/\.pdf$/i, ''), downloadName: file.name }); }
	};
	input.addEventListener('change', function () { openFile(input.files[0]); input.value = ''; });
	['dragenter', 'dragover'].forEach(function (t) {
		drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); });
	});
	['dragleave', 'drop'].forEach(function (t) {
		drop.addEventListener(t, function () { drop.classList.remove('over'); });
	});
	drop.addEventListener('drop', function (e) {
		e.preventDefault();
		openFile(e.dataTransfer.files[0]);
	});

	/* ---- lazy work: covers and inline viewers start when they come near the screen ---- */
	var whenNear = function (node, fn) {
		if (!('IntersectionObserver' in window)) { fn(); return; }
		var io = new IntersectionObserver(function (es) {
			if (es[0].isIntersecting) { io.disconnect(); fn(); }
		}, { rootMargin: '300px' });
		io.observe(node);
	};
	var covers = {};
	$$('[data-cover]').forEach(function (box) {
		whenNear(box, function () {
			var url = box.getAttribute('data-cover');
			covers[url] = covers[url] || SdFlip.cover(url, null, 360);
			covers[url].then(function (canvas) {
				var c = document.createElement('canvas');
				c.width = canvas.width;
				c.height = canvas.height;
				c.getContext('2d').drawImage(canvas, 0, 0);
				box.appendChild(c);
			})['catch'](function () { /* the card still opens the PDF */ });
		});
	});

	// the hero column is a bit narrower than the automatic spread threshold, so ask for spreads explicitly
	var hero = $('#hero-book');
	SdFlip.inline(hero, {
		source: 'samples/field-guide.pdf', title: 'SdFlip Field Guide', fitHeight: false, lang: 'en',
		layout: hero.clientWidth >= 560 ? 'double' : 'auto'
	});
	whenNear($('#inline-book'), function () {
		SdFlip.inline('#inline-book', { source: 'samples/chroma-spreads.pdf', title: 'Chroma', lang: 'en' });
	});

	/* ---- tabs ---- */
	$$('.tabs').forEach(function (bar) {
		var tabs = $$('[role=tab]', bar);
		tabs.forEach(function (t) {
			t.addEventListener('click', function () {
				tabs.forEach(function (o) {
					o.setAttribute('aria-selected', String(o === t));
					document.getElementById(o.getAttribute('data-tab')).hidden = o !== t;
				});
			});
		});
	});

	/* ---- code: light highlighting and copy buttons ---- */
	var esc = function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
	var RULES = {
		js: [/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`[^`]*`)|\b(const|let|var|function|return|import|from|new|true|false|null)\b/g, ['c', 's', 'k']],
		html: [/(<!--[\s\S]*?-->|\/\/[^\n]*)|("[^"]*"|'[^']*')|(<\/?[\w-]+|\/?>)|(\b[\w-]+)(?==)|\b(const|window|true|false)\b/g, ['c', 's', 't', 'a', 'k']],
		css: [/(\/\*[\s\S]*?\*\/)|(#[0-9a-f]{3,6}\b)|(--[\w-]+)(?=:)|(\.[\w-]+)/gi, ['c', 's', 'a', 't']],
		bash: [/(#[^\n]*)/g, ['c']]
	};
	$$('pre').forEach(function (pre) {
		var src = pre.textContent;
		var rule = RULES[pre.getAttribute('data-lang')];
		if (rule) {
			var out = '', last = 0, m;
			rule[0].lastIndex = 0;
			while ((m = rule[0].exec(src))) {
				out += esc(src.slice(last, m.index));
				var g = 1;
				while (g < m.length && m[g] === undefined) { g++; }
				out += '<span class="tk-' + rule[1][g - 1] + '">' + esc(m[0]) + '</span>';
				last = m.index + m[0].length;
				if (!m[0].length) { rule[0].lastIndex++; }
			}
			pre.innerHTML = out + esc(src.slice(last));
		}
		var b = document.createElement('button');
		b.className = 'copy';
		b.type = 'button';
		b.textContent = 'Copy';
		b.addEventListener('click', function () { copy(src, b); });
		pre.appendChild(b);
	});
	$$('[data-copy]').forEach(function (b) {
		b.addEventListener('click', function () { copy($(b.getAttribute('data-copy')).textContent, b); });
	});
	function copy(text, btn) {
		var done = function () {
			btn.textContent = 'Copied';
			setTimeout(function () { btn.textContent = 'Copy'; }, 1400);
		};
		if (navigator.clipboard) { navigator.clipboard.writeText(text).then(done, function () {}); }
	}

	/* ---- docs nav highlights the section on screen ---- */
	if ('IntersectionObserver' in window) {
		var links = {};
		$$('.toc a').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
		var spy = new IntersectionObserver(function (es) {
			es.forEach(function (e) {
				if (e.isIntersecting && links[e.target.id]) {
					$$('.toc a').forEach(function (a) { a.classList.remove('on'); });
					links[e.target.id].classList.add('on');
				}
			});
		}, { rootMargin: '-20% 0px -70% 0px' });
		$$('.doc h3[id]').forEach(function (h) { spy.observe(h); });
	}

	/* ---- curl lab: the same strip model the library uses ---- */
	var curl = $('#curl');
	var scene = $('#scene');
	var P = $('#lab-p'), B = $('#lab-b'), S = $('#lab-s');
	var W = 160;
	function angles(p, bend, n) {
		var lag = Math.pow(p, bend);             // spine
		var lead = 1 - Math.pow(1 - p, bend);    // free edge
		var out = [];
		for (var i = 0; i < n; i++) { out.push(180 * (lag + (lead - lag) * Math.pow((i + 0.5) / n, 0.85))); }
		return out;
	}
	var strips = [];
	function build(n) {
		curl.innerHTML = '';
		strips = [];
		var parent = curl;
		for (var i = 0; i < n; i++) {
			var s = document.createElement('div');
			s.className = 'st';
			s.style.width = (W / n) + 'px';
			if (i) { s.style.left = (W / n) + 'px'; }
			var face = document.createElement('i');
			s.appendChild(face);
			parent.appendChild(s);
			strips.push(s);
			parent = s;
		}
		$('#lab-n').textContent = n + ' strips';
	}
	function shade(deg) {
		var l = Math.round(98 - 30 * Math.abs(Math.sin(deg * Math.PI / 180)));
		return 'hsl(40, 30%, ' + l + '%)';
	}
	function draw() {
		var n = +S.value;
		if (strips.length !== n) { build(n); }
		var a = angles(+P.value, +B.value, n);
		var prev = 0;
		for (var i = 0; i < n; i++) {
			strips[i].style.transform = 'rotateY(' + (-(a[i] - prev)).toFixed(2) + 'deg)';
			var left = i ? (a[i - 1] + a[i]) / 2 : a[0];
			var right = i < n - 1 ? (a[i] + a[i + 1]) / 2 : a[i];
			strips[i].firstChild.style.background = 'linear-gradient(90deg,' + shade(left) + ',' + shade(right) + ')';
			prev = a[i];
		}
		$('#lab-po').textContent = (+P.value).toFixed(2);
		$('#lab-bo').textContent = (+B.value).toFixed(2);
		$('#lab-so').textContent = n;
	}
	[P, B, S].forEach(function (r) { r.addEventListener('input', function () { stop(); draw(); }); });
	$('#lab-lines').addEventListener('click', function () {
		var on = scene.classList.toggle('lines');
		this.setAttribute('aria-pressed', String(on));
	});
	var raf = 0;
	var play = $('#lab-play');
	function stop() { cancelAnimationFrame(raf); raf = 0; play.setAttribute('aria-pressed', 'false'); play.textContent = 'Play'; }
	play.addEventListener('click', function () {
		if (raf) { stop(); return; }
		play.setAttribute('aria-pressed', 'true');
		play.textContent = 'Pause';
		var t0 = performance.now() - (+P.value) * 1600;
		var tick = function (t) {
			var k = ((t - t0) % 3200) / 1600;
			var x = k <= 1 ? k : 2 - k;
			P.value = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
			draw();
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
	});
	draw();
})();
