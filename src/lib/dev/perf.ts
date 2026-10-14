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
 *   await __perf.run('no-bake', { params: { bakedAO: 0 } })
 *
 * or the Run button on the readout (PerfHud). Same window size each time:
 * the report records it and the compare flags a mismatch.
 */
import type * as THREE from 'three';
import type { ModelViewer, RenderParams, ViewProfile } from '$lib/three/viewer/ModelViewer';

/** What a run needs of the explorer (ReactorExplorer, with ?perf). */
export type PerfTarget = {
	/** How many features there are. */
	count: number;
	/** Opens feature `i` (from 0). */
	select(i: number): void;
	/** The viewer feature `i` is shown on, once it has loaded. */
	viewerFor(i: number): ModelViewer | undefined;
	/** The model feature `i` is shown on. */
	modelFor(i: number): string | undefined;
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

/**
 * The viewer for feature `i`, waiting for it to load (the later model loads
 * on the way to it), groups held back (`deferred`) and all.
 */
async function viewerOf(target: PerfTarget, i: number, timeout = 30000) {
	const start = performance.now();
	for (;;) {
		const v = target.viewerFor(i);
		if (v) {
			await v.loadDeferred();
			return v;
		}
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
export async function run(
	target: PerfTarget,
	label: string,
	{ capture = true, log = console.info, params = {} as Partial<RenderParams> } = {}
): Promise<PerfReport> {
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
		// A look to try against another run's (`params`), on each viewer as it comes on.
		for (const [k, value] of Object.entries(params)) v.setParam(k as keyof RenderParams, value as number | string);
		const settled = await settle(v);
		// The first stop only sets up where the run starts from.
		if (n === 0) continue;
		const profile = await v.profile();
		if (profile && profile.width < 16) log(`[perf] ${label} ${i + 1}: the viewer was asleep, its frame isn't the view`);
		report.gpu ||= gpuName(v);
		v.root.updateMatrixWorld();
		const pose = [...v.camera.position.toArray(), ...v.target.toArray(), v.camera.fov, ...v.root.matrixWorld.elements];
		const memory = target
			.viewers()
			.map((each) => each.memory())
			.reduce(
				(sum, m) =>
					sum + m.targets.reduce((a, t) => a + t.bytes, 0) + Object.values(m.geometry).reduce((a, b) => a + b, 0),
				0
			);
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

/**
 * One look tried on a feature's viewer (`feature`, from 0, as it stands: open
 * it first), without a whole run: `params` set, a moment to draw, and the
 * frame saved as captures/perf/<label>/<name>.png. The slow turn is held,
 * so shots line up; settings stay as set.
 *
 *   await __perf.shot('looks', 'metal-half', { finishMetal: 0.5 })
 */
export async function shot(
	target: PerfTarget,
	label: string,
	name: string,
	params: Partial<RenderParams> = {},
	feature = 0
) {
	if (!/^[\w-]+$/.test(label) || !/^[\w-]+$/.test(name)) throw new Error('label, name: letters, digits, - and _ only');
	const v = target.viewerFor(feature);
	if (!v) throw new Error(`feature ${feature + 1}'s viewer hasn't loaded`);
	target.setPaused(true);
	for (const [k, value] of Object.entries(params)) v.setParam(k as keyof RenderParams, value as number | string);
	v.invalidate();
	await wait(600);
	const png = await v.snapshot();
	if (png) await save(label, `${name}.png`, png);
}

/**
 * Which CAD parts can ever be seen, for scripts/lab/bake-surface.mjs to leave
 * the rest out of the landing's models: every feature, settled, sampled all
 * the way round and through the drag's tilt (`ModelViewer.visibleParts`),
 * and the moves between them, as they play, once every SAMPLE_MS. Saved as
 * captures/perf/visibility/<model>.json: part indices by file. From a fresh
 * load with ?perf&visibility:
 *
 *   await __perf.visibility()
 */
export async function visibility(target: PerfTarget, { log = console.info } = {}) {
	const SAMPLE_MS = 300;
	const seen = new Map<string, Map<string, Set<number>>>();
	const add = (model: string, parts: Record<string, number[]>) => {
		let files = seen.get(model);
		if (!files) seen.set(model, (files = new Map()));
		for (const [file, list] of Object.entries(parts)) {
			let set = files.get(file);
			if (!set) files.set(file, (set = new Set()));
			for (const p of list) set.add(p);
		}
	};
	target.setPaused(true);
	const order = [target.count - 1, ...Array.from({ length: target.count }, (_, i) => i)];
	for (const i of order) {
		target.select(i);
		const v = await viewerOf(target, i);
		const model = target.modelFor(i);
		if (!v || !model) continue;
		// The move there, as it plays: one look each time, at the turn it's at.
		const start = performance.now();
		while (performance.now() - start < 6000) {
			add(model, await v.visibleParts({ turns: 1, tilts: [0] }));
			await wait(SAMPLE_MS);
		}
		await settle(v, { min: 500 });
		add(model, await v.visibleParts());
		log(
			`[visibility] ${i + 1}: ${[...seen.get(model)!.values()].reduce((n, s) => n + s.size, 0)} parts seen on ${model} so far`
		);
	}
	for (const [model, files] of seen) {
		const json = Object.fromEntries([...files].map(([file, set]) => [file, [...set].sort((a, b) => a - b)]));
		await save('visibility', `${model}.json`, JSON.stringify(json) + '\n');
	}
	log('[visibility] saved to captures/perf/visibility/');
}

/**
 * How many triangles are never seen (`ModelViewer.visibleTriangles`): the
 * visibility tour (every feature, the moves between them, the drag's tilts
 * all the way round), counting triangles rather than parts, at full detail.
 * Logs and returns, per model and group, triangles in all and never seen.
 * From a fresh load with ?perf, in the console:
 *
 *   await __perf.hidden()
 */
export async function hidden(target: PerfTarget, { log = console.info, scale = 1.25, keep = false } = {}) {
	const seen = new Map<ModelViewer, Map<THREE.Mesh, Uint8Array>>();
	const counts = new Map<ModelViewer, Map<THREE.Mesh, number>>();
	const files = new Map<THREE.Mesh, string>();
	const models = new Map<ModelViewer, string>();
	const look = async (v: ModelViewer, o?: Parameters<ModelViewer['visibleTriangles']>[1]) => {
		if (!seen.has(v)) seen.set(v, new Map());
		if (!counts.has(v)) counts.set(v, new Map());
		for (const { mesh, count, file } of await v.visibleTriangles(seen.get(v)!, o)) {
			counts.get(v)!.set(mesh, count);
			files.set(mesh, file);
		}
	};
	target.setPaused(true);
	const order = [target.count - 1, ...Array.from({ length: target.count }, (_, i) => i)];
	for (const i of order) {
		target.select(i);
		const v = await viewerOf(target, i);
		if (!v) continue;
		models.set(v, target.modelFor(i) ?? '?');
		// The move there, as it plays, round about and tilted, until nothing
		// on stage has moved for a while: parts only seen mid-move (layers
		// lifting apart) count too.
		const start = performance.now();
		let key = v.stageKey();
		let still = performance.now();
		while (performance.now() - start < 30000) {
			await look(v, { turns: 8, tilts: [-0.4, 0, 0.4], scale: Math.min(scale, 1.5) });
			const now = v.stageKey();
			if (Math.abs(now - key) > 1e-6) {
				key = now;
				still = performance.now();
			} else if (performance.now() - still > 2000 && performance.now() - start > 6000) break;
		}
		await settle(v, { min: 500 });
		await look(v, { scale });
		log(`[hidden] ${i + 1} sampled, ${Math.round((performance.now() - start) / 1000)} s`);
	}
	const report: Record<string, Record<string, { triangles: number; unseen: number }>> = {};
	for (const [v, meshes] of counts) {
		const model = models.get(v) ?? '?';
		const byGroup = (report[model] ??= {});
		const groupOf = new Map<THREE.Object3D, string>();
		for (const name of v.groupNames) v.groupNode(name)?.traverse((o) => groupOf.set(o, name));
		for (const [mesh, count] of meshes) {
			const bits = seen.get(v)!.get(mesh);
			let shown = 0;
			if (bits) for (let k = 0; k < bits.length; k++) shown += bits[k];
			const g = (byGroup[groupOf.get(mesh) ?? '?'] ??= { triangles: 0, unseen: 0 });
			g.triangles += count;
			g.unseen += count - shown;
		}
	}
	for (const [model, groups] of Object.entries(report)) {
		const all = Object.values(groups).reduce((a, g) => ({ t: a.t + g.triangles, u: a.u + g.unseen }), { t: 0, u: 0 });
		log(`[hidden] ${model}: ${all.u} of ${all.t} triangles never seen (${Math.round((all.u / all.t) * 100)}%)`);
		for (const [g, c] of Object.entries(groups))
			log(`[hidden]   ${g}: ${c.unseen} of ${c.triangles} (${Math.round((c.unseen / c.triangles) * 100)}%)`);
	}
	await save('hidden', 'report.json', JSON.stringify(report, null, 2) + '\n');
	// `keep`: the seen triangles themselves, for the bake to keep (bake-surface
	// --prune): per model and file, each as its primitive and its three
	// vertices in the file (`_pid`, `_vid`, stamped by bake-surface --tag).
	if (keep)
		for (const [v, meshes] of seen) {
			const byFile = new Map<string, number[]>();
			for (const [mesh, bits] of meshes) {
				const g = mesh.geometry;
				const pid = g.getAttribute('_pid');
				const vid = g.getAttribute('_vid');
				// The full level's triangles, which the bits number (not a coarser one swapped in since).
				const index = (g.userData.full as THREE.BufferAttribute | undefined) ?? g.index;
				if (!pid || !vid || !index) throw new Error('no _pid/_vid: tag the files first (bake-surface --tag)');
				const out = byFile.get(files.get(mesh)!) ?? [];
				byFile.set(files.get(mesh)!, out);
				for (let t = 0; t < bits.length; t++) {
					if (!bits[t]) continue;
					const a = index.getX(t * 3);
					out.push(
						Math.round(pid.getX(a)),
						Math.round(vid.getX(a)),
						Math.round(vid.getX(index.getX(t * 3 + 1))),
						Math.round(vid.getX(index.getX(t * 3 + 2)))
					);
				}
			}
			for (const [file, list] of byFile)
				await save('hidden-seen', `${models.get(v)}__${file}.bin`, new Blob([Uint32Array.from(list)]));
		}
	return report;
}
