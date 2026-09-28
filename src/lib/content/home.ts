/**
 * Homepage content. Sections take everything they show as props, so the
 * same sections can be reused on other pages with different content.
 *
 * Images are `?enhanced` imports: each is converted to AVIF/WebP at the
 * widths listed in `w` (never wider than the source) at build time.
 */
import portrait from '$lib/assets/images/intro3.jpg?w=1000;500&enhanced';
import rail from '$lib/assets/images/intro2.jpg?w=1000;500&enhanced';
import facility from '$lib/assets/images/intro1.jpg?w=1600;1200;800&enhanced';
import lineDiagram from '$lib/assets/images/render-line-diagram.png?w=540;270&enhanced';
import sideDiagram from '$lib/assets/images/render-line-diagram-02.png?w=380;190&enhanced';
import component01 from '$lib/assets/images/component-01.jpg?w=932;466&enhanced';
import xray from '$lib/assets/images/x-ray-diagram.jpg?w=2400;1800;1200;800&enhanced';

import type { Feature } from '$lib/modules/ReactorExplorer.svelte';

export const mission = {
	label: 'Mission',
	statement:
		'Energy abundance drives progress, powering missions, economies, and security. Yet, critical power is often hardest to deliver. At Antares, we build compact nuclear microreactors for reliable, mobile energy in remote military bases, industrial sites, and future space and underwater missions.',
	milestones: {
		title: 'Milestones',
		items: [
			{ value: '$600M+', label: 'Capital Raised' },
			{ value: '$161M', label: 'USAF Space Award Winner' },
			{ value: '322,000 Sq.', label: 'Manufacturing Scale' }
		]
	},
	images: {
		portrait: { src: portrait, alt: 'Portrait of an Antares engineer' },
		detail: { src: rail, alt: 'Linear guide carriage on a steel rail' },
		feature: { src: facility, alt: 'A reactor module on a test stand in a bright hall' }
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
		thumb: sideDiagram,
		shot: { pos: [0, 1.58, 0.17], target: [0, 0, 0], spin: 0, fov: 20 }
	},
	{
		title: 'Sodium Heat Pipes',
		text: 'Sodium-filled pipes move heat to the power conversion system by capillary action, with no pumps and no primary coolant loop.',
		thumb: lineDiagram,
		// Camera and target lowered together: the same angle, with the model
		// sitting higher in the frame so the vessel's base clears the panel.
		shot: { pos: [-0.5, 0.73, 0.5], target: [0, 0, 0], spin: Math.PI * 0.6 }
	},
	{
		title: 'Primary Heat Exchanger',
		text: 'Transfers heat from the sodium heat pipes into the power conversion loop, sealed inside the vessel wall.',
		thumb: lineDiagram,
		shot: { pos: [0.8, 0.45, 0.95], target: [0, 0, 0], spin: Math.PI * 1.1 }
	},
	{
		title: 'Nitrogen Brayton Cycle',
		text: 'A closed nitrogen gas turbine turns the heat into electricity, with no water needed on site.',
		thumb: lineDiagram,
		shot: { pos: [0.15, 0.1, 0.55], target: [0, 0.05, 0], spin: Math.PI * 1.6 }
	}
];

export const r1 = {
	title: 'R1 Microreactor',
	aside: {
		label: 'Optimized for reliability',
		text: 'Engineered to bypass civil grid reliance, the R1 delivers megawatt-class continuous baseload power inside a standardized ISO transport envelope. Factory-assembled and tested before shipment, R1 simplifies on-site logistics from years of construction to days of field integration.'
	},
	features,
	architecture: {
		label: 'Hardware architecture',
		text: 'Engineered to bypass civil grid reliance, the R1 delivers megawatt-class continuous baseload power inside a standardized ISO transport envelope.'
	},
	tiles: [
		{ src: component01, alt: 'R1 control electronics board', caption: 'R1 Microreactor' },
		{ src: undefined, alt: '', caption: 'R1 Microreactor' }
	],
	diagram: { src: xray, alt: 'Diagram of the R1 power conversion system' }
};
