/**
 * Content for the Progress page: the roadmap to electricity, year by year,
 * each year with the render, drawing or photos that go with it, then the
 * figures and a word from the founder over the closing photo.
 *
 * Image widths (`w`) start from the display width at 1440: the R1 render
 * three columns (338px, at most 694px), the clusters' photos three to five
 * columns, the full-bleed band 1440px.
 */
import type { Picture } from 'vite-imagetools';
import r1 from '$lib/assets/images/progress/r1.png?w=694;347&enhanced';
// Traced into strokes by the local lab pipeline, so it can draw itself on.
import diagram from '$lib/assets/images/progress/line-diagram.svg?raw';
import site from '$lib/assets/images/progress/image-cluster-01.jpg?w=1722;1148;574&enhanced';
import ribbon from '$lib/assets/images/progress/image-cluster-02.jpg?w=1017;678;339&enhanced';
import aerial from '$lib/assets/images/progress/image-cluster-03.jpg?w=1368;912;456&enhanced';
import sign from '$lib/assets/images/progress/image-cluster-04.jpg?w=1371;914;457&enhanced';
import crew from '$lib/assets/images/progress/image-cluster-05.jpg?w=1014;676;338&enhanced';
import portrait from '$lib/assets/images/progress/image-cluster-06.jpg?w=1014;676;338&enhanced';
import orbit from '$lib/assets/images/progress/full-bleed.jpg?w=2880;1440;720&enhanced';

type Image = { src: Picture; alt: string };

/** One photo in a cluster: where it sits, and how far it floats. */
export type ClusterItem = {
	image: Image;
	/** CSS aspect-ratio, its source's. */
	ratio: string;
	/** First column and how many it spans, on the 12-column grid. */
	start: number;
	span: number;
	/** How far down it sits, as a share of its own width (%). */
	y?: number;
	/** How far across it's nudged off its column, as a share of its own width (%). */
	x?: number;
	/** Stacking order: higher sits on top. */
	z?: number;
	/** How much it drifts with the scroll and the pointer; negative drifts the other way. */
	depth?: number;
};

// TODO(launch): write the three figures' lines (placeholder text).
const lorem = 'Dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt';

export const progress = {
	title: ['Roadmap', 'to Electricity'],
	intro: 'Our roadmap to electricity: the milestones behind R1, and those still ahead.',
	model: {
		name: 'R1',
		image: { src: r1, alt: 'The R1 microreactor in an exploded view, its four modules stacked apart' },
		ratio: '694 / 1230',
		/**
		 * Where the render splits into its modules, as shares of its height,
		 * top to bottom: in the gaps between them, the last through the drum
		 * plate's soft shadow.
		 */
		cuts: [0.318, 0.49, 0.65],
		/** The reactor's top and bottom inside the render, for the ruler. */
		extent: [0.134, 0.938],
		ruler: '2,560 mm'
	},
	entries: [
		{
			year: '2025',
			title: 'Conceptual Design Review (CDR)',
			text: 'In 2025, we set the pace for advanced reactor development—completing our Conceptual Design Review (CDR) on an accelerated timeline and becoming the first company in the country to receive an approved Nuclear Safety Design Agreement (NSDA) for a reactor. We opened Antares Prime—322,000 sq-ft of vertically integrated R&D space—to accelerate in-house manufacturing and iteration, tested our first Electrically Heated Demonstration Unit (EDU), submitted our Preliminary Documented Safety Analysis (PDSA), prepared our reactor test site, and became the first U.S. microreactor to receive a HALEU allocation and begin fuel fabrication.'
		},
		{
			year: '2026',
			title: 'Reactor Demo at Idaho Lab',
			text: 'In 2026, we conducted our first reactor demonstration at Idaho National Laboratory under the Department of Energy’s Reactor Pilot Program—validating reactor physics, reactivity control behavior, and system-level safety performance in operation. In parallel, we will close the final reactor design and safety analysis and complete qualification of our heat pipes, heat exchanger, and power conversion system, setting the conditions to produce electricity in 2027.'
		},
		{
			year: '2028',
			title: 'Looking ahead',
			text: 'In 2027, we operate a full-power, electricity-producing advanced reactor on American soil. We will validate system performance and prepare for customer deployments beginning in 2028.'
		}
	],
	/** The 2025 photos: the site, from the air and on the ground, and the ribbon. */
	built: [
		{
			image: { src: site, alt: 'Aerial view of the reactor test site on the high desert plain' },
			ratio: '1722 / 1038',
			start: 5,
			span: 5,
			z: 1,
			depth: 0.5
		},
		{
			image: { src: aerial, alt: 'A long building and its shadow from directly above, in black and white' },
			ratio: '1368 / 1287',
			start: 2,
			span: 4,
			y: 26,
			z: 2,
			depth: -0.6
		},
		{
			image: { src: ribbon, alt: 'Officials cutting the ribbon at the opening of Antares Prime' },
			ratio: '1017 / 672',
			start: 5,
			span: 3,
			y: 124,
			z: 3,
			depth: 1
		}
	] satisfies ClusterItem[],
	drawing: {
		svg: diagram,
		label: 'Line drawing of the reactor’s modules side by side, in section'
	},
	figures: [
		{ value: 250000000, label: lorem, start: 4 },
		{ value: 935, suffix: 'MW', label: lorem, start: 6 },
		{ value: 10000000, separator: '.', label: lorem, start: 2, mark: true }
	],
	/** The 2028 photos: the road in, the crew and the founder on site. */
	ahead: [
		{
			image: { src: crew, alt: 'Two engineers in hard hats lifting a heat pipe assembly into place' },
			ratio: '1014 / 1005',
			start: 8,
			span: 3,
			x: -9,
			y: 100,
			z: 1,
			depth: 1
		},
		{
			image: { src: sign, alt: 'A restricted-area sign by the desert road to the site, seen through a windscreen' },
			ratio: '1371 / 1005',
			start: 5,
			span: 4,
			y: 25,
			z: 2,
			depth: -0.5
		},
		{
			image: { src: portrait, alt: 'The founder talking with a colleague outside the reactor dome' },
			ratio: '1014 / 1350',
			start: 10,
			span: 3,
			// Furthest back: under the others, and moving least.
			z: 0,
			depth: 0.3
		}
	] satisfies ClusterItem[],
	// TODO(launch): write the founder's quote (placeholder text).
	quote: {
		text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et',
		name: 'Jordan Bramble',
		role: 'CEO & Co-Founder',
		image: { src: orbit, alt: 'Through a spacecraft window, a strand of hair floats against the Earth below' }
	}
};
