<!--
	@component
	A product on a dark card the full width of the grid: its name and a
	line about it centred at the top, a video of it in the middle, sitting on the card's foot, and a
	short line with a call to action in the bottom-left corner. The video
	plays once, when you first scroll down to the card, and holds on its
	last frame. It loads only as the card nears, not with the page. A
	cut-out image can stand in for the video, centred in the space under the
	title. On phones the copy follows the video or image.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Button from '$lib/components/Button.svelte';
	import Picture from '$lib/components/Picture.svelte';
	import WipBadge from '$lib/components/WipBadge.svelte';
	import type { Picture as PictureSource } from 'vite-imagetools';
	import type { Link } from '$lib/content/site';

	let {
		title,
		subtitle,
		video,
		image,
		text,
		link
	}: {
		title: string;
		/** Under the name, in grey. */
		subtitle?: string;
		/** A muted clip of the product, played once; `start` (seconds) skips a dark lead-in. */
		video?: { src: string; label: string; start?: number };
		/** A cut-out of the product (transparent PNG), in the video's place; `wip` tags it as a stand-in. */
		image?: { src: PictureSource; alt: string; wip?: boolean };
		text: string;
		link: Link;
	} = $props();

	let player = $state<HTMLVideoElement>();
	/** The card is near: the clip gets its source, and starts loading. */
	let near = $state(false);

	onMount(() => {
		if (!player) return;
		const card = player.closest('section')!;
		// Loads the clip a screen and a half before the card, so it's ready
		// by the time it's reached, without weighing on the page's own load.
		const coming = new IntersectionObserver(
			([entry]) => {
				if (!entry.isIntersecting) return;
				near = true;
				coming.disconnect();
			},
			{ rootMargin: '150% 0px' }
		);
		// Plays it once, as soon as a little of the card (15%) is on screen.
		// Reached in a jump, the source is set first, then it plays.
		const seen = new IntersectionObserver(
			async ([entry]) => {
				if (!entry.isIntersecting) return;
				seen.disconnect();
				near = true;
				await tick();
				player?.play().catch(() => {});
			},
			{ threshold: 0.15 }
		);
		coming.observe(card);
		seen.observe(card);
		return () => {
			coming.disconnect();
			seen.disconnect();
		};
	});
</script>

<section class="card" data-tone="dark" aria-label={title}>
	<h2 class="title type-h4">
		{title}
		{#if subtitle}<span class="subtitle">{subtitle}</span>{/if}
	</h2>
	{#if image}
		<div class="still" style:aspect-ratio="{image.src.img.w} / {image.src.img.h}">
			<Picture src={image.src} alt={image.alt} ratio="{image.src.img.w} / {image.src.img.h}" fit="contain" sizes="(max-width: 767px) 100vw, 50vw" />
			{#if image.wip}<WipBadge label="3D model · WIP" />{/if}
		</div>
	{:else if video}
		<video
			class="video"
			src={near ? (video.start ? `${video.src}#t=${video.start}` : video.src) : undefined}
			aria-label={video.label}
			muted
			playsinline
			preload="auto"
			bind:this={player}
		></video>
	{/if}
	<div class="copy">
		<p class="text type-caption">{text}</p>
		<Button {...link} />
	</div>
</section>

<style>
	/* 1400 × 800 at 1440. */
	.card {
		position: relative;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		justify-items: center;
		aspect-ratio: 1400 / 800;
		overflow: hidden;
		border-radius: var(--card-radius);
		background: var(--grey-850);
		color: var(--grey-0);
	}
	/* 15em wraps the line under it in two, as in the design. */
	.title {
		max-width: 15em;
		margin: 0;
		padding-top: var(--space-40);
		text-align: center;
	}
	.subtitle {
		display: block;
		color: var(--grey-400);
	}
	/* Centred, its foot on the card's: the clip's frame cuts the vessel off
	   at the bottom, and the card's edge hides that cut. 112% of the space
	   under the title, so the reactor rises into the clip's dark headroom
	   behind it. Shot on black:
	   lighten lets the card's grey through it, so it shows no box. */
	.video {
		mix-blend-mode: lighten;
		align-self: end;
		display: block;
		width: auto;
		height: 112%;
		max-width: 100%;
		object-fit: contain;
	}

	/* The cut-out, centred in the space under the title, with room around
	   it: 80% of that height. */
	.still {
		position: relative;
		align-self: center;
		height: 80%;
	}
	.still :global(.picture) {
		height: 100%;
	}

	/* Three columns of the twelve, from the card's bottom-left corner. */
	.copy {
		position: absolute;
		bottom: var(--space-24);
		left: var(--space-20);
		display: grid;
		justify-items: start;
		gap: var(--space-24);
		width: calc((100% - 11 * var(--grid-gutter)) / 12 * 3 + 2 * var(--grid-gutter));
	}
	.text {
		margin: 0;
		color: var(--grey-400);
	}

	@media screen and (max-width: 767px) {
		.card {
			aspect-ratio: auto;
			grid-template-rows: auto auto auto;
		}
		.video {
			width: 100%;
			height: auto;
			margin-top: var(--space-24);
			margin-bottom: 0;
		}
		.still {
			width: 80%;
			height: auto;
			margin-top: var(--space-24);
		}
		.copy {
			position: static;
			justify-self: start;
			width: auto;
			padding: var(--space-24) var(--space-20);
		}
	}
</style>
