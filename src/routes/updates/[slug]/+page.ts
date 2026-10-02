import { error } from '@sveltejs/kit';
import { articles } from '$lib/content/articles';

export const prerender = true;

/** Every article is built ahead of time, from the updates list. */
export const entries = () => articles.map(({ slug }) => ({ slug }));

export const load = ({ params }) => {
	const article = articles.find((a) => a.slug === params.slug);
	if (!article) error(404, 'Not found');
	return { article };
};
