/** Content shared by every page: the menu and the footer. */
import type { Picture } from 'vite-imagetools';
import shareImage from '$lib/assets/images/company/hero-image.jpg?w=1200&h=630&fit=cover&format=jpg';
import { updates as stories } from './updates';

/** Names the site in titles and share cards. */
export const site = {
	name: 'Antares',
	// Must match the production domain: canonical links, share-card URLs and the sitemap build on it.
	url: 'https://antaresindustries.com',
	description:
		'Antares builds compact nuclear microreactors for reliable, mobile energy in remote military bases, industrial sites, and future space and underwater missions.',
	/** 1200×630, the share card's size. */
	image: shareImage
};

export type Link = { label: string; href: string };

export const footer = {
	/** Each entry is one line. */
	statement: ['Mission-critical energy,', 'engineered for Earth and beyond.'],
	// TODO(launch): replace the placeholder aside.
	aside:
		'Dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud.',
	/** The call to action under the aside. */
	link: { label: 'Join mission', href: '/careers' } satisfies Link,
	nav: [
		{ label: 'Missions', href: '/missions' },
		{ label: 'Company', href: '/company' },
		{ label: 'Progress', href: '/progress' },
		{ label: 'Updates', href: '/updates' },
		{ label: 'Careers', href: '/careers' },
		// TODO(launch): link Contact (href is '#'); Missions' "Start a mission" follows it.
		{ label: 'Contact', href: '#' }
	] satisfies Link[],
	social: [
		// TODO(launch): link the LinkedIn, Instagram and X profiles (hrefs are '#').
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
		{ label: 'Progress', href: '/progress' },
		{ label: 'Updates', href: '/updates' }
	] satisfies Link[],
	/** Smaller links under the main ones. */
	secondary: [
		{ label: 'Careers', href: '/careers' },
		// TODO(launch): link Contact, as in the footer (href is '#').
		{ label: 'Contact', href: '#' }
	] satisfies Link[],
	/** The three latest stories, cycled at the foot of the open menu. */
	updates: stories.items.slice(0, 3).map((story): Update => ({
		date: shortDate(story.date),
		title: story.label,
		href: story.href,
		image: { src: story.image!.src, alt: story.image!.alt }
	}))
};
