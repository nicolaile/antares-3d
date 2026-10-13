<!--
	@component
	An image on a fixed aspect ratio, filling its cell. Sources come from
	`?enhanced` imports (AVIF/WebP at several widths), so set `sizes`.
	Without a `src` it renders an empty placeholder that holds the layout.
	A block-level span, not a div, so it can sit inside a button or link.
-->
<script lang="ts">
	import type { Picture } from 'vite-imagetools';

	let {
		src,
		alt = '',
		ratio,
		sizes = '100vw',
		fit = 'cover',
		surface = false,
		loading = 'lazy',
		priority = false
	}: {
		src?: Picture;
		alt?: string;
		/** CSS aspect-ratio, e.g. `'3 / 2'`. */
		ratio: string;
		/** Rendered width per breakpoint, e.g. `'(max-width: 767px) 100vw, 40vw'`. */
		sizes?: string;
		fit?: 'cover' | 'contain';
		/** Grey panel behind the image, for cut-outs and placeholders. */
		surface?: boolean;
		loading?: 'lazy' | 'eager';
		/** Above the fold (a hero): fetched ahead of the page's other images. */
		priority?: boolean;
	} = $props();
</script>

<span class="picture" class:surface class:contain={fit === 'contain'} style:aspect-ratio={ratio}>
	{#if src}
		<enhanced:img {src} {alt} {sizes} {loading} fetchpriority={priority ? 'high' : undefined} />
	{/if}
</span>

<style>
	.picture {
		display: block;
		position: relative;
		overflow: hidden;
	}
	.surface {
		background: var(--grey-50);
	}
	.picture :global(picture),
	.picture :global(img) {
		display: block;
		width: 100%;
		height: 100%;
	}
	.picture :global(img) {
		object-fit: cover;
	}
	.contain :global(img) {
		object-fit: contain;
	}
</style>
