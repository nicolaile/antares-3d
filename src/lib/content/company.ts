/**
 * Content for the Company page. The leadership team is a placeholder, the
 * one example portrait and bio repeated, until the real team's photos,
 * roles and bios are in.
 */
import type { Picture } from 'vite-imagetools';
// 338px cards at 1440; the source is 996px wide.
import employee from '$lib/assets/images/company/employee_example.jpg?w=996;676;338&enhanced';

/** One person in the leadership grid. */
export type Person = {
	name: string;
	role: string;
	image: { src: Picture; alt: string };
	/** Shown in the panel that opens from their card. */
	bio: string;
};

const bio =
	'Jordan Bramble leads Antares as CEO and Co-Founder, guiding the company’s mission to deliver reliable fission power for the toughest environments on Earth and beyond. Since launching Antares in 2023, he has overseen more than $130 million in fundraising and built the foundation for the company’s next-generation power systems, designed for applications ranging from remote defense installations to lunar surface missions. Jordan’s background spans multidisciplinary engineering, entrepreneurship, and federal policy via the White House Office of Management and Budget. He holds degrees in Systems Engineering, Physics, and Statistics from George Mason University and Georgetown University, and is driven by the belief that nuclear power is a key enabler for resilience, space exploration, space superiority, and next-generation missile defense.';

export const company = {
	title: 'Company',
	intro: 'Antares provides the infrastructure to make the financial ecosystem',
	leadership: {
		label: 'Leadership',
		people: Array.from(
			{ length: 14 },
			(): Person => ({
				name: 'Jordan Bramble',
				role: 'CEO Co-founder',
				image: {
					src: employee,
					alt: 'Black-and-white portrait of Jordan Bramble in a cap, leaning against a wall'
				},
				bio
			})
		)
	}
};
