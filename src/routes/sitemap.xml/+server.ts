import { articles } from '$lib/content/articles';
import { site } from '$lib/content/site';

// Every page folder under src/routes, minus dynamic routes (listed below),
// route groups such as the local (lab), and the dev-only design system.
const pages = Object.keys(import.meta.glob('/src/routes/**/+page.svelte'))
	.filter((file) => !/[[(]|design-system/.test(file))
	.map((file) => file.replace(/^\/src\/routes/, '').replace(/\/\+page\.svelte$/, '') || '/');

export const prerender = true;

export const GET = () => {
	const paths = [...pages, ...articles.map(({ slug }) => `/updates/${slug}`)];
	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((path) => `\t<url><loc>${new URL(path, site.url).href}</loc></url>`).join('\n')}
</urlset>
`;
	return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
