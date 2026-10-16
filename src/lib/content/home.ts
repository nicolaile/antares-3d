/**
 * Homepage content. Sections take everything they show as props, so the
 * same sections can be reused on other pages with different content.
 *
 * Images are `?enhanced` imports, converted to AVIF/WebP at build time at
 * the widths in `w`: from the display width at 1440 (capability photos
 * three columns, 338px; Graphite Machining eight, 928px) up to the source's.
 */
import type { Picture } from 'vite-imagetools';
import type { FeatureCardsContent } from './company';
import specialPurposeReactors from '$lib/assets/images/landing/special-purpose-reactors.jpg?w=2028;1014;676;338&enhanced';
import heatPipes from '$lib/assets/images/landing/heat-pipes.jpg?w=2028;1014;676;338&enhanced';
import controlSystems from '$lib/assets/images/landing/control-systems.jpg?w=2028;1014;676;338&enhanced';
import graphiteMachining from '$lib/assets/images/landing/graphite-machining.jpg?w=1856;928;464&enhanced';
import technician from '$lib/assets/images/company/iterative-02.jpg?w=948;474;237&enhanced';
import heroImage from '$lib/assets/images/company/hero-image.jpg?w=3000;2400;1800;1200;800&enhanced';
// TODO(launch): replace the stand-in hero film with the final cut.
import heroVideo from '$lib/assets/images/landing/hero-placeholder.mp4';
import progressImage from '$lib/assets/images/landing/progress-mark-01.png?w=2000;1000;500&enhanced';

import type { Feature, CadModel, CadModelSetup } from '$lib/explorer/ReactorExplorer.svelte';
import type { Shot } from '$lib/three/viewer/shot';
import { PCS_LOOK } from '$lib/three/viewer/look';

export const hero = {
	// The line break is the design's; the hero keeps it.
	title: 'Abundant energy from Earth\nto the asteroid belt',
	text: 'Fission microreactors to enable strategic energy for critical mission capabilities on Earth, in space, and underwater.',
	image: { src: heroImage, alt: 'A nuclear-powered spacecraft in orbit, lit by the sun above the curve of the Earth' },
	video: heroVideo
};

export const mission = {
	// TODO(launch): replace the placeholder mission statement.
	statement:
		'Dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
	milestones: [
		{ value: '322.000SQ', label: 'Manufacturing Scale' },
		{ value: '30+', label: 'Experts' },
		{ value: '$600M+', label: 'Capital Raised' }
	]
};

/*
 * Shots are in units of the model's bounding radius. A shot straight down
 * lets `lookAt` roll freely, so "top-down" sits 6° off vertical, on a long
 * lens from further back so it reads flat, like a plan view.
 */
/** Mark-0 close, looking well down on its top, sitting low in the panel. */
const vessel: Shot = {
	pos: [0, 0.71, 0.91],
	target: [0, 0.14, 0],
	spin: 0,
	fov: 29
	// (No `enterFrom`: the sweep down from the top view faded parts in oddly
	// on the way; the entrance is the quarter turn alone.)
};
/**
 * The power conversion system whole, pulled back and raised, three-quarters
 * on, so the power path reads left to right: the exchanger, the down pipe,
 * the skid's generator, the cooler.
 */
const system: Shot = { pos: [0, 0.44, 1.23], target: [0, -0.03, 0], spin: 0, turn: -Math.PI / 4, fov: 29 };

/**
 * The CAD on the stage, one model at a time: Mark-0 for the reactor
 * (01–04), the power conversion system from the exchanger on (05–07).
 * Each model is a set of baked group files in static/models/landing/,
 * exported by the local lab pipeline (not in the repo).
 */
const cad = (model: string, groups: string[]) => groups.map((g) => `/models/landing/${model}/${g}.glb`);

const models: Partial<Record<CadModel, CadModelSetup>> = {
	'mark-0': {
		files: cad('mark-0', ['f1_cradle', 'f2_drives', 'f2_reactivity', 'f3_core', 'f4_heatpipes', 'context']),
		// Its light baked (look.ts `bakedLight`), so its frame is cheap enough
		// to draw at a retina screen's own resolution: 2.0 ms on 01 at 2 against
		// the live light's 2.4 at 1.5 (M4 Max, 1440 wide).
		pixelRatio: 2,
		// The core and the control drums (10.6 of its 22.5 MB, gzipped) come
		// once it's shown: from 01's view they're specks through the top
		// (under 0.3% of the frame), and they fade in as they arrive.
		deferred: ['f2_reactivity', 'f3_core'],
		// Colour slots, a group each (ModelViewer's `colours`, live via `setColour`
		// and the controls panel); off unless `amount` is set: the core is tinted
		// grey, the rest keep the material's colour.
		colours: {
			cradle: { group: 'f1_cradle', label: 'Shield & cradle', colour: '#333333' },
			drives: { group: 'f2_drives', label: 'Drive mechanisms', colour: '#ff751f' },
			reactivity: { group: 'f2_reactivity', label: 'Control drums', colour: '#6b6b6b' },
			core: { group: 'f3_core', label: 'Core', colour: '#8a8a8a', amount: 1 },
			heatpipes: { group: 'f4_heatpipes', label: 'Heat pipes', colour: '#6e6e6e' },
			context: { group: 'context', label: 'Context', colour: '#6b6b6b' }
		}
	},
	'power-conversion-system': {
		// `standalone`: the exchanger's stand, which the stacked system leaves out.
		files: cad('power-conversion-system', ['f4_heatpipes', 'f5_phx', 'standalone', 'f6_brayton', 'context']),
		// Its own look, as on the live site (look.ts PCS_LOOK).
		look: PCS_LOOK,
		// Colour slots, a group each, all off. The carved turbo-alternator
		// takes the skid's (`brayton`).
		colours: {
			phx: { group: 'f5_phx', label: 'Heat exchanger', colour: '#4a4a4a' },
			stand: { group: 'standalone', label: 'Exchanger stand', colour: '#4a4a4a' },
			brayton: { group: 'f6_brayton', label: 'Brayton skid', colour: '#4a4a4a' },
			heatpipes: { group: 'f4_heatpipes', label: 'Heat pipes', colour: '#ff751f' },
			context: { group: 'context', label: 'Context', colour: '#4a4a4a' }
		},
		// The vessel at the back of the skid, carved out to cut open: a shaft on its
		// axis (along x at y 1.09 m, z −4.20 m; Ø1.44 m), ~1 m discs, two inlets on
		// top. `f6_turbo_inner` carves its insides (under the casing's 1.07 m) out
		// again, so they stay whole in the cut, as in the video's half-section.
		// TODO(launch): confirm with Antares this vessel is the turbo-alternator, not the recuperator.
		carve: {
			f6_turbo: { from: 'f6_brayton', min: [-0.7, 0.55, -4.75], max: [1.5, 1.65, -3.65] },
			f6_turbo_inner: { from: 'f6_turbo', min: [-0.7, 0.99, -4.3], max: [1.5, 1.19, -4.1], maxSize: 1.05 }
		},
		// The two pipes from the exchanger to the turbo-alternator's vessel,
		// through their centres (traced from the CAD's parts): elbows of
		// about 0.3 m bend.
		trails: {
			routes: [
				// From the top of the dome, over and down the far side, along the
				// skid and round into the vessel's end.
				{
					radius: 0.11,
					bend: 0.3,
					path: [
						[0.45, 4.2, 0],
						[0.463, 4.636, 0],
						[0.55, 4.636, -1.271],
						[0.56, 1.211, -1.271],
						[0.56, 1.15, -3.111],
						[-1.87, 1.0855, -3.111],
						[-1.87, 1.0855, -4.197],
						[-0.87, 1.0855, -4.197]
					]
				},
				// From the nozzle low on the exchanger's side, down through the U
				// and up over the skid into the vessel's top.
				{
					radius: 0.11,
					bend: 0.3,
					path: [
						[0, 2.167, -0.8],
						[0, 2.167, -1.503],
						[0, 0.824, -1.503],
						[0, 0.824, -2.112],
						[0, 2.268, -2.112],
						[0, 2.268, -4.201],
						[0, 1.7, -4.201]
					]
				}
			]
		},
		sections: {
			f6_turbo: { at: [0.4, 1.09, -4.2], along: [1, 0, 0], radius: 0.75 },
			f6_turbo_inner: { at: [0.4, 1.09, -4.2], along: [1, 0, 0], radius: 0.53 }
		}
	}
};

// Copy from antaresindustries.com (the R1 section, 01–07).
const features: Feature[] = [
	{
		title: 'Integrated Shielding',
		text: 'Cradle simplifies deployment with minimal gear. The shielded vessel travels in its own cradle, ready to set down and connect on site.',
		model: 'mark-0',
		shot: vessel
	},
	{
		title: 'Reactivity Controls',
		text: 'Graphite and boron carbide control drums with independent actuator motors, inspired by historical space reactor designs.',
		model: 'mark-0',
		// Close, from about 30° above: the nearest drums and their drives
		// large at the front, the ring curving away round the core; leaning
		// 15° to the right as it comes apart.
		shot: { pos: [0, 1.0, 1.74], target: [0, 0.03, 0], spin: 0, fov: 29, lean: (-15 * Math.PI) / 180 },
		// Taken apart in order, as the video shows it.
		look: {
			explode: {
				// The shield first, opened like a clamshell at the seam facing the
				// camera, fading. Its upper half-shells split at 0° and 180°, the lower
				// at ±90°, so each side takes one of each: sides centred on −45° and 135°.
				f1_cradle: { out: 1.1, sectors: 2, phase: -45, at: 0, fade: true },
				// Then the drums widen out into a ring, the reflector blocks
				// after them a little less far, so each drum stands clear.
				f2_reactivity: { out: 0.7, up: -0.15, sectors: 12, at: 0.3 },
				context: { out: 0.55, up: -0.15, sectors: 12, at: 0.4 },
				// Then the drives, out over their drums and up, and the heat pipes.
				f2_drives: { out: 0.7, up: 0.5, sectors: 12, at: 0.8 },
				f4_heatpipes: { up: 0.4, at: 0.8 }
			},
			seam: 'f1_cradle'
		}
	},
	{
		title: 'Core',
		text: 'TRISO coated particle fuel in a prismatic graphite core. Each particle holds in its own fission products, even at extreme heat.',
		model: 'mark-0',
		// Close, from about 25° above: the top layer's hex face and
		// fuel holes, the gaps between the layers in bands; tilted 30° to the
		// right as it comes apart.
		shot: { pos: [0, 0.61, 1.3], target: [0, -0.03, 0], spin: 0, fov: 29, lean: (-30 * Math.PI) / 180 },
		// The core alone, as in the video, taken apart: everything else
		// fades away, then its ten layers of blocks lift apart.
		look: {
			hide: ['f1_cradle', 'f2_drives', 'f2_reactivity', 'context', 'f4_heatpipes'],
			explode: { f3_core: { out: 0.15, layers: true, at: 0.3 } }
		}
	},
	{
		title: 'Sodium Heat Pipes',
		text: 'Sodium heat pipes enable redundant, high-temperature, entirely passive heat transfer.',
		model: 'mark-0',
		// In close on the core's top (the point is a pipe head), from above
		// at about 35°, so the pipes slide down into frame and into the
		// blocks' holes, the columns running away below.
		shot: { pos: [0, 0.39, 0.5], target: [0, -0.07, 0], spin: 0, fov: 29, aim: 'point' },
		// As the video shows it: all but the core fades, the core turns see-through,
		// the heat pipes slide down into it ring by ring, middle first; once seated, a
		// glow runs down from the deck fittings (2.85 m) to the bottom (0.4 m) and settles.
		look: {
			hide: ['f1_cradle', 'f2_drives', 'f2_reactivity', 'context'],
			opacity: { f3_core: 0.16 },
			explode: { f4_heatpipes: { from: { up: 3 }, at: 0.5, columns: true, stagger: 0.07 } },
			warm: { at: 2.0, groups: { f4_heatpipes: 0.25, f3_core: 0.5 }, sweep: { from: 2.85, to: 0.4 } }
		}
	},
	{
		title: 'Primary Heat Exchanger',
		text: 'Fin and tube heat exchanger. It carries the heat from the sodium heat pipes into the nitrogen loop that drives the turbine.',
		model: 'power-conversion-system',
		// Head-on from nearly level, turned a quarter (skid left, exchanger right), held
		// still; from Mark-0 it turns the last 50° in as the camera sweeps down to level.
		// A little left of centre, so the model sits right of the panel's text.
		shot: {
			pos: [-0.06, 0.044, 1.23],
			target: [-0.06, -0.04, 0],
			spin: 0,
			turn: Math.PI / 2,
			swing: (50 * Math.PI) / 180,
			swingFrom: { pos: [-0.06, 0.68, 1.2] },
			fov: 29
		},
		// Step by step: the skid fades to a ghost, the exchanger's shell cuts open on
		// the bundle, the heat pipes rise into it ring by ring (as into the core in 04),
		// heat climbs them from 1.7 m to 3.9 m, then energy runs along both pipes to the skid.
		look: {
			opacity: { f6_brayton: 0.15, context: 0.15 },
			cut: ['f5_phx'],
			stages: { fade: 0.3, cut: 0.9 },
			explode: { f4_heatpipes: { from: { up: -1.8 }, at: 1.7, columns: true, stagger: 0.07 } },
			warm: { at: 2.5, groups: { f4_heatpipes: 0.18 }, sweep: { from: 1.7, to: 3.9 } },
			trails: { at: 3.5 }
		},
		still: true
	},
	{
		title: 'Nitrogen Brayton Cycle',
		text: 'Simple recuperated N2 closed Brayton cycle enables efficient power conversion at < 300 psi. Low maintenance, low corrosion, leak resistant, and high reliability.',
		model: 'power-conversion-system',
		// The turbo-alternator, centred on its axis (the point is on top of
		// its housing), from about 30° above, back far enough for the skid
		// round it to read; the skid turned square on, as in 05.
		shot: { pos: [-0.12, 0.395, 0.74], target: [-0.12, 0.01, 0], spin: 0, turn: Math.PI, fov: 29, aim: 'point' },
		// As the video shows it: the skid fades to the faintest ghost, the exchanger's
		// side away; the turbo-alternator's casing opens in half-section to its axis,
		// the disc stack only so far (near edges off to look in), the shaft whole.
		look: {
			hide: ['f5_phx', 'f4_heatpipes', 'standalone'],
			opacity: { f6_brayton: 0.06, context: 0.06 },
			cut: ['f6_turbo', 'f6_turbo_inner'],
			cutDepth: { f6_turbo_inner: 0.55 },
			// The exchanger's side fades out with the model's turn, not ahead of it.
			stages: { cut: 0.5, fadeFor: 1.4 }
		},
		still: true
	},
	{
		title: 'Power Management & Distribution',
		text: 'Electricity is conditioned through a power management and distribution node which can flexibly deliver power and connect to local microgrids.',
		// Not in the CAD: the whole system, put back together, as the close.
		// From 06 a short turn on into it, then the slow auto-turn.
		model: 'power-conversion-system',
		shot: system
	}
];

export const r1 = {
	title: 'R1 Microreactor',
	// TODO(launch): finish the R1 aside (it ends in placeholder text).
	aside:
		'Purpose-designed modular power for defense-critical assets. Dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore',
	features,
	models,
	diagram: { alt: 'Diagram of the R1 power conversion system' },
	views: {
		title: 'Engineering',
		text: 'Simple design optimized for reliability, uptime, and manufacturability'
	}
};

// TODO(launch): write the operating model's three points (title and text are placeholders).
const operatingPoint = {
	title: '#Title',
	text: 'Dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud.'
};

export const operating = {
	label: 'Operating model',
	points: [operatingPoint, operatingPoint, operatingPoint]
};

// TODO(launch): write the Progress card's paragraph (placeholder text).
export const progress = {
	title: 'MARK-01',
	name: 'R1',
	image: {
		src: progressImage,
		alt: 'The R1 microreactor in exploded view, its modules side by side on flat grey'
	},
	text: 'Dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud.',
	link: { label: 'Explore', href: '/progress' }
};

/** One row of the Capabilities accordion. */
export type Capability = { title: string; text: string; image: { src: Picture; alt: string } };

const capabilityPlaceholder =
	'Dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud.';

// TODO(launch): write the intro and the rows' copy (the first ends in placeholder, the rest are placeholder).
export const capabilities = {
	label: 'Capabilities',
	intro:
		'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
	items: [
		{
			title: 'Special Purpose Reactors',
			text: 'We design and manufacture modular, transportable reactors for strategic energy applications on Earth and in space. Ut enim ad minim veniam, quis nostrud. Dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud.',
			image: { src: specialPurposeReactors, alt: 'A reactor spacecraft in orbit above Earth' }
		},
		{
			title: 'Heat Pipes & Thermal Management',
			text: capabilityPlaceholder,
			image: { src: heatPipes, alt: 'A bundle of heat pipes glowing red-hot above a test vessel' }
		},
		{
			title: 'Control Systems',
			text: capabilityPlaceholder,
			image: { src: controlSystems, alt: 'X-ray view down through the reactor core and its ring of control drums' }
		}
	] satisfies Capability[]
};

// TODO(launch): write this section's statement card; it reuses Company's, bullet points included.
export const graphite = {
	title: 'Graphite Machining',
	intro:
		'Antares combines first-principles engineering with a high-velocity operating model to build scalable industrial infrastructure.',
	dark: {
		image: {
			src: technician,
			alt: 'A technician leaning in under a piece of reactor hardware'
		}
	},
	note: {
		label: 'Mission driven',
		statement: ['Mission-critical energy,', 'engineered for Earth and beyond.'],
		points: ['Bullet #1', 'Bullet #2', 'Bullet #3']
	},
	photo: {
		background: {
			src: graphiteMachining,
			alt: 'Hazy aerial view of a reactor test site and its car park on open plains'
		}
	},
	flip: true
} satisfies FeatureCardsContent;
