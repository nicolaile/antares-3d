/**
 * Homepage content. Sections take everything they show as props, so the
 * same sections can be reused on other pages with different content.
 *
 * Images are `?enhanced` imports: each is converted to AVIF/WebP at the
 * widths listed in `w` (never wider than the source) at build time.
 */
import type { Picture } from 'vite-imagetools';
import type { FeatureCardsContent } from './company';
// Capability photos, three columns (338px at 1440): the sources are 2028px wide.
import specialPurposeReactors from '$lib/assets/images/landing/special-purpose-reactors.jpg?w=2028;1014;676;338&enhanced';
import heatPipes from '$lib/assets/images/landing/heat-pipes.jpg?w=2028;1014;676;338&enhanced';
import controlSystems from '$lib/assets/images/landing/control-systems.jpg?w=2028;1014;676;338&enhanced';
// Graphite Machining's photo card, eight columns (928px at 1440).
import graphiteMachining from '$lib/assets/images/landing/graphite-machining.jpg?w=1862;928;464&enhanced';
import heroImage from '$lib/assets/images/company/hero-image.jpg?w=3000;2400;1800;1200;800&enhanced';
// The mission video's still, three columns (338px at 1440): the source is 676px wide.
import progressImage from '$lib/assets/images/landing/progress.png?w=2800;1400;700&enhanced';
import videoStill from '$lib/assets/images/landing/video.jpg?w=676;338&enhanced';

import type { Feature, CadModel, CadModelSetup } from '$lib/modules/ReactorExplorer.svelte';
import type { Shot } from '$lib/three/shot';

export const hero = {
	title: 'Purpose-designed modular power',
	text: 'Graphite and boron carbide control drums with independent actuator motors, inspired by historical space reactor designs.',
	image: { src: heroImage, alt: 'A nuclear-powered spacecraft in orbit, lit by the sun above the curve of the Earth' }
};

export const mission = {
	statement:
		'Dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
	milestones: [
		{ value: '322.000SQ', label: 'Manufacturing Scale' },
		{ value: '30+', label: 'Experts' },
		{ value: '$600M+', label: 'Capital Raised' }
	],
	images: {
		secondary: {
			src: videoStill,
			alt: 'A machinist in a hard hat working on a graphite block, seen from above, in black and white',
			ratio: '676 / 420',
			duration: '02:23'
		}
	}
};

/*
 * Shots are in units of the model's bounding radius. A shot straight down
 * lets `lookAt` roll freely, so "top-down" sits 6° off vertical, on a long
 * lens from further back so it reads flat, like a plan view.
 */
/** Mark-0 whole, centred. */
const vessel: Shot = { pos: [0, 0.35, 1.45], target: [0, -0.03, 0], spin: 0, fov: 29 };
/**
 * The power conversion system whole, pulled back and raised, three-quarters
 * on, so the power path reads left to right: the exchanger, the down pipe,
 * the skid's generator, the cooler.
 */
const system: Shot = { pos: [0, 0.44, 1.23], target: [0, -0.03, 0], spin: 0, turn: -Math.PI / 4, fov: 29 };
/** In on the open point (`aim`), a little above it, looking slightly down. */
const close = (distance: number, below = 0): Shot => ({
	pos: [0, distance * 0.3, distance],
	target: [0, -below, 0],
	spin: 0,
	fov: 29,
	aim: 'point'
});

/**
 * The CAD on the stage, one model at a time: Mark-0 for the reactor
 * (01–04), the power conversion system from the exchanger on (05–07).
 * Each as its web groups (scripts/split-web-model.mjs).
 */
const cad = (model: string, groups: string[]) => groups.map((g) => `/models/cad/web/${model}/${g}.glb`);

const models: Partial<Record<CadModel, CadModelSetup>> = {
	'mark-0': { files: cad('mark-0', ['f1_cradle', 'f2_drives', 'f2_reactivity', 'f3_core', 'f4_heatpipes', 'context']) },
	'power-conversion-system': {
		// `standalone`: the exchanger's stand, which the stacked system leaves out.
		files: cad('power-conversion-system', ['f4_heatpipes', 'f5_phx', 'standalone', 'f6_brayton', 'context']),
		// The horizontal vessel at the back of the skid, carved out of it to
		// cut open: by what's inside (a shaft on its axis, a stack of ~1 m
		// discs, two inlets on top) the turbo-alternator's housing, which the
		// video shows in half-section, rather than the recuperator it was
		// first taken for. To confirm with Antares. Its axis runs along x at
		// y 1.09 m, z −4.20 m, from x −0.65 to 1.45 m; Ø1.44 m at its ends.
		// Then its insides out of that again, to stay whole in the cut, as the
		// video's rotating parts do: what's centred on the axis and under
		// the casing's 1.07 m across (the shaft and its rods, the disc stack).
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
		// 15° to the right as it comes apart. Back ~5% from [0, 0.86, 1.48],
		// along the same line, so the ring sits a touch smaller in the frame.
		shot: { pos: [0, 0.9, 1.55], target: [0, 0.03, 0], spin: 0, fov: 29, lean: (-15 * Math.PI) / 180 },
		// Taken apart, as the video shows it: the shield opened and faded
		// away, the drums and the reflector blocks between them out from the
		// core into one ring, the drives out and up over their drums, the
		// heat pipes risen out of the core.
		look: {
			explode: {
				// The shield first, opened like a clamshell at the seam facing
				// the camera, its two sides sliding apart whole and fading out
				// as they go. It's built in half-shells, the upper pair split at
				// 90° to the lower (upper at 0° and 180°, lower at ±90°), so each
				// side takes an upper half and the lower one beside it: sides
				// centred on −45° and 135°.
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
		shot: { pos: [0, 0.54, 1.16], target: [0, -0.03, 0], spin: 0, fov: 29, lean: (-30 * Math.PI) / 180 },
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
		// As the video shows it: everything but the core fades away, the
		// core turns see-through, and the heat pipes appear above it and
		// slide down into it ring by ring, the middle first and the outer
		// ring last, each slowing as it seats; once the last is in, the heat
		// comes on: a glow down the core and its pipes from the deck fittings
		// (2.85 m) to the bottom (0.4 m), once, settling to a soft glow.
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
		// The whole system head-on, from nearly level: turned a quarter so
		// the skid stands on the left and the exchanger on the right, held
		// still. Coming from Mark-0 it turns the last 50° into place as it's
		// revealed, the camera sweeping down from high above to level.
		shot: { pos: [0, 0.035, 1.1], target: [0, -0.04, 0], spin: 0, turn: Math.PI / 2, swing: (50 * Math.PI) / 180, swingFrom: { pos: [0, 0.68, 1.2] }, fov: 29 },
		// The exchanger's side picked out, a step at a time: the system
		// arrives, the Brayton skid on the left fades to a faint ghost, the
		// exchanger's shell cuts open on the tube bundle facing the camera,
		// then the heat pipes rise up into it ring by ring, as they went
		// down into the core in 04. Once they're seated the heat comes up
		// them, the glow 04 left them with, a little softer, rising from
		// their feet (1.7 m) to their heads (3.9 m) into the bundle; as it
		// nears the top, energy runs out along both pipes to the skid.
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
		shot: { pos: [-0.06, 0.395, 0.74], target: [-0.06, 0.01, 0], spin: 0, turn: Math.PI, fov: 29, aim: 'point' },
		// As the video shows it: the rest of the skid fades to the faintest
		// ghost and the exchanger's side away; the turbo-alternator's casing
		// opens in half-section facing the camera to its axis, and the stack
		// of discs inside it only so far, its near edges off to look into it,
		// the shaft on the axis whole.
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
	aside: 'Purpose-designed modular power for defense-critical assets',
	features,
	models,
	diagram: { alt: 'Diagram of the R1 power conversion system' },
	views: {
		title: 'Optimized for reliability, uptime, and manufacturability',
		text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Lorem ipsum dolor sit amet.'
	},
};

/** Placeholders, as in the design, until the copy is written. */
const operatingPoint = {
	title: '#Title',
	text: 'Dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud.'
};

export const operating = {
	label: 'Operating model',
	points: [operatingPoint, operatingPoint, operatingPoint]
};

/** The paragraph is a placeholder, as in the design. */
export const progress = {
	title: 'FROM MARK-01',
	name: 'R1',
	image: {
		src: progressImage,
		alt: 'The R1 microreactor in exploded view, its modules side by side on a grey studio gradient'
	},
	text: 'Dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud.',
	link: { label: 'Progress', href: '#' }
};

/** One row of the Capabilities accordion. */
export type Capability = { title: string; text: string; image: { src: Picture; alt: string } };

const capabilityPlaceholder =
	'Dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud.';

/** Only the first row's copy is written; the others carry placeholder text. */
export const capabilities = {
	label: 'Capabilities',
	intro: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
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

/** The statement card is Company's, until this section's copy is written. */
export const graphite = {
	title: 'Graphite Machining',
	intro:
		'Antares combines first-principles engineering with a high-velocity operating model to build scalable industrial infrastructure.',
	dark: {},
	note: {
		label: 'Mission driven',
		statement: ['Mission-critical energy,', 'engineered for Earth and beyond.'],
		points: ['Bullet #1', 'Bullet #2', 'Bullet #3']
	},
	photo: {
		label: 'Graphite Machining',
		background: {
			src: graphiteMachining,
			alt: 'Hazy aerial view of a reactor test site and its car park on open plains'
		}
	},
	flip: true
} satisfies FeatureCardsContent;
