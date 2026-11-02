// Builds dist/ from src/ and copies it into the demo site: node tools/build.mjs
import { buildSync } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SITE = path.join(ROOT, 'docs', 'lib');
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const src = fs.readFileSync(path.join(ROOT, 'src', 'sdflip.js'), 'utf8');
const lib = src.match(/version: '([^']+)'/);
if (!lib || lib[1] !== version) {
	throw new Error(`version mismatch: package.json ${version}, src/sdflip.js ${lib && lib[1]}`);
}

fs.mkdirSync(DIST, { recursive: true });
fs.mkdirSync(SITE, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'src', 'sdflip.js'), path.join(DIST, 'sdflip.js'));
fs.copyFileSync(path.join(ROOT, 'src', 'sdflip.css'), path.join(DIST, 'sdflip.css'));
for (const [file, loader] of [['sdflip.js', 'js'], ['sdflip.css', 'css']]) {
	buildSync({
		entryPoints: [path.join(ROOT, 'src', file)],
		outfile: path.join(DIST, file.replace(/\.(js|css)$/, '.min.$1')),
		minify: true,
		target: loader === 'js' ? 'es2015' : 'chrome80',
		legalComments: 'inline',
		logLevel: 'warning'
	});
}
for (const f of fs.readdirSync(DIST)) {
	fs.copyFileSync(path.join(DIST, f), path.join(SITE, f));
	console.log(`dist/${f}`.padEnd(24), (fs.statSync(path.join(DIST, f)).size / 1024).toFixed(1), 'KB');
}
