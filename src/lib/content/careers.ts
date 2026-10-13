/**
 * Content for the Careers page. Image widths (`w`) cover 2×, 1× and ½ the
 * display width at 1440: the hero runs the grid's full width (1400px), the
 * founder band edge to edge (1440px).
 */
import type { Link } from './site';
import { operating } from './home';
import { company } from './company';
import heroImage from '$lib/assets/images/career/career-hero.jpg?w=2816;1408;704&enhanced';
import founderImage from '$lib/assets/images/career/founder-quote.jpg?w=2880;1440;720&enhanced';

/** One open position: its title is the link label. */
export type Position = Link & { department: string; location: string };

const titles = ['Quality Assurance Specialist', 'Operations Manager', 'Project Manager', 'Finance Manager'];

export const careers = {
	title: 'Careers',
	// TODO(launch): replace the intro; it reads as template copy and stops mid-sentence.
	intro: 'Antares provides the infrastructure to make the financial ecosystem',
	image: {
		src: heroImage,
		alt: 'Silhouette of a face against a window onto Earth from orbit'
	},
	positions: {
		label: 'Latest openings',
		// TODO(launch): replace the placeholder positions (the design's four, cycled) with the jobs feed.
		items: Array.from({ length: 86 }, (_, i): Position => ({
			label: titles[i % titles.length],
			department: 'Finance & Accounting',
			location: 'Los Angeles, Full-time',
			// TODO(launch): link each position to its listing (href is '#').
			href: '#'
		})),
		/** How many show, as the latest openings, in the carousel. */
		featured: 12,
		// TODO(launch): link "Explore all" to the full list of openings (href is '#').
		all: { label: 'Explore all', href: '#' }
	},
	quote: {
		// TODO(launch): confirm the founder quote; it reads as template copy.
		text: 'We are a team of entrepreneurs trained in operations, design, architecture, construction, accounting, and finance, with the common interest in building communities and creating spaces that inspire active lifestyles.',
		name: 'Jordan Bramble',
		role: 'CEO & Co-Founder',
		image: {
			src: founderImage,
			alt: 'Black-and-white portrait of Jordan Bramble in a cap and dark T-shirt'
		}
	},
	why: { ...operating, label: 'Why Antares' },
	/** The Company slideshow's photos, without their captions or count. */
	life: {
		title: 'Life at Antares',
		slides: company.slideshow.slides.map(({ image }) => ({ image })),
		count: false
	}
};
