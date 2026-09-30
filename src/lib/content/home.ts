/**
 * Homepage content. Sections take everything they show as props, so the
 * same sections can be reused on other pages with different content.
 *
 * Images are `?enhanced` imports: each is converted to AVIF/WebP at the
 * widths listed in `w` (never wider than the source) at build time.
 */
import heroImage from '$lib/assets/images/hero-image.png?w=1410;1000;700&enhanced';
import intro01 from '$lib/assets/images/intro-01.jpg?w=996;500&enhanced';
import intro02 from '$lib/assets/images/intro-02.jpg?w=648;330&enhanced';
import sodiumPipes from '$lib/assets/images/02-sodium-pipes.png?w=1641;1100;700&enhanced';
import circles from '$lib/assets/images/02-circles.svg';

import type { Feature } from '$lib/modules/ReactorExplorer.svelte';

export const hero = {
	title: 'Purpose-designed modular power',
	text: 'Graphite and boron carbide control drums with independent actuator motors, inspired by historical space reactor designs.',
	image: { src: heroImage, alt: 'A spacecraft in orbit above the curve of the Earth' }
};

export const mission = {
	statement:
		'We are a team of entrepreneurs trained in operations, design, architecture, construction, accounting, and finance, with the common interest in building communities and creating spaces that inspire active lifestyles.',
	milestones: [
		{ value: '322,000 Sq.', label: 'Manufacturing Scale' },
		{ value: '30+', label: 'Experts' },
		{ value: '$600M+', label: 'Capital Raised' }
	],
	images: {
		primary: { src: intro01, alt: 'An engineer in a hard hat working on the reactor core, seen from above' },
		secondary: { src: intro02, alt: 'A prefabricated metal building on open ground, in faded colour film' }
	}
};

/*
 * Shots are in units of the model's bounding radius. A shot straight down
 * lets `lookAt` roll freely, so "top-down" sits 6° off vertical, on a long
 * lens from further back so it reads flat, like a plan view.
 */
const features: Feature[] = [
	{
		title: 'Reactivity Controls',
		text: 'Graphite and boron carbide control drums with independent actuator motors, inspired by historical space reactor designs.',
		shot: { pos: [0, 0.7, 1.4], target: [0, 0, 0], spin: 0, fov: 29 }
	},
	{
		title: 'Sodium Heat Pipes',
		text: 'Sodium-filled pipes move heat to the power conversion system by capillary action, with no pumps and no primary coolant loop.',
		// Its own stage instead of the model.
		panel: {
			image: {
				src: sodiumPipes,
				alt: 'Cut-away render of the R1 vessel showing the sodium heat pipes inside',
				ratio: '1641 / 2303'
			},
			value: '100kWe',
			detail: '1MWe for 6+ years',
			graphic: circles
		}
	},
	{
		title: 'Primary Heat Exchanger',
		text: 'Transfers heat from the sodium heat pipes into the power conversion loop, sealed inside the vessel wall.'
	},
	{
		title: 'Nitrogen Brayton Cycle',
		text: 'A closed nitrogen gas turbine turns the heat into electricity, with no water needed on site.'
	}
];

export const r1 = {
	title: 'R1 Microreactor',
	aside: 'Antares provides the infrastructure to make the financial ecosystem more connected, transparent and efficient.',
	features,
	measure: { label: 'Measures', value: '2.5M/8.2ft' },
	diagram: { alt: 'Diagram of the R1 power conversion system' },
	note: {
		// Set in capitals here: Caption is the 14px style, and it isn't uppercase.
		label: 'ENGINEERING BY ANTARES NUCLEAR',
		text: 'Inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fug nemo.'
	}
};

export const operating = {
	label: 'Operating model',
	points: [
		{
			title: 'Standardized Deployment',
			text: 'Factory-built modules designed for rapid delivery and setup via standard transportation, eliminating the need for extensive local site infrastructure or long setup times.'
		},
		{
			title: 'Standardized Deployment',
			text: 'Passively safe and fully automated control systems built for remote monitoring and continuous, reliable operation with minimal required on-site personnel.'
		},
		{
			title: 'Multi-Year Continuous Power',
			text: 'Factory-built modules designed for rapid delivery and setup via standard transportation, eliminating the need for extensive local site infrastructure or long setup times.'
		}
	]
};
