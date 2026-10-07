/**
 * Content for the legal pages: the Terms of Use and the Privacy Policy. The
 * copy is a placeholder until legal supplies the real text; each entry in
 * `body` is one paragraph, and `updated` is dd.mm.yyyy, as the design shows it.
 */
export type LegalPage = {
	title: string;
	description: string;
	updated: string;
	body: string[];
};

const termsPlaceholder =
	'Please carefully read the following terms and conditions of use and all other rules, policies and guidelines that may be communicated from time to time through the Site (collectively, “Terms of Use”). By using this Site you agree to be bound by and comply with these Terms of Use. If you do not agree to the Terms of Use, do not use this Site.';

const privacyPlaceholder =
	'This Privacy Policy describes how Antares Nuclear, Inc. (“Antares”, “we”, “us”) collects, uses and shares information about you when you visit this Site or otherwise interact with us. By using this Site you acknowledge the practices described in this Privacy Policy. If you do not agree with this Privacy Policy, do not use this Site.';

export const terms: LegalPage = {
	title: 'Terms of use',
	description: 'The terms and conditions for using the Antares website.',
	updated: '27.09.2024',
	body: [
		[termsPlaceholder, termsPlaceholder, termsPlaceholder].join(' '),
		[termsPlaceholder, termsPlaceholder, termsPlaceholder].join(' ')
	]
};

export const privacy: LegalPage = {
	title: 'Privacy policy',
	description: 'How Antares collects, uses and shares information about you.',
	updated: '27.09.2024',
	body: [
		[privacyPlaceholder, privacyPlaceholder, privacyPlaceholder].join(' '),
		[privacyPlaceholder, privacyPlaceholder, privacyPlaceholder].join(' ')
	]
};
