/**
 * Content for the Careers page. Every position is a placeholder, cycling
 * the four from the design, until the jobs feed exists.
 */
import type { Link } from './site';
import { operating } from './home';
// The hero runs the grid's full width (1408px at 1440); the founder band
// runs edge to edge (1440px). Sources at two and one times that, and half.
import heroImage from '$lib/assets/images/career/career-hero.jpg?w=2816;1408;704&enhanced';
import founderImage from '$lib/assets/images/career/founder-quote.jpg?w=2880;1440;720&enhanced';

/** One open position: its title is the link label. */
export type Position = Link & { department: string; location: string };

const titles = ['Quality Assurance Specialist', 'Operations Manager', 'Project Manager', 'Finance Manager'];

export const careers = {
	title: 'Careers',
	intro: 'Antares provides the infrastructure to make the financial ecosystem',
	image: {
		src: heroImage,
		alt: 'Silhouette of a face against a window onto Earth from orbit'
	},
	positions: {
		label: 'Latest openings',
		items: Array.from(
			{ length: 86 },
			(_, i): Position => ({
				label: titles[i % titles.length],
				department: 'Finance & Accounting',
				location: 'Los Angeles, Full-time',
				href: '#'
			})
		),
		/** How many show, as the latest openings. */
		featured: 4
	},
	quote: {
		text: 'We are a team of entrepreneurs trained in operations, design, architecture, construction, accounting, and finance, with the common interest in building communities and creating spaces that inspire active lifestyles.',
		name: 'Jordan Bramble',
		role: 'CEO & Co-Founder',
		image: {
			src: founderImage,
			alt: 'Black-and-white portrait of Jordan Bramble in a cap and dark T-shirt'
		}
	},
	why: { ...operating, label: 'Why Antares' }
};
