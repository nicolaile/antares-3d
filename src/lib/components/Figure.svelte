<!--
	@component
	A picture with a caption line under it.
-->
<script lang="ts">
	import type { Picture as PictureSource } from 'vite-imagetools';
	import Picture from './Picture.svelte';

	let {
		src,
		alt = '',
		ratio,
		sizes,
		caption,
		surface = true
	}: {
		src?: PictureSource;
		alt?: string;
		ratio: string;
		sizes?: string;
		caption?: string;
		surface?: boolean;
	} = $props();
</script>

<figure class="figure">
	<Picture {src} {alt} {ratio} {sizes} {surface} />
	{#if caption}<figcaption class="type-body">{caption}</figcaption>{/if}
</figure>

<style>
	.figure {
		display: grid;
		gap: var(--space-12);
		margin: 0;
	}
</style>
