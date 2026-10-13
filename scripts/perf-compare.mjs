#!/usr/bin/env node
// Two R1 perf runs side by side (src/lib/dev/perf.ts): each feature's
// GPU time, how it splits, draw calls and memory, and how far its frame
// moved, pixel for pixel. Writes a diff image per feature (differences
// amplified 8×) next to the second run's frames.
//
//   node scripts/perf-compare.mjs baseline shadow-throttle
//
// A frame "matches" when no channel moved more than 2/255 anywhere: the
// bar for a change meant to leave the image as it was. Two runs of the same
// code: 01 matches, the others are off on 0.02% of pixels at most (a few
// coincident CAD faces), 05 on ~0.25% (its energy trails move with time).
// Times: ±10% a feature from run to run; the total is steadier. "page MB"
// is every viewer's render targets and geometry together (runs from before
// it was recorded show –).
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const [a, b] = process.argv.slice(2);
if (!a || !b) {
	console.error('usage: node scripts/perf-compare.mjs <run-a> <run-b>');
	process.exit(1);
}
const dir = (label) => new URL(`../captures/perf/${label}/`, import.meta.url);
const file = (name, label) => fileURLToPath(new URL(name, dir(label)));
const report = async (label) => JSON.parse(await readFile(new URL('report.json', dir(label)), 'utf8'));
const [ra, rb] = await Promise.all([report(a), report(b)]);

if (ra.viewport.join() !== rb.viewport.join() || ra.dpr !== rb.dpr)
	console.warn(`! different windows: ${ra.viewport.join('×')}@${ra.dpr} vs ${rb.viewport.join('×')}@${rb.dpr}`);
if (ra.gpu !== rb.gpu) console.warn(`! different GPUs: ${ra.gpu} vs ${rb.gpu}`);

const ms = (x) => (x == null ? '–' : x.toFixed(2));
const delta = (x, y) => (x && y ? `${(((y - x) / x) * 100).toFixed(0).replace(/^(?!-)/, '+')}%` : '');
const mb = (bytes) => (bytes / 2 ** 20).toFixed(0);
const sum = (xs) => xs.reduce((s, x) => s + x, 0);

/** Mean and max channel difference (0–255), and the share of pixels off by more than 2. */
async function diff(fa, fb, out) {
	const load = (f) => sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	const [x, y] = await Promise.all([load(fa), load(fb)]);
	if (x.info.width !== y.info.width || x.info.height !== y.info.height) return null;
	const n = x.info.width * x.info.height;
	const img = Buffer.alloc(n * 3);
	let total = 0;
	let max = 0;
	let off = 0;
	for (let p = 0; p < n; p++) {
		let worst = 0;
		for (let c = 0; c < 4; c++) {
			const d = Math.abs(x.data[p * 4 + c] - y.data[p * 4 + c]);
			total += d;
			if (d > worst) worst = d;
		}
		if (worst > max) max = worst;
		if (worst > 2) off++;
		img[p * 3] = img[p * 3 + 1] = img[p * 3 + 2] = Math.min(255, worst * 8);
	}
	await sharp(img, { raw: { width: x.info.width, height: x.info.height, channels: 3 } }).png().toFile(out);
	return { mean: total / (n * 4), max, off: off / n };
}

const rows = [];
for (const sb of rb.shots) {
	const sa = ra.shots.find((s) => s.feature === sb.feature);
	const pa = sa?.profile;
	const pb = sb.profile;
	const name = `${String(sb.feature).padStart(2, '0')}.png`;
	const fa = file(name, a);
	const fb = file(name, b);
	const d = existsSync(fa) && existsSync(fb) ? await diff(fa, fb, file(`diff-${a}-${name}`, b)) : null;
	rows.push(
		`| ${sb.feature} | ${ms(pa?.full)} → ${ms(pb?.full)} ${delta(pa?.full, pb?.full)} | ${ms(pa?.shadow)} → ${ms(pb?.shadow)} | ${ms(pa?.scene)} → ${ms(pb?.scene)} | ${ms(pa?.post)} → ${ms(pb?.post)} | ${pa?.calls ?? '–'} → ${pb?.calls ?? '–'} | ${pa ? mb(sum(pa.targets.map((t) => t.bytes))) : '–'} → ${pb ? mb(sum(pb.targets.map((t) => t.bytes))) : '–'} | ${sa?.memory ? mb(sa.memory) : '–'} → ${sb.memory ? mb(sb.memory) : '–'} | ${
			d ? `${d.off === 0 && d.max <= 2 ? 'match' : `${(d.off * 100).toFixed(2)}% px, max ${d.max}`}` : '–'
		} |`
	);
}
console.log(`${a} → ${b}  (${rb.gpu}, ${rb.viewport.join('×')}@${rb.dpr})\n`);
console.log('| # | GPU ms | shadow | scene | post | calls | targets MB | page MB | pixels |');
console.log('|---|---|---|---|---|---|---|---|---|');
const total = (r) => sum(r.shots.map((s) => s.profile?.full ?? 0));
console.log(rows.join('\n'));
console.log(`| all | ${ms(total(ra))} → ${ms(total(rb))} ${delta(total(ra), total(rb))} | | | | | | | |`);
