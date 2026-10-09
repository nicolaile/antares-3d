/**
 * Content for the Missions page. The intro, the accordion's label and
 * paragraphs, and the R1 card's line are placeholders until their copy is
 * written; the Special purpose reactors text is the draft from the design.
 */
import type { Capability } from './home';
import { footer } from './site';
// Full-bleed, 1440px at 1440: sources at twice that, and smaller.
import space from '$lib/assets/images/mission/space.jpg?w=2880;1440;720&enhanced';
import earth from '$lib/assets/images/mission/earth.jpg?w=2880;1440;720&enhanced';
import underwater from '$lib/assets/images/mission/underwater.jpg?w=2880;1440;720&enhanced';
// The accordion's photos, three columns (338px at 1440).
import heatPipes from '$lib/assets/images/landing/heat-pipes.jpg?w=1014;676;338&enhanced';
import spaceReactor from '$lib/assets/images/landing/special-purpose-reactors.jpg?w=1014;676;338&enhanced';
import underwaterSmall from '$lib/assets/images/mission/underwater.jpg?w=1014;676;338&enhanced';
// The specs card's image, three columns.
// 672px is as wide as it comes.
import specsImage from '$lib/assets/images/mission/download-spec.jpg?w=672;336&enhanced';
import r1Reveal from '$lib/assets/images/mission/mark-0-reveal-web.mp4';
// A still of R1 in the reveal's place, for now.
import reactor from '$lib/assets/images/mission/reactor.png?w=1638;1200;800&enhanced';

const placeholder =
	'Dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud. Dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud.';

export const missions = {
	title: 'Missions',
	intro: 'Dolor sit amet, consectetur adipiscing sed do eiusmod tempor incididunt.',
	cycle: {
		phrase: 'Abundant energy for',
		items: [
			{
				word: 'Space',
				image: { src: space, alt: 'A nuclear-powered spacecraft in orbit, lit by the sun above the curve of the Earth' }
			},
			{ word: 'Earth', image: { src: earth, alt: 'Aerial view of a camp of white buildings among desert dunes' } },
			{ word: 'Underwater', image: { src: underwater, alt: 'Deep underwater' } }
		]
	},
	summary: {
		title: 'Special purpose reactors',
		text: 'In 2025, we set the pace for advanced reactor development, completing our Conceptual Design Review (CDR) on an accelerated timeline and becoming the first company in the country to receive an approved Nuclear Safety Design Agreement (NSDA) for a reactor. We opened Antares Prime, 322,000 sq-ft of vertically integrated R&D space, to accelerate in-house manufacturing and iteration, tested our first Electrically Heated Demonstration Unit (EDU), submitted our Preliminary Documented Safety Analysis (PDSA), prepared our reactor test site, and became the first U.S. microreactor to receive a HALEU allocation and begin fuel fabrication.'
	},
	applications: {
		label: '#ModuleTitle',
		items: [
			{
				title: 'Defense and remote sites',
				text: placeholder,
				image: { src: heatPipes, alt: 'A bundle of heat pipes glowing red-hot above a test vessel' }
			},
			{
				title: 'Space',
				text: placeholder,
				image: { src: spaceReactor, alt: 'A reactor spacecraft in orbit above Earth' }
			},
			{
				title: 'Underwater',
				text: placeholder,
				image: { src: underwaterSmall, alt: 'Deep underwater' }
			}
		] satisfies Capability[]
	},
	product: {
		title: 'R1 Microreactor',
		subtitle: 'Purpose-designed modular power for defense-critical assets',
		// The clip's first 0.85s is black: start where the light comes in.
		video: { src: r1Reveal, label: 'The R1 microreactor, turning in the light', start: 0.85 },
		image: { src: reactor, alt: 'The R1 microreactor', wip: true },
		text: 'Dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud. Ut enim ad minim.',
		link: { label: 'Start a mission', href: footer.nav.find((l) => l.label === 'Contact')?.href ?? '#' }
	},
	specs: {
		title: 'Download Specs',
		size: '38 MB',
		image: { src: specsImage, alt: '' },
		href: '#'
	}
};
