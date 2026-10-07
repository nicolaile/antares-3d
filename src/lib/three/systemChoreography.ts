import { gsap } from '$lib/scroll';
import { DEFAULT_STATE, type SystemState } from './SystemScene';

/**
 * The seven points, following the product video beat for beat, in the
 * order of $lib/content/systems.ts. `enter` plays as the point is chosen
 * (the camera move and what shows); `during` plays once it's there, as one
 * move or several in sequence, over `hold` seconds (HOLD by default).
 *
 * Points 1–4 are Mark-0 alone, whole; point 5 docks the power conversion
 * system onto it (`dock`) and the heat carries on into the exchanger.
 *
 * World metres. The column stands on the origin: cradle to 0.95 m, the
 * reactor up to its deck at 2.7 m, the exchanger's dome to 4.5 m, the
 * shield closing over both at 5.3 m. The skid runs back from it to
 * z ≈ −5, the turbo-alternator on its front edge (x 1.4–3.4, z −1.75).
 * Before the dock, Mark-0 alone: its deck at 2.67 m, the drive motors on it
 * to 3.34 m, the heat pipes' heads to 2.78 m.
 */
type Step = Partial<SystemState>;
type Beat = { enter: Step; during?: Step | Step[]; hold?: number };

export const BEATS: Beat[] = [
	// 1. Shielding & cradle (video 0:11–0:20): in close on the top of the
	// shield, the drive motors on its deck, then down the vessel to the
	// cradle at its foot.
	{
		enter: { camX: 2.7, camY: 3.1, camZ: 3.5, tgtX: 0, tgtY: 2.7, tgtZ: 0, fov: 34, dof: 0.6 },
		during: { camX: 4.4, camY: 1.5, camZ: 4.6, tgtY: 0.6 }
	},
	// 2. Reactivity controls (0:20–0:30): the column opens in a cutaway
	// facing the camera, the drive motors on the deck first, then down to
	// the drums, which turn.
	{
		enter: {
			camX: 3.4,
			camY: 4.0,
			camZ: 4.4,
			tgtY: 2.6,
			cut: 1,
			dof: 0.5,
			// The close-ups (2–6) under the low-key look, when it's on: the column alone.
			lowkey: 1,
			soloColumn: 1
		},
		during: [{ camX: 3.0, camY: 3.4, camZ: 3.9, tgtY: 1.6 }, { drumTurn: Math.PI }]
	},
	// 3. Core (0:30–0:40): everything else goes; the core alone, its
	// layers lifting apart and landing.
	{
		enter: {
			// From above, onto the fuel rings in the top layer, as the video looks.
			camX: 3.0,
			camY: 3.9,
			camZ: 3.6,
			tgtY: 1.3,
			drums: 0,
			drumsGhost: 0,
			shield: 0,
			shieldGhost: 0,
			refl: 0,
			reflGhost: 0,
			cut: 0,
			pipes: 0,
			pipesGhost: 0,
			phxShell: 0,
			phxInner: 0,
			phxGhost: 0,
			stack: 0,
			fuel: 0.5,
			dof: 0.4,
			// The core alone on an empty stage, as in the video.
			world: 0
		},
		during: { stack: 1 }
	},
	// 4. Heat pipes (0:40–0:47): the core glows; the heat pipes rise out of
	// it to their heads on the deck, and the heat climbs them.
	{
		enter: {
			camX: 4.6,
			camY: 2.6,
			camZ: 5.8,
			tgtY: 1.9,
			fov: 34,
			coreHeat: 1,
			fuel: 0.8,
			pipes: 1,
			phxShell: 0,
			phxInner: 1,
			heat: 1,
			heatY: 1.2
		},
		during: [
			{ heatY: 2.2, camY: 3.0, tgtY: 2.1 },
			{ heatY: 2.85, camY: 3.6, tgtY: 2.5 }
		]
	},
	// 5. Primary heat exchanger (0:47–0:54): the power conversion system
	// docks, the exchanger lowering onto the reactor's deck and the skid
	// arriving behind; the heat climbs on into the exchanger to the dome,
	// then runs into the outlet pipe on top and down it.
	{
		// Back far enough to see the exchanger come down. Mark-0 closes up
		// again (its shield, reflector and drums, the drives on its deck) so
		// the exchanger lands on the whole reactor; the skid comes back for
		// the gas to run into: the column no longer alone.
		enter: {
			camX: 5.2,
			camY: 4.6,
			camZ: 6.6,
			tgtX: 0.3,
			tgtY: 3.1,
			tgtZ: -0.7,
			fov: 34,
			world: 1,
			dof: 0.4,
			soloColumn: 0,
			shield: 1,
			refl: 1,
			drums: 1,
			phxShell: 1
		},
		during: [
			{ dock: 1 },
			// Its shell parts to show the fin and tube bundle as the heat climbs into it.
			{ heatY: 4.5, phxShell: 0, camX: 2.5, camY: 5.2, camZ: 2.8, tgtX: 0, tgtY: 4.2, tgtZ: 0 },
			{ gas: 1, gasFront: 0.32 },
			{ gasFront: 0.62, camX: 3.4, camY: 4.2, camZ: 1.6, tgtX: 0.56, tgtY: 3.2, tgtZ: -1.27 }
		],
		hold: 7.2
	},
	// 6. Brayton cycle (0:54–1:00): the gas arrives at the turbo-alternator;
	// its casing opens in half-section and the shaft lights up along its length.
	{
		enter: {
			// Far enough back that the machine sits in the skid, not filling the frame.
			camX: 3.7,
			camY: 2.6,
			camZ: 2.9,
			tgtX: 2.6,
			tgtY: 1.1,
			tgtZ: -1.75,
			fov: 32,
			gasFront: 1,
			shield: 1,
			// The shield's upper half closes over the exchanger.
			cap: 1,
			refl: 1,
			phxShell: 1,
			turboCut: 1,
			turboHeat: 1,
			dof: 0.5,
			// Under the low-key look: the machine alone, in its own shot.
			soloTurbo: 1
		},
		// The gas has arrived: its pulse fades as the shaft takes the heat.
		// Under the low-key look the machine comes apart along its shaft meanwhile.
		during: { turboFront: 1, gas: 0.15, turboExplode: 1 }
	},
	// 7. Power management (1:00–1:10): the video's distribution cabinet isn't
	// in the CAD, so the close is the whole system, as the video ends: back
	// out to the column in its cradle and the skid, the heat settling, the
	// camera arcing slowly round.
	{
		enter: {
			camX: 9.0,
			camY: 6.4,
			camZ: 10.5,
			tgtX: 1.0,
			tgtY: 2.2,
			tgtZ: -1.6,
			fov: 30,
			turboCut: 0,
			lowkey: 0,
			soloTurbo: 0,
			turboExplode: 0,
			gas: 0,
			heat: 0.4,
			turboHeat: 0.3,
			dof: 0
		},
		during: { camX: 12.6, camY: 5.6, camZ: 4.2 }
	}
];

/**
 * Where each label in $lib/content/systems.ts pins to, world metres: on a
 * surface the point's camera sees, so the dot sits on the part it names.
 */
export const ANCHORS: Record<string, [number, number, number]> = {
	shield: [0.78, 2.0, 0.78],
	cradle: [0.93, 0.62, 0.93],
	drum: [0.62, 1.7, 0.62],
	// The outer face of the drive motor facing the point's camera (Mark-0 turned 30°, assembly.ts).
	motors: [0.74, 3.03, 0.85],
	absorber: [0.86, 1.15, 0.2],
	blocks: [0.36, 1.0, 0.42],
	fuel: [0.12, 2.42, 0.2],
	// A heat pipe's head on the deck, on the side facing the camera.
	pipes: [0.12, 2.72, 0.2],
	source: [0.4, 1.3, 0.35],
	dome: [0.45, 4.45, 0.42],
	// On the wheels' blades, on the side the half-section opens to the camera:
	// the compressor's low and the turbine's high, so the labels don't collide.
	compressor: [1.66, 1.04, -1.58],
	turbine: [2.08, 1.36, -1.62],
	alternator: [2.9, 1.51, -1.75]
};

const CAMERA = ['camX', 'camY', 'camZ', 'tgtX', 'tgtY', 'tgtZ'] as const;
export type CameraKey = { pos: [number, number, number]; tgt: [number, number, number] };

/** Seconds: each point's camera move and reveal, then its own animation (the drums turning, the heat climbing). */
const ENTER = 1.8;
const HOLD = 3.2;
/** Where each point starts on the timeline, and the timeline's end; point i ends where i + 1 starts. */
const STARTS = BEATS.reduce<number[]>((at, beat, i) => [...at, at[i] + ENTER + (beat.hold ?? HOLD)], [0]);
const LENGTH = ENTER + HOLD;

/**
 * The points as one paused timeline in real seconds, played to a point
 * when it's chosen (`go`): the next one plays through at its own pace,
 * enter then hold; going back or jumping ahead flies the whole way in
 * 1.6–2.8 s, eased, replaying what lies between fast. Point i ends
 * where i + 1 starts (STARTS); −1 is the opening, at 0.
 *
 * Camera fields aren't tweened directly: every step that moves the camera
 * becomes a keyframe, in order, and the step tweens `cam`, the position
 * along the path through them (see SystemScene.setCameraPath), so the
 * camera arcs between shots however far it travels. Returns those
 * keyframes with `go` and the teardown.
 */
export function buildChoreography(state: SystemState) {
	const timeline = gsap.timeline({ paused: true, defaults: { ease: 'none' } });

	let shot: Record<(typeof CAMERA)[number], number> = { ...DEFAULT_STATE };
	const key = (): CameraKey => ({ pos: [shot.camX, shot.camY, shot.camZ], tgt: [shot.tgtX, shot.tgtY, shot.tgtZ] });
	const keys: CameraKey[] = [key()];
	state.cam = 0;
	/** The step's tween vars, its camera move replaced by the next keyframe. */
	const vars = (step: Step) => {
		const out: Step = { ...step };
		const moves = CAMERA.filter((k) => k in step);
		for (const k of moves) delete out[k];
		if (moves.length) {
			shot = { ...shot, ...Object.fromEntries(moves.map((k) => [k, step[k]])) };
			keys.push(key());
			out.cam = keys.length - 1;
		}
		return out;
	};

	BEATS.forEach((beat, i) => {
		const start = STARTS[i];
		timeline.to(state, { ...vars(beat.enter), duration: ENTER, ease: 'power2.inOut' }, start);
		const steps = [beat.during ?? []].flat();
		const share = (beat.hold ?? HOLD) / Math.max(steps.length, 1);
		steps.forEach((step, k) => {
			timeline.to(state, { ...vars(step), duration: share, ease: 'power1.inOut' }, start + ENTER + share * k);
		});
	});
	timeline.set({}, {}, STARTS[BEATS.length]);

	let tween: gsap.core.Tween | null = null;
	/** Plays to point `index` (−1 the overview); `instant` jumps straight there. */
	function go(index: number, { instant = false } = {}) {
		const to = index < 0 ? 0 : STARTS[index + 1];
		const from = timeline.time();
		tween?.kill();
		tween = null;
		if (instant) {
			timeline.time(to);
			return;
		}
		// The next point plays at its own pace; anything else flies.
		const next = index >= 0 && to > from && from >= STARTS[index] - 1e-3;
		tween = next
			? timeline.tweenTo(to)
			: timeline.tweenTo(to, {
					duration: gsap.utils.clamp(1.6, 2.8, 1.6 + (Math.abs(to - from) / LENGTH) * 0.3),
					ease: 'power3.inOut'
				});
	}

	return {
		keys,
		go,
		kill: () => {
			tween?.kill();
			timeline.kill();
		}
	};
}
