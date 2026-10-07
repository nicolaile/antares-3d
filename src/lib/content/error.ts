/**
 * Content for the error page: a 404 set in a field of stars, with Antares
 * itself as the way home.
 */
export const error = {
	notFound: {
		title: '404',
		intro: 'This page has drifted out of range. Nothing we’ve charted sits at these coordinates.'
	},
	/** Anything other than a 404: the status code stands in for the title. */
	other: {
		intro: 'Something went wrong on our side. Try again in a moment, or head back home.'
	},
	home: { label: 'Go to homepage', href: '/' },
	/** The star you click to get home. Antares is roughly 550 light years out. */
	star: { name: 'Antares', label: 'DIST', distance: '~550 LY' }
};
