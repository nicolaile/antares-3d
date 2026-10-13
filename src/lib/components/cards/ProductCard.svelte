<!--
	@component
	A product on a full-width dark card: name, a video (or cut-out image) and
	a call to action. The video loads as the card nears, plays once when the
	card is reached and holds on its last frame.
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
		subtitle?: string;
		/** `start` (seconds) skips a dark lead-in. */
		video?: { src: string; label: string; start?: number };
		/** A transparent cut-out in the video's place; `wip` tags it as a stand-in. */
		image?: { src: PictureSource; alt: string; wip?: boolean };
		text: string;
		link: Link;
	} = $props();

	let player = $state<HTMLVideoElement>();
	/** Set as the card nears; gives the video its source. */
	let near = $state(false);

	onMount(() => {
		if (!player) return;
		const card = player.closest('section')!;
		// A screen and a half early, so it's ready without weighing on page load.
		const coming = new IntersectionObserver(
			([entry]) => {
				if (!entry.isIntersecting) return;
				near = true;
				coming.disconnect();
			},
			{ rootMargin: '150% 0px' }
		);
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
	<h2 class="title type-sub-headline">
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
	.card {
		position: relative;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		justify-items: center;
		aspect-ratio: 1400 / 800;
		overflow: hidden;
		border-radius: var(--card-radius);
		background: var(--grey-950);
		color: var(--white);
	}
	/* Wraps the subtitle onto two lines. */
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
	/* Foot on the card's edge, which hides where the frame cuts the vessel
	   off; 112% so it rises into the clip's dark headroom. Shot on black, so
	   lighten lets the card's grey through with no visible box. */
	.video {
		mix-blend-mode: lighten;
		align-self: end;
		display: block;
		width: auto;
		height: 112%;
		max-width: 100%;
		object-fit: contain;
	}

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
