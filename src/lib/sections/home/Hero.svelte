<!--
	@component
	Home's opening screen: the wordmark and a short intro above a full-bleed
	image or video with parallax. On scroll the wordmark rides up and shrinks
	into the top-left corner, then pins there and behaves like BrandMark.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Picture as PictureSource } from 'vite-imagetools';
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import Picture from '$lib/components/Picture.svelte';
	import LoopVideo from '$lib/components/LoopVideo.svelte';
	import PauseButton from '$lib/components/PauseButton.svelte';
	import Wordmark from '$lib/components/Wordmark.svelte';
	import { initScroll, destroyScroll, gsap, ScrollTrigger, prefersReducedMotion } from '$lib/motion/scroll';
	import { header, markTone, slideWithHeader } from '$lib/chrome/header.svelte';

	let {
		title,
		text,
		image,
		video
	}: {
		title: string;
		text: string;
		image: { src: PictureSource; alt: string };
		/** Loops in the image's place, the image as poster. Decorative: the intro says what the page is. */
		video?: string;
	} = $props();

	let paused = $state(false);

	let brand: HTMLElement;
	let mark: HTMLElement;
	let mask: HTMLElement;
	let photo: HTMLElement;
	/** Pinned in the corner; from then on it hides with the header, like BrandMark. */
	let rested = $state(false);

	onMount(() => {
		initScroll();
		const unit = () => parseFloat(getComputedStyle(document.body).fontSize);
		/** Keep in step with app.css --wordmark-rest. */
		const REST = 1.25;
		// Centred in the header band; 4.25 is app.css --header-height, keep in step.
		const restTop = () => unit() * (4.25 / 2 - REST / 2);

		const ctx = gsap.context(() => {
			// Pins when its bottom edge (anchored to the image) is REST below
			// restTop, where the shrunk mark's top lands.
			const pin = ScrollTrigger.create({
				trigger: brand,
				start: () => `bottom ${restTop() + unit() * REST}px`,
				end: 'max',
				pin: true,
				pinSpacing: false,
				onToggle: (self) => (rested = self.isActive)
			});
			// Shrinks to REST tall, landing as it pins. Scaled from its
			// bottom-left corner so its gap to the image holds.
			gsap.to(mark, {
				scale: () => (unit() * REST) / mark.offsetHeight,
				ease: 'none',
				scrollTrigger: {
					start: 0,
					end: () => Math.max(1, pin.start),
					scrub: true,
					invalidateOnRefresh: true
				}
			});

			// Drift; keep 0.4 in step with .photo's inset.
			if (!prefersReducedMotion()) {
				gsap.fromTo(
					photo,
					{ y: 0 },
					{
						y: () => mask.offsetHeight * 0.4,
						ease: 'none',
						scrollTrigger: {
							trigger: mask,
							start: 0,
							end: 'bottom top',
							scrub: true,
							invalidateOnRefresh: true
						}
					}
				);
			}
		});
		document.fonts.ready.then(() => ScrollTrigger.refresh());

		return () => {
			ctx.revert();
			destroyScroll();
		};
	});
</script>

<section class="hero">
	<h1 class="visually-hidden">Antares</h1>
	<div class="intro">
		<Row align="end" gap={40}>
			<Cell span={6} mobile={{ span: 12 }}>
				<div class="brand" bind:this={brand} {@attach markTone}>
					<!-- Slides with the header; the link inside scales on its own. -->
					<div {@attach slideWithHeader(() => rested && header.hidden)}>
						<a class="home" href="/" aria-label="Antares home" bind:this={mark}>
							<Wordmark />
						</a>
					</div>
				</div>
			</Cell>
			<Cell start={10} span={3} tablet={{ start: 8, span: 5 }} mobile={{ span: 12 }}>
				<p class="blurb type-body-default">
					<span class="title">{title}</span>
					<span class="text">{text}</span>
				</p>
			</Cell>
		</Row>
	</div>

	<div class="mask" data-tone="dark" data-header="light" bind:this={mask}>
		<div class="photo" bind:this={photo}>
			{#if video}
				<!-- Its button sits on the mask, not the drifting photo. -->
				<LoopVideo src={video} poster={image.src.img.src} button={false} bind:paused />
			{:else}
				<Picture {...image} ratio="auto" sizes="100vw" loading="eager" priority />
			{/if}
		</div>
		{#if video}
			<div class="pause">
				<PauseButton bind:paused label="Pause video" tone="dark" />
			</div>
		{/if}
	</div>
</section>

<style>
	.hero {
		position: relative;
	}

	.intro {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		box-sizing: border-box;
		height: calc(var(--size-font) * 19.25);
		padding: 0 var(--grid-margin) var(--space-24);
	}

	/* Above the page once pinned, below the menu (z-index 50). */
	.brand {
		position: relative;
		z-index: 40;
		color: var(--black);
	}
	.home {
		display: block;
		width: fit-content;
		height: calc(var(--size-font) * 4.5);
		color: inherit;
		transform-origin: 0 100%;
	}
	.home:focus-visible {
		outline: 1px solid currentColor;
		outline-offset: 4px;
	}

	/* Trims the line height's space under the text so its last baseline
	   sits a set distance above the wordmark's bottom edge. */
	.blurb {
		display: grid;
		margin: 0;
		padding-bottom: var(--space-8);
		text-box: trim-end cap alphabetic; /* check-system: allow — trims the blurb's foot only */
	}
	/* Breaks where the copy does. */
	.title {
		margin-bottom: var(--space-8);
		color: var(--black);
		white-space: pre-line;
	}
	/* Caption type without the caption class's trim. */
	.text {
		max-width: calc(var(--size-font) * 18.5);
		color: var(--grey-700);
		font-size: var(--type-caption-size); /* check-system: allow — caption tokens */
		line-height: var(--type-caption-leading); /* check-system: allow */
		letter-spacing: var(--type-caption-tracking); /* check-system: allow */
	}

	/* The photo is 40% taller than its mask and starts raised by that much,
	   so it can drift down without opening a gap. Keep in step with the
	   script's drift. */
	.mask {
		position: relative;
		height: 100svh;
		min-height: calc(var(--size-font) * 40);
		overflow: clip;
		background: var(--grey-50);
	}
	.photo {
		position: absolute;
		inset: -40% 0 0;
		will-change: transform;
	}
	.photo :global(.picture) {
		height: 100%;
	}
	.photo :global(.loop-video) {
		height: 100%;
		object-fit: cover;
	}
	.pause {
		position: absolute;
		right: var(--space-16);
		bottom: var(--space-16);
	}

	@media screen and (max-width: 767px) {
		.intro {
			height: auto;
			padding-top: var(--space-120);
		}
		/* About 5:1, so this keeps it inside a phone's width. */
		.home {
			height: calc(var(--size-font) * 3.25);
		}
	}
</style>
