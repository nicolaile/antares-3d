/** Content for the Contact page: who to write to, and the press kit. */
import { updates } from './updates';

/** One way in: what it's for, and the address. */
export type Inquiry = { label: string; email: string };

export const contact = {
	title: 'Contact',
	// TODO(launch): replace the placeholder description (used for SEO only).
	intro: 'Get in touch with Antares about business, press or anything else.',
	inquiries: [
		{ label: 'Business inquiries:', email: 'sales@antaresnuclear.com' },
		{ label: 'General inquiries:', email: 'info@antaresnuclear.com' },
		// TODO(launch): confirm the press address; the design repeats the sales one.
		{ label: 'Press inquiries:', email: 'sales@antaresnuclear.com' }
	] satisfies Inquiry[],
	/** The same file as on Updates. */
	pressKit: updates.pressKit
};
