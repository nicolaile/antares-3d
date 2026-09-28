/**
 * Content shared by every page: the menu and the footer.
 * Links marked `'#'` are placeholders until the pages and profiles exist.
 */
export type Link = { label: string; href: string };

export const footer = {
	/** Each entry is one line. */
	statement: ['Mission-critical energy,', 'engineered for Earth and beyond.'],
	aside:
		'Join us and help turn breakthrough nuclear technology into reliable power for critical missions on Earth, in space, and underwater.',
	nav: [
		{ label: 'Missions', href: '#' },
		{ label: 'Company', href: '#' },
		{ label: 'Progress', href: '#' },
		{ label: 'Updates', href: '#' },
		{ label: 'Careers', href: '#' },
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

export const menu = {
	links: [
		{ label: 'Home', href: '/' },
		{ label: 'Missions', href: '#' },
		{ label: 'Company', href: '#' },
		{ label: 'Progress', href: '#' },
		{ label: 'Updates', href: '#' }
	] satisfies Link[],
	/** The latest update, teased at the foot of the open menu. */
	latest: {
		date: '24 Feb',
		title: 'Purpose-designed modular power for defense-critical assets',
		href: '#'
	}
};
