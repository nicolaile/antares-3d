<!--
	@component
	One CAD model on the R1 stage (ModelViewer, through Scene). The model
	turns the shortest way round to show the open feature's point on it
	(unmarked: the shot frames it).

	A `look` opens the model up, as the product videos do, in the landing's
	own finish: parts go entirely, and covers cut open in a wedge facing the
	camera. Fills whatever holds it; the parent fades stages in and out.
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
		/**
		 * Taken apart, as in the product video: each group's pieces `out`
		 * from the axis along their own spokes, and the group `up`, in metres.
		 * `sectors` splits the group into that many pieces round the axis
		 * (12: a drum each), the first centred on `phase` (degrees about the
		 * axis, in the model's frame from x towards z; without it, read from
		 * the group's own pattern); or with `layers`, into its layers by height,
		 * `out` apart each; without either the group moves as one. `at` is when it
		 * starts, seconds in, so the outer layers can come away first; put
		 * back together, the order runs the other way. `fade` fades the group
		 * out as it goes (and back in as it returns). `from` runs it the other
		 * way in: the group fades in where `from` puts it, then moves into
		 * place, as pipes sliding down into a core. With `columns` it's split
		 * one piece per upright run (a pipe each), and `stagger` sends those
		 * in ring by ring, from the axis out, that many seconds apart: the
		 * pieces as far out as each other together.
		 */
		explode?: Record<
			string,
			{
				out?: number;
				up?: number;
				sectors?: number;
				phase?: number;
				layers?: boolean;
				columns?: boolean;
				at?: number;
				fade?: boolean;
				from?: { out?: number; up?: number };
				stagger?: number;
			}
		>;
		/**
		 * When, seconds in, the parts going see-through or away start fading
		 * (`fade`), and the cuts start opening (`cut`), to stage a reveal one
		 * step at a time, and how long the fades take (`fadeFor`): longer to
		 * go with a big camera move. By default the fades start at once and
		 * take AWAY, and the cuts start just after.
		 */
		stages?: { fade?: number; cut?: number; fadeFor?: number };
		/**
		 * A group taken apart whose open seam turns to face the camera, the
		 * one nearest the open point, so the view looks in between its pieces
		 * rather than at one of them.
		 */
		seam?: string;
		/** Energy running along the model's pipes (its `trails`), setting off `at` seconds in. */
		trails?: { at?: number };
		/**
		 * Groups lit from within, as energy reaches them, `at` seconds in: each
		 * up to its own glow (`groups`, the emissive's strength), then settling
		 * to a soft part of that. With a `sweep`, the glow comes in from one
		 * height to another (the authored frame's, metres), a brighter band
		 * leading it, once: down when `to` is below `from` (04's core), up
		 * when it's above (05's exchanger).
		 */
		warm?: { at?: number; groups: Record<string, number>; sweep?: { from: number; to: number } };
	};
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import type { Vector3 } from 'three';
	import Scene from '$lib/components/Scene.svelte';
	import type { ModelViewer } from '$lib/three/ModelViewer';
	import type { EnergyTrails, TrailSet } from '$lib/three/EnergyTrails';
	import type { Shot } from '$lib/three/shot';
	import { gsap } from '$lib/scroll';
	import { DEFAULT_TRAIL_LOOK } from '$lib/energy/energy';

	let {
		src,
		aim,
		points,
		look = {},
		explode = {},
		carve = undefined,
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
		 * Where the camera goes (`shot`), turned to show the open point
		 * (`point`, if it's one of `points`), and how long before the stage
		 * itself is seen (`lead`, seconds: the hand-off from another model;
		 * the look's timings start from then too). One value, so the three
		 * always arrive together: a new point read with the last shot would
		 * replay that shot's entrance.
		 */
		aim: { shot: Shot; point: number | null; lead: number };
		/** Numbered points on the model, in its authored frame (Y-up metres, as on /cad). */
		points: { number: number; at: [number, number, number] }[];
		/** What shows of the model (see `Look`). */
		look?: Look;
		/** Parts carved into groups of their own (ModelViewer's `carve`). */
		carve?: Record<string, { from: string; min: [number, number, number]; max: [number, number, number]; maxSize?: number }>;
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
				// Fading with its move, going or coming back, or arriving from
				// elsewhere: the move carries the level.
				const arrives = !!spec?.from;
				const fades = spec?.fade || (!spec && faded.has(g)) || arrives;
				// Going away is quick, so the eye goes to what stays; coming back
				// is gentle. Each at its stage (`stages`), if the look sets one.
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
					delay: wait + (closing ? (vanishing ? (stages.fadeFor ?? AWAY) + (stages.fade ?? 0) : 0) : (stages.cut ?? 0.25)),
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
				if (fadingOut) gsap.to(s, { level, duration: AWAY, delay, ease: AWAY_EASE, overwrite: 'auto', onUpdate: update });
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
		// Again once the points are in, if they weren't yet.
		const placed = anchors;
		untrack(() => {
			// The model's turn as it will settle: without the visitor's drag,
			// which springs back to nothing once let go. From the rotation
			// itself, not the last frame's pose, so working it out twice
			// before a frame is drawn gives the same answer.
			const turned = v ? v.scrollRotation.y + v.autoTurn : 0;
			// Coming in from the other model with no entrance of its own: cut
			// to the shot while the stage is still hidden, so it's revealed
			// already in place rather than part way through a move.
			const unseen = lead > 0 && !(next.turn !== undefined && (next.swing || next.swingLean || next.swingFrom));
			// A fixed turn: the model turned the shortest way round to it.
			if (v && next.turn !== undefined) {
				const by = next.turn - turned;
				const spin = v.scrollRotation.y + Math.atan2(Math.sin(by), Math.cos(by));
				// Arriving from another model: swung round out of sight first,
				// then turned into place, the camera with it, as it's revealed.
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
				// In the trails' body colour.
				const update = () =>
					v.setGlow(g, w.v, e?.initialLook.body ?? DEFAULT_TRAIL_LOOK.body, { front: w.front, crest: w.crest, up: w.up });
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
		{sections}
		shot={framed}
		paused={paused || hidden}
		later={hidden}
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
