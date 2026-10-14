<!--
	@component
	One item in the updates grid: image (a grey box until it has one), date
	and title, the whole card a link. On hover an arrow slides in by the date.
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
		/** The page it sits on: `light` for an article's recent articles. */
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
		--card-box: var(--grey-900);
		--card-date: var(--grey-400);
		--card-strong: var(--white);
		display: grid;
		color: inherit;
		text-decoration: none;
	}
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
		/* On the arrow's curve. */
		transition: color 0.5s cubic-bezier(0.625, 0.05, 0, 1);
	}
	.card:hover .date {
		color: var(--card-strong);
	}

	.title {
		margin-top: var(--space-24);
		max-width: 75%;
	}

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
