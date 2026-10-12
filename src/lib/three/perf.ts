/**
 * Measuring the R1 explorer, for the 3D optimisation work: a run steps
 * through every feature, lets each settle, then times its frame on the GPU
 * (`ModelViewer.profile`) and captures it, so a later run can be checked
 * against it for speed and for every pixel (scripts/perf-compare.mjs).
 * Dev only: frames and the report are saved under captures/perf/<label>/
 * by the dev server (scripts/vite-perf.js).
 *
 * From a fresh load of the page with ?perf, in the console:
 *
 *   await __perf.run('baseline')
 *
 * or the Run button on the readout (PerfHud). Same window size each time:
 * the report records it and the compare flags a mismatch.
 */
import type { ModelViewer, ViewProfile } from '$lib/three/ModelViewer';

/** What a run needs of the explorer (ReactorExplorer, with ?perf). */
export type PerfTarget = {
	/** How many features there are. */
	count: number;
	/** Opens feature `i` (from 0). */
	select(i: number): void;
	/** The viewer feature `i` is shown on, once it has loaded. */
	viewerFor(i: number): ModelViewer | undefined;
	/** Every viewer loaded so far. */
	viewers(): ModelViewer[];
	/** Holds or lets go of the slow turn, as the pause button. */
	setPaused(on: boolean): void;
};

export type ShotReport = {
	feature: number;
	profile: ViewProfile | null;
	settled: number;
	/** Where the camera and model stood: frames that differ with nothing changed differ here first. */
	pose: number[];
	/** GPU memory held by every viewer on the page at the time, bytes (render targets and geometry). */
	memory: number;
};
export type PerfReport = {
	label: string;
	date: string;
	gpu: string;
	agent: string;
	viewport: [number, number];
	dpr: number;
	shots: ShotReport[];
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Until `v` has drawn nothing new for `quiet` ms: whatever the feature
 * stages (cuts, fades, the turn to its point) has played out. Never under
 * `min`, at most `max` (energy trails keep drawing for good). Returns how
 * long it took.
 */
async function settle(v: ModelViewer, { min = 2500, quiet = 1000, max = 12000 } = {}) {
	const start = performance.now();
	await wait(min);
	let drawn = v.framesDrawn;
	let still = performance.now();
	while (performance.now() - start < max) {
		await wait(100);
		if (v.framesDrawn !== drawn) {
			drawn = v.framesDrawn;
			still = performance.now();
		} else if (performance.now() - still >= quiet) break;
	}
	return performance.now() - start;
}

/** The viewer for feature `i`, waiting for it to load (the later model loads on the way to it). */
async function viewerOf(target: PerfTarget, i: number, timeout = 30000) {
	const start = performance.now();
	for (;;) {
		const v = target.viewerFor(i);
		if (v) return v;
		if (performance.now() - start > timeout) return undefined;
		await wait(200);
	}
}

function gpuName(v: ModelViewer | undefined) {
	const gl = v?.renderer.getContext();
	const info = gl?.getExtension('WEBGL_debug_renderer_info');
	return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
}

async function save(label: string, file: string, body: Blob | string) {
	const res = await fetch(`/__perf/${label}/${file}`, { method: 'PUT', body });
	if (!res.ok) throw new Error(`saving ${file}: ${res.status}`);
}

/**
 * The run: the slow turn held and wound back to nothing, quality held at
 * its full step, then from the last feature round to it again, so every
 * feature is reached from the same one each time. `log` hears progress.
 */
export async function run(target: PerfTarget, label: string, { capture = true, log = console.info } = {}): Promise<PerfReport> {
	if (!/^[\w-]+$/.test(label)) throw new Error('label: letters, digits, - and _ only');
	target.setPaused(true);
	const order = [target.count - 1, ...Array.from({ length: target.count }, (_, i) => i)];
	const report: PerfReport = {
		label,
		date: new Date().toISOString(),
		gpu: '',
		agent: navigator.userAgent,
		viewport: [innerWidth, innerHeight],
		dpr: devicePixelRatio,
		shots: []
	};
	for (const [n, i] of order.entries()) {
		target.select(i);
		const v = await viewerOf(target, i);
		if (!v) {
			log(`[perf] ${label}: feature ${i + 1}'s model never loaded`);
			continue;
		}
		if (n === 0) {
			for (const each of target.viewers()) each.resetSpin();
		}
		v.holdStep(0);
		const settled = await settle(v);
		// The first stop only sets up where the run starts from.
		if (n === 0) continue;
		const profile = await v.profile();
		report.gpu ||= gpuName(v);
		v.root.updateMatrixWorld();
		const pose = [...v.camera.position.toArray(), ...v.target.toArray(), v.camera.fov, ...v.root.matrixWorld.elements];
		const memory = target
			.viewers()
			.map((each) => each.memory())
			.reduce((sum, m) => sum + m.targets.reduce((a, t) => a + t.bytes, 0) + Object.values(m.geometry).reduce((a, b) => a + b, 0), 0);
		report.shots.push({ feature: i + 1, profile, settled: Math.round(settled), pose, memory });
		if (capture) {
			const png = await v.snapshot();
			if (png) await save(label, `${String(i + 1).padStart(2, '0')}.png`, png);
		}
		if (profile)
			log(
				`[perf] ${label} ${i + 1}: ${profile.full.toFixed(2)} ms (shadow ${profile.shadow.toFixed(2)}, scene ${profile.scene.toFixed(2)}, post ${profile.post.toFixed(2)}), ${profile.calls} calls, ${(profile.triangles / 1e6).toFixed(2)}M tris`
			);
	}
	await save(label, 'report.json', JSON.stringify(report, null, '\t') + '\n');
	log(`[perf] ${label}: saved to captures/perf/${label}/`);
	return report;
}
