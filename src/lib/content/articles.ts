/**
 * Articles: one per update, at /updates/<slug>. Each takes its headline and
 * date from updates.ts. Until the articles are written here, every one
 * shares the body from the article design (the race-proven power
 * electronics story, with placeholder copy after its opening) and its
 * photos.
 */
import type { Picture } from 'vite-imagetools';
import { slug, updates } from './updates';
// The hero runs eight columns (928px at 1440); the inline figure six (692px).
import heroImage from '$lib/assets/images/article/article-thumbnail.jpg?w=2072;1392;928;464&enhanced';
import inlineImage from '$lib/assets/images/article/article-inline.jpg?w=1408;1038;692&enhanced';

type Image = { src: Picture; alt: string };

/** The body is a run of blocks, set in order. */
export type Block =
	| { type: 'paragraph'; text: string }
	| { type: 'heading'; text: string }
	| { type: 'figure'; image: Image; ratio: string; label?: string; caption?: string };

export type Article = {
	slug: string;
	category: string;
	title: string;
	/** As in the updates list: DD.MM.YYYY. */
	date: string;
	image: Image;
	body: Block[];
};

const placeholder =
	'Museum of Tolerance Los Angeles was honored at the 53rd Annual Los Angeles Architectural Awards, winning the Interiors award in recognition of Claudia and Nelson Peltz Social Lab. The immersive 10,000-square-foot space features 15 distinct areas that promote tolerance and inclusion on different scales—starting with individual biases, to local issues, national conflicts and global crises—highlighting,';

const body: Block[] = [
	{
		type: 'paragraph',
		text: 'In 2019, Luiz Oliveira ran the hybrid power unit on Valtteri Bottas’s Mercedes through a Formula 1 championship season. Today he runs power conversion for a nuclear reactor. The overlap is no coincidence. It turned a Formula 1 approach into the operating model for Antares’ power-conversion hardware. The company today announced a partnership with Motion Applied, the UK-based Tier One technology provider, to supply race-proven power electronics for its microreactor power-conversion system. Motion Applied brings decades of high-performance electronics and electrification experience from motorsport and other demanding sectors into the program, giving Antares access to mature, production-grade technology rather than starting from a blank sheet. The hardware has been developed under the extreme duty cycles of high-performance motorsport, manufactured at volumes the nuclear industry has never approached, and qualified against reliability standards forged on production runs measured in the millions.'
	},
	{
		type: 'paragraph',
		text: 'For Motion Applied, the partnership represents a further extension of technology originally developed for the highest levels of motorsport into critical infrastructure. Its power electronics are designed for environments similar to those of microreactors and expected to operate safely and consistently in demanding field conditions.'
	},
	{ type: 'heading', text: 'Forward-looking statement' },
	{ type: 'paragraph', text: placeholder },
	{
		type: 'figure',
		image: {
			src: inlineImage,
			alt: 'An engineer in a hard hat fitting lifting slings to a reactor component, seen from above'
		},
		ratio: '1408 / 998',
		label: 'Title.',
		caption:
			'Museum of Tolerance Los Angeles was honored at the 53rd Annual Los Angeles Architectural Awards, winning the Interiors award in recognition of Claudia and Nelson Peltz Social Lab. The immersive 10,000-square-foot space features 15 distinct areas that promote tolerance.'
	},
	{ type: 'heading', text: 'Forward-looking statement' },
	{ type: 'paragraph', text: placeholder }
];

export const articles: Article[] = updates.items.map((item) => ({
	slug: slug(item.label),
	category: 'Announcement',
	title: item.label,
	date: item.date,
	image: {
		src: heroImage,
		alt: 'An engineer at a Nakamura-Tome lathe on the floor of an empty factory hall'
	},
	body
}));

/** DD.MM.YYYY → `{ iso: '2026-09-01', long: 'September 1, 2026' }`. */
export function formatDate(date: string) {
	const [d, m, y] = date.split('.').map(Number);
	const at = new Date(Date.UTC(y, m - 1, d));
	return {
		iso: at.toISOString().slice(0, 10),
		long: at.toLocaleDateString('en-US', {
			month: 'long',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		})
	};
}
