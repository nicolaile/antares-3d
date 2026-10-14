import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

// A reference for developers, not a page of the site.
export const prerender = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
};
