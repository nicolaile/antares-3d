<!--
	@component
	An image on a fixed aspect ratio, filling whatever grid cell it's in.
	Sources come from `?enhanced` imports, so every image ships as AVIF/WebP
	at several widths; `sizes` tells the browser which one to pick.

	Without a `src` it renders the empty surface — a placeholder that already
	holds the layout.
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
		loading = 'lazy'
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
	} = $props();
</script>

<div class="picture" class:surface class:contain={fit === 'contain'} style:aspect-ratio={ratio}>
	{#if src}
		<enhanced:img {src} {alt} {sizes} {loading} />
	{/if}
</div>

<style>
	.picture {
		position: relative;
		overflow: hidden;
	}
	.surface {
		background: var(--grey-100);
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
