/**
 * Content for the Company page: the leadership team, in the order and with
 * the roles on antaresindustries.com/leadership-team. Only Jordan's bio is
 * written; the others carry placeholder copy until theirs are in.
 */
import type { Picture } from 'vite-imagetools';
import type { ComponentProps } from 'svelte';
import type FeatureCards from '$lib/modules/FeatureCards.svelte';
import { footer } from './site';
// Six columns (692px at 1440) for the slideshow; the sources are 2040px wide.
import slide01 from '$lib/assets/images/company/slideshow-01.jpg?w=2040;1384;692&enhanced';
import slide02 from '$lib/assets/images/company/slideshow-02.jpg?w=2040;1384;692&enhanced';
import slide03 from '$lib/assets/images/company/slideshow-03.jpg?w=2040;1384;692&enhanced';
import slide04 from '$lib/assets/images/company/slideshow-04.jpg?w=2040;1384;692&enhanced';
import slide05 from '$lib/assets/images/company/slideshow-05.jpg?w=2040;1384;692&enhanced';
import slide06 from '$lib/assets/images/company/slideshow-06.jpg?w=2040;1384;692&enhanced';
// The Iterative card (928px at 1440) and the photo inset in it (400px);
// the sources are twice and a little over twice that.
import iterativeBackground from '$lib/assets/images/company/Iterative-01.jpg?w=1856;928;464&enhanced';
import iterativeImage from '$lib/assets/images/company/Iterative-02.jpg?w=948;474;237&enhanced';
// 338px cards at 1440; the sources are 1014px wide.
// Every portrait is the same stand-in for now; 676px is as wide as it comes.
import portrait from '$lib/assets/images/career/employee.jpg?w=676;338&enhanced';

/** One person in the leadership grid. */
export type Person = {
	name: string;
	role: string;
	image: { src: Picture; alt: string };
	/** Shown in the panel that opens from their card. */
	bio: string;
};

const placeholderBio =
	'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

const placeholderCaption =
	'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';

/** One image in the slideshow, with the line under it. */
export type Slide = { image: { src: Picture; alt: string }; caption?: string };

/** A FeatureCards section: Culture & Operations here, Graphite Machining on the landing. */
export type FeatureCardsContent = ComponentProps<typeof FeatureCards>;

export const company = {
	title: 'Company',
	intro: 'Dolor sit amet, consectetur adipiscing sed do eiusmod tempor incididunt.',
	leadership: {
		label: 'Leadership',
		people: [
			{
				name: 'Jordan Bramble',
				role: 'CEO & Co-Founder',
				image: { src: portrait, alt: 'Portrait of Jordan Bramble' },
				bio:
					'Jordan Bramble leads Antares as CEO and Co-Founder, guiding the company’s mission to deliver reliable fission power for the toughest environments on Earth and beyond. Since launching Antares in 2023, he has overseen more than $130 million in fundraising and built the foundation for the company’s next-generation power systems, designed for applications ranging from remote defense installations to lunar surface missions. Jordan’s background spans multidisciplinary engineering, entrepreneurship, and federal policy via the White House Office of Management and Budget. He holds degrees in Systems Engineering, Physics, and Statistics from George Mason University and Georgetown University, and is driven by the belief that nuclear power is a key enabler for resilience, space exploration, space superiority, and next-generation missile defense.'
			},
			{
				name: 'Rian Bahran',
				role: 'Chief Nuclear Officer',
				image: { src: portrait, alt: 'Portrait of Rian Bahran' },
				bio: placeholderBio
			},
			{
				name: 'Mark Massie',
				role: 'Chief Engineer',
				image: { src: portrait, alt: 'Portrait of Mark Massie' },
				bio: placeholderBio
			},
			{
				name: 'Will Madsen',
				role: 'Head of Mission Engineering',
				image: { src: portrait, alt: 'Portrait of Will Madsen' },
				bio: placeholderBio
			},
			{
				name: 'Nader Satvat',
				role: 'Head of Nuclear Engineering',
				image: { src: portrait, alt: 'Portrait of Nader Satvat' },
				bio: placeholderBio
			},
			{
				name: 'Reuven Fridmar',
				role: 'Head of Talent',
				image: { src: portrait, alt: 'Portrait of Reuven Fridmar' },
				bio: placeholderBio
			},
			{
				name: 'Tom Mancinelli',
				role: 'Head of Strategy & Policy',
				image: { src: portrait, alt: 'Portrait of Tom Mancinelli' },
				bio: placeholderBio
			},
			{
				name: 'Alec Todryk',
				role: 'Head of Finance',
				image: { src: portrait, alt: 'Portrait of Alec Todryk' },
				bio: placeholderBio
			},
			{
				name: 'Christian Kalin',
				role: 'Head of Operations',
				image: { src: portrait, alt: 'Portrait of Christian Kalin' },
				bio: placeholderBio
			},
			{
				name: 'Doug Crawford',
				role: 'Head of Manufacturing & Test Engineering',
				image: { src: portrait, alt: 'Portrait of Doug Crawford' },
				bio: placeholderBio
			},
			{
				name: 'Scott Walsh',
				role: 'Head of Reactor Hardware Engineering',
				image: { src: portrait, alt: 'Portrait of Scott Walsh' },
				bio: placeholderBio
			},
			{
				name: 'Jason Andrus',
				role: 'Head of Nuclear Ops & Regulatory',
				image: { src: portrait, alt: 'Portrait of Jason Andrus' },
				bio: placeholderBio
			},
			{
				name: 'Matt Griffin',
				role: 'Head of Nuclear Affairs',
				image: { src: portrait, alt: 'Portrait of Matt Griffin' },
				bio: placeholderBio
			}
		] satisfies Person[]
	},
	/** The title and every caption after the first are placeholders until their copy is written. */
	slideshow: {
		title: 'Antares Prime',
		slides: [
			{
				image: {
					src: slide01,
					alt: 'Aerial view of the Antares Prime steel frame and roof going up on a cleared site'
				},
				caption:
					'Antares Prime is a 322,000-square-foot facility in Torrance, California, designed to design, iterate, and build advanced defense microreactors under one roof.'
			},
			{
				image: {
					src: slide02,
					alt: 'A technician leaning in under a piece of reactor hardware'
				},
				caption: placeholderCaption
			},
			{
				image: {
					src: slide03,
					alt: 'Black-and-white photo from above of a technician in a hard hat fitting lifting slings to a reactor component'
				},
				caption: placeholderCaption
			},
			{
				image: {
					src: slide04,
					alt: 'Archival photo of a small metal test building and fuel tank on open, flat ground'
				},
				caption: placeholderCaption
			},
			{
				image: {
					src: slide05,
					alt: 'Aerial view of a test site on the plains, a crowd gathered among the low buildings'
				},
				caption: placeholderCaption
			},
			{
				image: {
					src: slide06,
					alt: 'Officials in suits cutting a ribbon with oversized scissors at the Antares opening'
				},
				caption: placeholderCaption
			}
		] satisfies Slide[]
	},
	/** Placeholders until the copy is written; the text keeps the length of the draft it replaced (634 characters). */
	summary: {
		title: '#Title',
		text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi sit reprehenderit.'
	},
	/** The points are placeholders until their copy is written. */
	culture: {
		title: 'Culture & Operations',
		intro:
			'Antares combines first-principles engineering with a high-velocity operating model to build scalable industrial infrastructure.',
		dark: { label: 'Scalable' },
		note: {
			label: 'Mission driven',
			statement: ['Mission-critical energy,', 'engineered for Earth and beyond.'],
			points: ['Bullet #1', 'Bullet #2', 'Bullet #3']
		},
		photo: {
			label: 'Iterative',
			background: {
				src: iterativeBackground,
				alt: 'Hazy aerial view of a reactor test site and its car park on open plains'
			},
			inset: {
				src: iterativeImage,
				alt: 'A technician leaning in under a piece of reactor hardware'
			}
		},
		join: {
			text: 'Come and do your life’s work. We are for the pragmatic dreamers.',
			/** The same call to action as the footer's. */
			link: footer.link
		}
	} satisfies FeatureCardsContent
};
