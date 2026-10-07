<!--
	@component
	One item in the updates grid: the image (456×277 at 1440, a grey box
	until it has one), then the date and the title under it. The whole card
	is the link.

	On hover the date brightens and a right arrow slides in beside it.
-->
<script lang="ts">
	import type { Picture as Source } from 'vite-imagetools';
	import Picture from './Picture.svelte';
	import arrow from '$lib/assets/icons/right-arrow.svg?raw';

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
	<div class="meta">
		<p class="date type-caption">{date}</p>
		<span class="arrow" aria-hidden="true">{@html arrow}</span>
	</div>
	<p class="title type-h4">{label}</p>
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
	.meta {
		display: flex;
		align-items: center;
		gap: var(--space-8);
		margin-top: var(--space-16);
	}
	.date {
		color: var(--grey-400);
		/* Fades with the arrow, on its curve. */
		transition: color 0.5s cubic-bezier(0.625, 0.05, 0, 1);
	}
	.card:hover .date {
		color: var(--grey-0);
	}

	.title {
		margin-top: var(--space-24);
		/* Wraps short of the image's edge, as in the design. */
		max-width: 75%;
	}

	/* The arrow: the caption's size, hidden a little to the left until
	   hover, then sliding in as the date brightens. */
	.arrow {
		display: block;
		width: var(--type-caption-size);
		height: var(--type-caption-size);
		color: var(--grey-0);
		opacity: 0;
		transform: translateX(-50%);
		transition:
			opacity 0.5s cubic-bezier(0.625, 0.05, 0, 1),
			transform 0.5s cubic-bezier(0.625, 0.05, 0, 1);
	}
	.arrow :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
	@media (hover: hover) and (pointer: fine) {
		.card:hover .arrow {
			opacity: 1;
			transform: none;
		}
	}
</style>
