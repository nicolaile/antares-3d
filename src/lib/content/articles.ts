/**
 * Articles: one per update, at /updates/<slug>. Each takes its headline and
 * date from updates.ts and its body, the live copy, from articleBodies.ts.
 * The hero is the story's own image from the updates list, so the
 * article opens on the picture its card shows.
 */
import type { Picture } from 'vite-imagetools';
import { slug, updates } from './updates';
import { bodies } from './articleBodies';

export type Image = { src: Picture; alt: string };

/**
 * The body is a run of blocks, set in order. Fields named `html` carry
 * inline links, bold and italics, and are set as HTML.
 */
export type Block =
	/** The standfirst under the hero, when a story has one. */
	| { type: 'lead'; text: string }
	| { type: 'paragraph'; html: string }
	| { type: 'heading'; text: string }
	/** One or more paragraphs of quoted speech. */
	| { type: 'quote'; html: string[] }
	| { type: 'list'; ordered: boolean; items: string[] }
	/** A key figure on an outlined card: "25K" and a line on what it counts. */
	| { type: 'stat'; value: string; text: string }
	| { type: 'figure'; image: Image; ratio: string; label?: string; caption?: string }
	/** A YouTube film by id, or a video file that plays muted on a loop. */
	| { type: 'video'; youtube: string }
	| { type: 'video'; src: string };

export type Article = {
	slug: string;
	title: string;
	/** As in the updates list: DD.MM.YYYY. */
	date: string;
	image: Image;
	body: Block[];
};

export const articles: Article[] = updates.items.map((item) => ({
	slug: slug(item.label),
	title: item.label,
	date: item.date,
	// Every item has one (updates.ts gives the rest a stand-in).
	image: item.image!,
	body: bodies[slug(item.label)] ?? []
}));

/** DD.MM.YYYY → `{ iso: '2026-09-01', text: 'Sep 1, 2026' }`, as the live site dates its stories. */
export function formatDate(date: string) {
	const [d, m, y] = date.split('.').map(Number);
	const at = new Date(Date.UTC(y, m - 1, d));
	return {
		iso: at.toISOString().slice(0, 10),
		text: at.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		})
	};
}
