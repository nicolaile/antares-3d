/**
 * Content shared by every page: the menu and the footer.
 * Links marked `'#'` are placeholders until the pages and profiles exist.
 */
import type { Picture } from 'vite-imagetools';
import { updates as stories } from './updates';

export type Link = { label: string; href: string };

export const footer = {
	/** Each entry is one line. */
	statement: ['Mission-critical energy,', 'engineered for Earth and beyond.'],
	aside:
		'Dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud.',
	/** The call to action under the aside. */
	link: { label: 'Join our mission', href: '/careers' } satisfies Link,
	nav: [
		{ label: 'Missions', href: '/missions' },
		{ label: 'Company', href: '/company' },
		{ label: 'Progress', href: '#' },
		{ label: 'Updates', href: '/updates' },
		{ label: 'Careers', href: '/careers' },
		{ label: 'Contact', href: '#' }
	] satisfies Link[],
	social: [
		{ label: 'LinkedIn', href: '#' },
		{ label: 'Instagram', href: '#' },
		{ label: 'X', href: '#' }
	] satisfies Link[],
	legal: {
		owner: 'Antares Nuclear, Inc.',
		links: [
			{ label: 'Terms', href: '/terms' },
			{ label: 'Privacy Policy', href: '/privacy' }
		] satisfies Link[]
	}
};

/** A news item, as teased in the open menu. */
export type Update = {
	date: string;
	title: string;
	href: string;
	image: { src: Picture; alt: string };
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** DD.MM.YYYY → "17 Sep", as the menu dates its updates. */
const shortDate = (date: string) => {
	const [d, m] = date.split('.').map(Number);
	return `${d} ${MONTHS[m - 1]}`;
};

export const menu = {
	links: [
		{ label: 'Home', href: '/' },
		{ label: 'Missions', href: '/missions' },
		{ label: 'Company', href: '/company' },
		{ label: 'Progress', href: '#' },
		{ label: 'Updates', href: '/updates' }
	] satisfies Link[],
	/** Smaller links under the main ones. */
	secondary: [
		{ label: 'Careers', href: '/careers' },
		{ label: 'Contact', href: '#' }
	] satisfies Link[],
	/** The three latest stories, cycled at the foot of the open menu. */
	updates: stories.items.slice(0, 3).map(
		(story): Update => ({
			date: shortDate(story.date),
			title: story.label,
			href: story.href,
			image: { src: story.image!.src, alt: story.image!.alt }
		})
	)
};
