#!/usr/bin/env node
// The landing's surface detail texture (static/textures/surface-detail.webp),
// from the render pipeline's CC0 ambientCG maps: how a finish's roughness
// varies across it, the way real metal is never the same roughness twice.
//
//   r  brushed streaks and their soft patches (Metal009's roughness)
//   g  handling smudges on a polished surface (Metal012's roughness)
//
// Each centred on mid-grey (0.5: no change) and stretched so its spread
// fills the range; the viewer scales them per finish (ModelViewer's
// bakedSurface). Both tile, so the texture repeats seamlessly.
//
//   node scripts/surface-detail.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PBR = `${ROOT}scripts/render/textures/pbr/`;
const SIZE = 1024;

/** One map as a greyscale channel: centred on 128, its 1st–99th percentile spread across most of the range. */
async function channel(file) {
	const raw = await sharp(`${PBR}${file}`).resize(SIZE, SIZE).greyscale().raw().toBuffer();
	const sorted = Uint8Array.from(raw).sort();
	const lo = sorted[Math.floor(sorted.length * 0.01)];
	const hi = sorted[Math.floor(sorted.length * 0.99)];
	let mean = 0;
	for (const v of raw) mean += v;
	mean /= raw.length;
	const half = Math.max(1, Math.max(hi - mean, mean - lo));
	return raw.map((v) => Math.max(0, Math.min(255, Math.round(128 + ((v - mean) / half) * 120))));
}

const [r, g] = await Promise.all([channel('Metal009/Metal009_2K-JPG_Roughness.jpg'), channel('Metal012/Metal012_2K-JPG_Roughness.jpg')]);
const rgb = Buffer.alloc(SIZE * SIZE * 3);
for (let i = 0; i < SIZE * SIZE; i++) {
	rgb[i * 3] = r[i];
	rgb[i * 3 + 1] = g[i];
	rgb[i * 3 + 2] = 128;
}
await mkdir(`${ROOT}static/textures`, { recursive: true });
const out = `${ROOT}static/textures/surface-detail.webp`;
await sharp(rgb, { raw: { width: SIZE, height: SIZE, channels: 3 } }).webp({ quality: 88, effort: 6 }).toFile(out);
console.log(out);
