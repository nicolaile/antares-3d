<!--
	@component
	One item in the updates grid: the image (456×277 at 1440, a grey box
	until it has one), then the date and the title under it. The whole card
	is the link.

	On hover the date brightens and a right arrow slides in beside it.
	On a dark page (the updates list) by default; `tone="light"` for a
	light one (an article's recent articles).
-->
<script lang="ts">
	import type { Picture as Source } from 'vite-imagetools';
	import Picture from '$lib/components/Picture.svelte';
	import arrow from '$lib/assets/icons/right-arrow.svg?raw';

	let {
		date,
		label,
		href,
		image,
		tone = 'dark'
	}: {
		date: string;
		label: string;
		href: string;
		image?: { src: Source; alt: string };
		/** The page it sits on. */
		tone?: 'dark' | 'light';
	} = $props();
</script>

<a class="card" class:light={tone === 'light'} {href}>
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
	<p class="title type-sub-headline">{label}</p>
</a>

<style>
	.card {
		/* Dark page: a dark stand-in box, the date brightening to white. */
		--card-box: var(--grey-900);
		--card-date: var(--grey-400);
		--card-strong: var(--white);
		display: grid;
		color: inherit;
		text-decoration: none;
	}
	/* Light page: a light grey box, the date darkening to black. */
	.card.light {
		--card-box: var(--grey-50);
		--card-date: var(--grey-700);
		--card-strong: var(--black);
	}
	.card:focus-visible {
		outline: 1px solid var(--card-strong);
		outline-offset: 2px;
	}

	.image {
		overflow: hidden;
		border-radius: var(--card-radius);
		background: var(--card-box);
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
		color: var(--card-date);
		/* Fades with the arrow, on its curve. */
		transition: color 0.5s cubic-bezier(0.625, 0.05, 0, 1);
	}
	.card:hover .date {
		color: var(--card-strong);
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
		color: var(--card-strong);
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
