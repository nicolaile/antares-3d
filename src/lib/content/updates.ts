/**
 * Content for the Updates page. Headlines and dates are the live ones from
 * antaresindustries.com/updates, newest first. Each links to its article,
 * at /updates/<slug> (see articles.ts).
 *
 * The first three stories lead with the three example images, as in the
 * design, and the Standard Nuclear and Series C stories keep theirs. The
 * rest borrow the lab photo, the one example image not tied to a story,
 * with empty alt text since it isn't of theirs.
 */
import type { Picture } from 'vite-imagetools';
import type { Link } from './site';
// 1368px sources: three times the 456px card at 1440.
import news01 from '$lib/assets/images/updates/news-example-01.jpg?w=1368;912;456&enhanced';
import news02 from '$lib/assets/images/updates/news-example-02.jpg?w=1368;912;456&enhanced';
import news03 from '$lib/assets/images/updates/news-example-03.jpg?w=1368;912;456&enhanced';

/** One item in the updates grid. */
export type UpdateItem = Link & { date: string; image?: { src: Picture; alt: string } };

const standardNuclear = { src: news01, alt: 'The Antares and Standard Nuclear logos' };
const seriesC = { src: news03, alt: '$470M Series C' };
const lab = { src: news02, alt: 'Two engineers in the lab, each holding a piece of reactor hardware' };
const standIn = { src: news02, alt: '' };

const stories: [date: string, label: string, image?: UpdateItem['image']][] = [
	['17.09.2026', 'Antares and Centrus Sign Multi-Year HALEU Supply Contract', standardNuclear],
	['11.09.2026', 'Antares Selected for $161M Strategic Breakthrough Award to Demonstrate Space Reactor', lab],
	['01.09.2026', 'Antares Puts Race-Proven Power Electronics Inside Nuclear Reactor', seriesC],
	['28.08.2026', 'Antares Selected for Nuclear Energy Launch Pad'],
	['27.08.2026', 'Antares Announces Multi-Year TRISO Fuel Supply Agreement with Standard Nuclear', standardNuclear],
	['26.08.2026', 'Antares Awarded Army Janus Agreement at Fort Bragg'],
	['28.07.2026', 'Dr. Rian Bahran Joins Antares as Chief Nuclear Officer'],
	['27.07.2026', 'Antares Raises $470M Series C to Deploy Nuclear Microreactors for Critical Missions', seriesC],
	['24.07.2026', 'Antares CEO Joins the President at the White House to Mark the DOE Reactor Pilot Program'],
	['02.07.2026', 'Antares Signs Long-Term HALEU Supply Agreement with General Matter'],
	['04.06.2026', 'Antares Achieves Criticality of Mark-0 Reactor'],
	['21.05.2026', 'Antares Signs Long-Term HALEU Supply Agreement with Urenco'],
	[
		'22.04.2026',
		'Antares Selected for Proposed Deployment of Nuclear Microreactor at Joint Base San Antonio Under Department of the Air Force ANPI Initiative'
	],
	['06.04.2026', 'Antares Receives DOE Documented Safety Analysis Approval for Mark-0 Demonstration Reactor'],
	['17.02.2026', 'From Neutrons to Electrons: Our Path to Power'],
	[
		'05.02.2026',
		'Antares is expanding its existing headquarters, Antares Prime, to support the next phase of reactor development and manufacturing'
	],
	['26.01.2026', 'Antares Receives DOE Approval for Mark-0 Reactor Preliminary Documented Safety Analysis (PDSA)'],
	['12.01.2026', 'Graphite Machining for Mark-0 begins at Antares Prime'],
	['08.01.2026', 'Heat Pipe Testing at Antares Prime'],
	['02.12.2025', 'A Letter from Our CEO – Antares $96M Series B']
];

/** The URL segment for a headline: lower case, words joined by hyphens. */
export const slug = (label: string) =>
	label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

export const updates = {
	title: 'Updates',
	intro: 'The latest news stories, business developments and product updates',
	items: stories.map(
		([date, label, image]): UpdateItem => ({
			date,
			label,
			href: `/updates/${slug(label)}`,
			image: image ?? standIn
		})
	),
	/** How many items show at first, and how many each "Load more" adds. */
	pageSize: 12,
	pressKit: {
		title: 'Download Press Kit',
		size: 'Filesize 38 MB',
		href: '#'
	}
};
