<!--
	@component
	The opening screen: the wordmark and a short intro above a full-bleed
	image.

	On scroll the image's mask rises with the page while the photo inside
	moves slower, a parallax. The wordmark rides up with it, shrinking to
	20px tall, until it reaches the top-left corner — level with the menu
	button — and stays there for the rest of the page, sliding out of the way
	as the visitor scrolls down and back as they scroll up. (The latest
	updates live in the menu.)
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
	import { header, slideWithHeader } from '$lib/chrome/header.svelte';

	let {
		title,
		text,
		image,
		video
	}: {
		title: string;
		text: string;
		image: { src: PictureSource; alt: string };
		/**
		 * Plays in the image's place, muted and on a loop, the image its
		 * poster until it's ready (LoopVideo). Decorative: the intro says
		 * what the page is.
		 */
		video?: string;
	} = $props();

	/** The film's pause, held by the button over the image. */
	let paused = $state(false);

	let brand: HTMLElement;
	let mark: HTMLElement;
	let mask: HTMLElement;
	let photo: HTMLElement;
	/** In the corner and pinned there: from then on it hides and returns with the header, as BrandMark does. */
	let rested = $state(false);

	onMount(() => {
		initScroll();
		const unit = () => parseFloat(getComputedStyle(document.body).fontSize);
		/** The wordmark's height once it's in the corner, in units: --wordmark-rest (20px at 1440). */
		const REST = 1.25;
		// Where the wordmark comes to rest: centred on the 34px menu button,
		// which is centred in the 68px header band (--header-height, 4.25 units).
		const restTop = () => unit() * (4.25 / 2 - REST / 2);

		const ctx = gsap.context(() => {
			// Rides the page up with the image, then holds in the corner. It
			// pins when its bottom edge — the one anchored to the image — is
			// REST below restTop, which is where the shrunk mark's top lands.
			const pin = ScrollTrigger.create({
				trigger: brand,
				start: () => `bottom ${restTop() + unit() * REST}px`,
				end: 'max',
				pin: true,
				pinSpacing: false,
				onToggle: (self) => (rested = self.isActive)
			});
			// Shrinks the whole way up, from its hero size down to REST tall,
			// landing at the moment it pins. Scaled from its bottom-left
			// corner, so its gap to the image stays the same as it goes.
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

			// The photo drifts down inside its mask, 40% of the mask's height
			// over the time the mask takes to leave the screen.
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
	<!-- The wordmark is the page's name on screen; this names it for headings. -->
	<h1 class="visually-hidden">Antares</h1>
	<div class="intro">
		<Row align="end" gap={40}>
			<Cell span={6} mobile={{ span: 12 }}>
				<div class="brand" bind:this={brand}>
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

	<!-- Dark for the menu button, but the header bar over it stays white. -->
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
				<PauseButton bind:paused label="Pause video" />
			</div>
		{/if}
	</div>
</section>

<style>
	/* The intro, then an image a full screen tall, so it runs on past the
	   first screen by the intro's height. */
	.hero {
		position: relative;
	}

	/* 308px tall at 1440, its content sitting on the bottom edge. */
	.intro {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		box-sizing: border-box;
		height: calc(var(--size-font) * 19.25);
		/* 24px between the wordmark (and blurb) and the image. */
		padding: 0 var(--grid-margin) var(--space-24);
	}

	/* Above the page and footer once pinned, below the menu (z-index 50).
	   White with a difference blend, so it reads black on the page and
	   white over the image and the footer. */
	.brand {
		position: relative;
		z-index: 40;
		mix-blend-mode: difference;
		color: var(--white);
	}
	/* ScrollTrigger wraps the pinned wordmark in a spacer that copies its
	   z-index, which isolates the blend inside it; the spacer blends too. */
	:global(.pin-spacer:has(> .brand)) {
		mix-blend-mode: difference;
	}
	/* 72px tall at 1440 (20px once it has shrunk into the corner). */
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

	/* The space the line height leaves under the text is trimmed off, and
	   8px of padding set in its place: its last baseline 8px above the
	   wordmark's bottom edge, 32px above the image. */
	.blurb {
		display: grid;
		margin: 0;
		padding-bottom: var(--space-8);
		text-box: trim-end cap alphabetic; /* check-system: allow — trims the blurb's foot only */
	}
	/* 16px (body default), breaking where the copy does, 8px above the text. */
	.title {
		margin-bottom: var(--space-8);
		color: var(--black);
		white-space: pre-line;
	}
	/* Caption type without the caption's trim; a little narrower than its
	   column, 296px at 1440. */
	.text {
		max-width: calc(var(--size-font) * 18.5);
		color: var(--grey-700);
		font-size: var(--type-caption-size); /* check-system: allow — caption tokens */
		line-height: var(--type-caption-leading); /* check-system: allow */
		letter-spacing: var(--type-caption-tracking); /* check-system: allow */
	}

	/* Full bleed. The photo is 40% taller than its mask and starts raised
	   by that much, so it can drift down without opening a gap. Keep the
	   inset in step with the drift in the script. */
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
		/* The intro stacks, wordmark over the blurb, so it sizes to fit. */
		.intro {
			height: auto;
			padding-top: var(--space-120);
		}
		/* The wordmark is about 5 times as wide as it is tall: 52px tall
		   keeps it inside a phone's width (about 257px at 390). */
		.home {
			height: calc(var(--size-font) * 3.25);
		}
	}
</style>
