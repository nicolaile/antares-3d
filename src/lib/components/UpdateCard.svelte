<!--
	@component
	One item in the updates grid: the image (456×277 at 1440, a grey box
	until it has one), then the date and the title under it. The whole card
	is the link.
-->
<script lang="ts">
	import type { Picture as Source } from 'vite-imagetools';
	import Picture from './Picture.svelte';

	let {
		date,
		label,
		href,
		image
	}: {
		date: string;
		label: string;
		href: string;
		image?: { src: Source; alt: string };
	} = $props();
</script>

<a class="card" {href}>
	<div class="image">
		<Picture
			src={image?.src}
			alt={image?.alt}
			ratio="456 / 277"
			sizes="(max-width: 767px) 100vw, (max-width: 991px) 50vw, 33vw"
		/>
	</div>
	<p class="date type-caption">{date}</p>
	<p class="title type-paragraph">{label}</p>
</a>

<style>
	.card {
		display: grid;
		color: inherit;
		text-decoration: none;
	}
	.card:focus-visible {
		outline: 1px solid var(--grey-0);
		outline-offset: 2px;
	}

	.image {
		overflow: hidden;
		border-radius: var(--card-radius);
		background: var(--grey-800);
	}

	.date,
	.title {
		margin: 0;
	}
	.date {
		margin-top: var(--space-16);
		color: var(--grey-400);
	}
	.title {
		margin-top: var(--space-24);
		/* Wraps short of the image's edge, as in the design. */
		max-width: 75%;
	}
</style>
