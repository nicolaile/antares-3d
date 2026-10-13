<!--
	@component
	A page's title, description, canonical link and share card (Open Graph,
	X). Every page renders one; leave `title` out on the home page.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { site } from '$lib/content/site';

	let {
		title,
		description = site.description,
		image = site.image,
		type = 'website',
		noindex = false
	}: {
		/** The page's own name, before " — Antares". */
		title?: string;
		description?: string;
		/** An absolute path or URL, ideally 1200×630. */
		image?: string;
		type?: 'website' | 'article';
		noindex?: boolean;
	} = $props();

	const fullTitle = $derived(title ? `${title} — ${site.name}` : `${site.name} — R1 Microreactor`);
	const url = $derived(new URL(page.url.pathname, site.url).href);
	const imageUrl = $derived(new URL(image, site.url).href);
</script>

<svelte:head>
	<title>{fullTitle}</title>
	<meta name="description" content={description} />
	{#if noindex}
		<meta name="robots" content="noindex" />
	{:else}
		<link rel="canonical" href={url} />
	{/if}
	<meta property="og:site_name" content={site.name} />
	<meta property="og:type" content={type} />
	<meta property="og:title" content={fullTitle} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={url} />
	<meta property="og:image" content={imageUrl} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>
