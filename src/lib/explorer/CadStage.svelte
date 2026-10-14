<!--
	@component
	One CAD model on the R1 stage (ModelViewer, through Scene). The model
	turns the shortest way round to show the open feature's point, unmarked.

	A `look` opens the model up: groups hide, turn see-through, cut open in a
	wedge facing the camera, come apart or glow. Fills whatever holds it; the
	parent fades stages in and out.
-->
<script lang="ts" module>
	/** What a feature shows of its model, by group (the CAD's f1_cradle, f2_drives, …). */
	export type Look = {
		/** Put away entirely. */
		hide?: string[];
		/** Partly see-through, by opacity (0 to 1): a core showing the pipes inside it. */
		opacity?: Record<string, number>;
		/** Cut open in a wedge facing the camera. */
		cut?: string[];
		/** How far some of those cuts go, 0 to 1 (1, the default: a wedge fully open, a section to its axis). */
		cutDepth?: Record<string, number>;
		/** Taken apart; a group not split by `sectors`, `layers` or `columns` moves as one. */
		explode?: Record<
			string,
			{
				/** Metres each piece moves out from the axis along its own spoke (with `layers`: apart per layer). */
				out?: number;
				/** Metres the group lifts. */
				up?: number;
				/** Pieces round the axis (12: a drum each). */
				sectors?: number;
				/** Degrees about the axis (model frame, x towards z) the first sector centres on; default: the group's own pattern. */
				phase?: number;
				/** Splits the group into its layers by height. */
				layers?: boolean;
				/** Splits the group one piece per upright run (a pipe each). */
				columns?: boolean;
				/** Seconds in it starts, so outer layers come away first; putting back runs in reverse. */
				at?: number;
				/** Fades out as it goes, back in as it returns. */
				fade?: boolean;
				/** Runs the move the other way in: fades in here, then moves into place (pipes sliding into a core). */
				from?: { out?: number; up?: number };
				/** With `from`: seconds between rings of pieces arriving, from the axis out. */
				stagger?: number;
			}
		>;
		/**
		 * Stages a reveal: seconds in when fades start (`fade`) and cuts open
		 * (`cut`), and how long fades take (`fadeFor`, longer under a big camera
		 * move). By default fades start at once and take AWAY; cuts just after.
		 */
		stages?: { fade?: number; cut?: number; fadeFor?: number };
		/** A group taken apart whose seam nearest the open point faces the camera, so the view looks between its pieces. */
		seam?: string;
		/** Energy running along the model's pipes (its `trails`), setting off `at` seconds in. */
		trails?: { at?: number };
		/**
		 * Groups lit from within as energy reaches them, `at` seconds in: each up
		 * to its emissive strength (`groups`), then settling lower. A `sweep`
		 * brings the glow in from one height to another (authored frame, metres)
		 * behind a brighter band.
		 */
		warm?: { at?: number; groups: Record<string, number>; sweep?: { from: number; to: number } };
	};
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import type { Vector3 } from 'three';
	import Scene from '$lib/explorer/Scene.svelte';
	import type { ColourSlots, ModelViewer, RenderParams } from '$lib/three/viewer/ModelViewer';
	import type { EnergyTrails, TrailSet } from '$lib/three/EnergyTrails';
	import type { Shot } from '$lib/three/viewer/shot';
	import { gsap } from '$lib/motion/scroll';
	import { DEFAULT_TRAIL_LOOK } from '$lib/energy/energy';

	let {
		src,
		aim,
		points,
		look = {},
		explode = {},
		carve = undefined,
		colours = undefined,
		pixelRatio = undefined,
		deferred = undefined,
		renderLook = undefined,
		sections = undefined,
		trails = undefined,
		paused = false,
		hidden = false,
		hold = false,
		onready,
		ontrails
	}: {
		/** The model's files (ModelViewer's `url`). */
		src: string[];
		/**
		 * The shot, the open point to turn to (if one of `points`), and seconds
		 * before the stage is seen (`lead`: the hand-off from another model; look
		 * timings start then). One object so the three arrive together: a new
		 * point read with the last shot would replay that shot's entrance.
		 */
		aim: { shot: Shot; point: number | null; lead: number };
		/** Numbered points on the model, in its authored frame (Y-up metres, as on /cad). */
		points: { number: number; at: [number, number, number] }[];
		look?: Look;
		/** Parts carved into groups of their own (ModelViewer's `carve`). */
		carve?: Record<
			string,
			{ from: string; min: [number, number, number]; max: [number, number, number]; maxSize?: number }
		>;
		/** Parts given a colour of their own (ModelViewer's `colours`). */
		colours?: ColourSlots;
		/** The frame's pixel ratio at most (Scene's `pixelRatio`). */
		pixelRatio?: number;
		/** Groups fetched once it's shown (Scene's `deferred`). */
		deferred?: string[];
		/** Render values for this model, in place of the shared LOOK (Scene's `look`). */
		renderLook?: Partial<RenderParams>;
		/** Groups cut in half-section (ModelViewer's `sections`). */
		sections?: Record<string, { at: [number, number, number]; along: [number, number, number]; radius: number }>;
		/** Pipes the energy runs along, and how it looks there, where a look turns it on (`Look`'s `trails`). */
		trails?: TrailSet;
		/** The groups any look takes apart, split into pieces at load (ModelViewer's `explode`). */
		explode?: Record<string, { fold?: number; phase?: number; layers?: boolean; columns?: boolean }>;
		/** Holds the model still: no slow turn. */
		paused?: boolean;
		/** Off stage: the model stops drawing. */
		hidden?: boolean;
		/** Not wanted yet: nothing is fetched until it turns false (Scene's `hold`). */
		hold?: boolean;
		onready?: (viewer: ModelViewer) => void;
		/** The energy along the pipes, once made: for the tuning panel. */
		ontrails?: (trails: EnergyTrails) => void;
	} = $props();

	/** The model's groups: its files, by name (…/f1_cradle.glb is f1_cradle). */
	const groups = untrack(() => [
		...src.map((url) => url.replace(/^.*\//, '').replace(/\.glb$/, '')),
		...Object.keys(carve ?? {})
	]);

	/** Each group's opacity, cutaway and taking apart, as tweened. */
	const shownAs = Object.fromEntries(groups.map((g) => [g, { level: 1, cut: 0, out: 0, up: 0 }]));

	/**
	 * How long a group takes to fade away, seconds, and how: quick, so the
	 * eye goes to what stays, but eased in and out so the fade is seen.
	 */
	const AWAY = 0.6;
	const AWAY_EASE = 'sine.inOut';

	/** When each group taken apart started (`explode`'s `at`), to put it back in the reverse order. */
	const takenAt: Record<string, number> = {};
	/** Each group's pieces' own lifts, while a staggered arrival is under way or done. */
	const lifts: Record<string, { v: number }[]> = {};
	/** Groups taken apart fading (`explode`'s `fade`): they fade back in as they return. */
	const faded = new Set<string>();

	/**
	 * Into the look. Showing and cutting: the groups going away and closing
	 * go first, the ones coming back and opening after, so nothing crosses
	 * through another. Taking apart: each group at its own `at`, outer
	 * layers first; putting back, the last out goes back first.
	 */
	$effect(() => {
		const { hide = [], cut = [], cutDepth = {}, opacity = {}, explode: apart = {}, stages = {} } = look;
		const v = viewer;
		if (!v) return;
		untrack(() => {
			// Everything waits for the stage to be seen.
			const wait = aim.lead;
			const last = Math.max(0, ...Object.values(takenAt));
			for (const g of groups) {
				const spec = apart[g];
				const level = hide.includes(g) || spec?.fade ? 0 : (opacity[g] ?? 1);
				const open = cut.includes(g) ? (cutDepth[g] ?? 1) : 0;
				const s = shownAs[g];
				const update = () => v.setGroup(g, s);
				// When the group fades with its move, the move tweens the level.
				const arrives = !!spec?.from;
				const fades = spec?.fade || (!spec && faded.has(g)) || arrives;
				// Going away is quick, so the eye goes to what stays; coming back is gentle.
				if (!fades) {
					const fading = level < s.level;
					gsap.to(s, {
						level,
						duration: fading ? (stages.fadeFor ?? AWAY) : 0.9,
						delay: wait + (fading ? (stages.fade ?? 0) : 0.25),
						ease: fading ? AWAY_EASE : 'power2.inOut',
						overwrite: 'auto',
						onUpdate: update
					});
				}
				const closing = open < s.cut;
				// Going away altogether while cut open: it stays open as it fades,
				// so its cover isn't seen to grow back, and shuts unseen once gone.
				const vanishing = level === 0 && s.level > 0;
				gsap.to(s, {
					cut: open,
					duration: closing ? (vanishing ? 0 : AWAY) : 1.1,
					delay:
						wait + (closing ? (vanishing ? (stages.fadeFor ?? AWAY) + (stages.fade ?? 0) : 0) : (stages.cut ?? 0.25)),
					ease: closing ? AWAY_EASE : 'power2.inOut',
					overwrite: 'auto',
					onUpdate: update
				});

				const out = spec?.out ?? 0;
				const up = spec?.up ?? 0;
				// Pieces lifted on their own (a staggered arrival cut short) come
				// to rest, unless they're arriving again: easing home if they're
				// still seen, at once if they're going away.
				const own = lifts[g];
				if (own && !(arrives && spec!.stagger)) {
					gsap.killTweensOf(own);
					own.forEach((l, k) => {
						if (level === 0 || l.v === 0) {
							l.v = 0;
							v.liftPiece(g, k, 0);
						} else gsap.to(l, { v: 0, duration: AWAY, ease: AWAY_EASE, onUpdate: () => v.liftPiece(g, k, l.v) });
					});
					delete lifts[g];
				}
				if (arrives && spec!.stagger) {
					// Fades in where `from` puts it, each piece then sliding into
					// place in turn, from the axis out, slowing as it seats.
					const at = wait + (spec!.at ?? 0);
					const from = spec!.from!.up ?? 0;
					delete takenAt[g];
					faded.delete(g);
					gsap.killTweensOf(s, 'out,up,level');
					Object.assign(s, { out, up, level: 0 });
					update();
					const pieces = v.piecesOf(g);
					// In rings: the pieces about as far out as each other go
					// together (within 8 cm, so a hexagonal ring's corners and
					// sides are one), the innermost ring first.
					const rings: number[] = [];
					for (const p of [...pieces].sort((a, b) => a.away - b.away))
						if (!rings.length || p.away - rings[rings.length - 1] > 0.08) rings.push(p.away);
					const ringOf = (away: number) => rings.findLastIndex((r) => away >= r - 0.001);
					const set = (lifts[g] = pieces.map(() => ({ v: from })));
					pieces.forEach((p) => v.liftPiece(g, p.index, from));
					gsap.to(s, { level, duration: 0.5, delay: Math.max(0, at - 0.5), ease: 'power1.out', onUpdate: update });
					for (const p of pieces)
						gsap.to(set[p.index], {
							v: 0,
							duration: 1.4,
							delay: at + ringOf(p.away) * spec!.stagger!,
							ease: 'power3.out',
							onUpdate: () => v.liftPiece(g, p.index, set[p.index].v)
						});
					continue;
				}
				if (arrives) {
					// Fades in where `from` puts it, then moves into place at `at`.
					const at = wait + (spec!.at ?? 0);
					// It ends in place: nothing to put back.
					delete takenAt[g];
					faded.delete(g);
					gsap.killTweensOf(s, 'out,up,level');
					Object.assign(s, { out: spec!.from!.out ?? out, up: spec!.from!.up ?? up, level: 0 });
					update();
					gsap.to(s, { level, duration: 0.5, delay: Math.max(0, at - 0.5), ease: 'power1.out', onUpdate: update });
					// A long, even slide, so the whole way in is seen.
					gsap.to(s, { out, up, duration: 2, delay: at, ease: 'power2.inOut', onUpdate: update });
					continue;
				}
				if (out === s.out && up === s.up && !(fades && level !== s.level)) continue;
				// Going away altogether while taken apart: it holds where it is
				// as it fades, so nothing but what stays is seen to move, and is
				// put back together unseen once gone.
				if (level === 0 && !fades) {
					delete takenAt[g];
					faded.delete(g);
					gsap.to(s, { out, up, duration: 0, delay: s.level > 0 ? AWAY : 0, overwrite: 'auto', onUpdate: update });
					continue;
				}
				const delay = wait + (spec ? (spec.at ?? 0) : last - (takenAt[g] ?? 0));
				if (spec) takenAt[g] = spec.at ?? 0;
				else delete takenAt[g];
				if (spec?.fade) faded.add(g);
				else faded.delete(g);
				// Fading out as it goes: gone early in its move, quick as anything going
				// away. Fading back in as it returns: across the whole move.
				const fadingOut = fades && level < s.level;
				gsap.to(s, {
					out,
					up,
					...(fades && !fadingOut ? { level } : {}),
					duration: 1,
					delay,
					ease: 'power3.inOut',
					overwrite: 'auto',
					onUpdate: update
				});
				if (fadingOut)
					gsap.to(s, { level, duration: AWAY, delay, ease: AWAY_EASE, overwrite: 'auto', onUpdate: update });
			}
		});
	});

	let viewer: ModelViewer | null = $state(null);
	/** The points in `root`'s space, once the model is in. */
	let anchors: Vector3[] = $state.raw([]);

	/**
	 * The shot, with the model turned the shortest way round so the open
	 * point faces the camera, from wherever the slow turn has taken it.
	 */
	let framed = $state(untrack(() => aim.shot));
	$effect(() => {
		const { shot: next, point: number, lead } = aim;
		const v = viewer;
		// Re-runs once the points are in.
		const placed = anchors;
		untrack(() => {
			// The turn as it will settle, without the visitor's drag (which springs
			// back). Read from the rotation, not the last frame's pose, so two runs
			// before a frame is drawn agree.
			const turned = v ? v.scrollRotation.y + v.autoTurn : 0;
			// Coming in from the other model with no entrance of its own: cut
			// to the shot while the stage is still hidden, so it's revealed
			// already in place rather than part way through a move.
			const unseen = lead > 0 && !(next.turn !== undefined && (next.swing || next.swingLean || next.swingFrom));
			// A fixed turn: the model turned the shortest way round to it.
			if (v && next.turn !== undefined) {
				const by = next.turn - turned;
				const spin = v.scrollRotation.y + Math.atan2(Math.sin(by), Math.cos(by));
				// Arriving from another model: swung round out of sight, then turned
				// into place with the camera as it's revealed.
				if (lead > 0 && (next.swing || next.swingLean || next.swingFrom)) {
					gsap.killTweensOf([v.scrollRotation, v.camera.position, v.target]);
					v.scrollRotation.y = spin - (next.swing ?? 0);
					v.scrollRotation.z = (next.lean ?? 0) + (next.swingLean ?? 0);
					if (next.swingFrom) {
						const r = v.radius;
						const [x, y, z] = next.swingFrom.pos;
						const [tx, ty, tz] = next.swingFrom.target ?? next.target;
						v.camera.position.set(x * r, y * r, z * r);
						v.target.set(tx * r, ty * r, tz * r);
					}
					framed = { ...next, spin, after: lead };
					return;
				}
				framed = { ...next, spin, snap: unseen };
				// Aimed at the open point as well: where the turn leaves it.
				const k = points.findIndex((p) => p.number === number);
				const at = placed[k];
				if (next.aim === 'point' && at) {
					const r = v.radius;
					const [c, s] = [Math.cos(next.turn), Math.sin(next.turn)];
					const p = [(at.x * c + at.z * s) / r, at.y / r, (-at.x * s + at.z * c) / r];
					framed.pos = [p[0] + next.pos[0], p[1] + next.pos[1], p[2] + next.pos[2]];
					framed.target = [p[0] + next.target[0], p[1] + next.target[1], p[2] + next.target[2]];
				}
				return;
			}
			const k = points.findIndex((p) => p.number === number);
			const at = placed[k];
			if (!v || !at) {
				framed = { ...next, snap: unseen };
				return;
			}
			const camera = Math.atan2(next.pos[0], next.pos[2]);
			// Facing the camera: the open point, or the seam of a group taken apart nearest it.
			const seam = look.seam ? v.seamNear(look.seam, Math.atan2(at.z, at.x)) : null;
			const facing = seam === null ? Math.atan2(at.x, at.z) : Math.atan2(Math.cos(seam), Math.sin(seam));
			const part = facing + turned;
			const turn = Math.atan2(Math.sin(camera - part), Math.cos(camera - part));
			// The shot's own spin turns the model on from there.
			framed = { ...next, spin: v.scrollRotation.y + turn + next.spin, snap: unseen };
			if (next.aim === 'point') {
				// Turned to face the camera, the point lies on the camera's side
				// of the axis, as far out as it is from it, at its own height.
				const r = v.radius;
				const out = Math.hypot(at.x, at.z) / r;
				const p = [Math.sin(camera) * out, at.y / r, Math.cos(camera) * out];
				framed.pos = [p[0] + next.pos[0], p[1] + next.pos[1], p[2] + next.pos[2]];
				framed.target = [p[0] + next.target[0], p[1] + next.target[1], p[2] + next.target[2]];
			}
		});
	});

	/** The points into the model's frame, once it's in. */
	$effect(() => {
		const v = viewer;
		if (!v) return;
		let gone = false;
		import('three').then((three) => {
			if (!gone) anchors = points.map((p) => v.toRoot(new three.Vector3(...p.at)));
		});
		return () => {
			gone = true;
		};
	});

	/** The energy along the pipes, once the model is in; shown as the look says. */
	let energy: EnergyTrails | null = $state.raw(null);
	const glow = { level: 0 };
	$effect(() => {
		const v = viewer;
		if (!v || !trails?.routes.length) return;
		let gone = false;
		let made: EnergyTrails | null = null;
		import('$lib/three/EnergyTrails').then(({ EnergyTrails }) => {
			if (gone) return;
			made = new EnergyTrails(trails, v);
			v.addOverlay(made, () => made!.animated);
			energy = made;
			ontrails?.(made);
		});
		return () => {
			gone = true;
			made?.dispose();
		};
	});
	$effect(() => {
		// Off with the stage, so a model out of sight isn't drawing it.
		const on = hidden ? undefined : look.trails;
		const e = energy;
		if (!e) return;
		untrack(() => {
			// Setting off once the stage is seen and the look has opened up;
			// gone as quickly as anything going away.
			gsap.to(glow, {
				level: on ? 1 : 0,
				duration: on ? 0.8 : AWAY,
				delay: on ? aim.lead + (on.at ?? 0) : 0,
				ease: on ? 'power1.out' : AWAY_EASE,
				overwrite: true,
				onUpdate: () => e.setLevel(glow.level)
			});
		});
	});

	/** How warm each group glows (`Look`'s `warm`), as tweened. */
	const warmth = Object.fromEntries(groups.map((g) => [g, { v: 0, front: -1e4, crest: 0, up: false }]));
	$effect(() => {
		const warm = hidden ? undefined : look.warm;
		const e = energy;
		const v = viewer;
		if (!v) return;
		untrack(() => {
			const at = aim.lead + (warm?.at ?? 0);
			for (const g of groups) {
				const w = warmth[g];
				const peak = warm?.groups[g] ?? 0;
				const update = () =>
					v.setGlow(g, w.v, e?.initialLook.body ?? DEFAULT_TRAIL_LOOK.body, {
						front: w.front,
						crest: w.crest,
						up: w.up
					});
				gsap.killTweensOf(w);
				const sweep = warm?.sweep;
				if (peak > 0 && sweep) {
					// From one end to the other, a bright band leading, filling as
					// it goes; then the band fades and the whole settles to a
					// steady glow, the front put out of reach so all of it shows.
					const up = sweep.to > sweep.from;
					const tl = gsap.timeline({ delay: at, onUpdate: update });
					tl.set(w, { front: sweep.from, crest: 0, up }, 0)
						.to(w, { v: peak, crest: 1, duration: 0.4, ease: 'power2.out' }, 0)
						.to(w, { front: sweep.to, duration: 1.6, ease: 'sine.inOut' }, 0)
						.to(w, { crest: 0, duration: 0.5, ease: 'sine.out' }, 1.3)
						.to(w, { v: peak * 0.25, duration: 1.6, ease: 'sine.inOut' }, 1.4)
						.set(w, { front: up ? 1e4 : -1e4 });
				} else if (peak > 0)
					// Up, then settling to a steady glow.
					gsap
						.timeline({ delay: at, onUpdate: update })
						.to(w, { v: peak, duration: 0.6, ease: 'power2.out' })
						.to(w, { v: peak * 0.25, duration: 1.8, ease: 'sine.inOut' });
				// Out as quickly as anything going away.
				else if (w.v > 0) gsap.to(w, { v: 0, crest: 0, duration: AWAY, ease: AWAY_EASE, onUpdate: update });
			}
		});
	});
</script>

<div class="stage">
	<Scene
		{src}
		{groups}
		{explode}
		{carve}
		{colours}
		{pixelRatio}
		{deferred}
		look={renderLook}
		{sections}
		shot={framed}
		paused={paused || hidden}
		later={hidden}
		asleep={hidden}
		poster={false}
		{hold}
		onready={(v) => {
			viewer = v;
			onready?.(v);
		}}
	/>
</div>

<style>
	.stage {
		position: absolute;
		inset: 0;
	}
</style>
