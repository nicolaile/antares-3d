/** Content for the Press page: how to reach the press team, and the press kit. */
import { updates } from './updates';

const email = 'press@antaresindustries.com';

export const press = {
	title: 'Press',
	// TODO(launch): replace the placeholder description (used for SEO only).
	intro: 'Press inquiries for Antares, and the press kit.',
	/** Where the form's messages go. */
	email,
	/** Before and after the address, which is a link. */
	note: ['For all press inquiries, please reach out to', 'or fill out the form.'],
	form: {
		name: 'Name',
		email: 'Email',
		message: 'Your Message',
		submit: 'Submit'
	},
	/** The same file as on Updates and Contact. */
	pressKit: updates.pressKit
};
