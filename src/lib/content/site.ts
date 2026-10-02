/**
 * Content shared by every page: the menu and the footer.
 * Links marked `'#'` are placeholders until the pages and profiles exist.
 */
import type { Picture } from 'vite-imagetools';
import news01 from '$lib/assets/images/news-01.jpg?w=276;150&enhanced';
import news02 from '$lib/assets/images/news-02.jpg?w=276;150&enhanced';
import news03 from '$lib/assets/images/news-03.jpg?w=276;150&enhanced';

export type Link = { label: string; href: string };

export const footer = {
	/** Each entry is one line. */
	statement: ['Mission-critical energy,', 'engineered for Earth and beyond.'],
	aside:
		'Join us and help turn breakthrough nuclear technology into reliable power for critical missions on Earth, in space, and underwater.',
	nav: [
		{ label: 'Missions', href: '#' },
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
			{ label: 'Terms', href: '#' },
			{ label: 'Privacy Policy', href: '#' }
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

export const menu = {
	links: [
		{ label: 'Home', href: '/' },
		{ label: 'Missions', href: '#' },
		{ label: 'Company', href: '/company' },
		{ label: 'Progress', href: '#' },
		{ label: 'Updates', href: '/updates' }
	] satisfies Link[],
	/** Smaller links under the main ones. */
	secondary: [
		{ label: 'Contact', href: '#' },
		{ label: 'Careers', href: '/careers' }
	] satisfies Link[],
	/**
	 * The latest updates, cycled at the foot of the open menu. Only the first
	 * is real; the other two are placeholders until the updates feed exists.
	 */
	updates: [
		{
			date: '24 Feb',
			title: 'Purpose-designed modular power for defense-critical assets',
			href: '#',
			image: { src: news01, alt: 'Aerial view of a reactor test site on open plains' }
		},
		{
			date: '12 Feb',
			title: 'Placeholder: a second update headline, two lines long',
			href: '#',
			image: { src: news02, alt: 'Silhouette of a face against a window onto Earth from orbit' }
		},
		{
			date: '30 Jan',
			title: 'Placeholder: a third update headline, two lines long',
			href: '#',
			image: { src: news03, alt: 'Black-and-white portrait of a man in a cap, mid-conversation' }
		}
	] satisfies Update[]
};
