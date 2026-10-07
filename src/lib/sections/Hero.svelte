<!--
	@component
	The opening screen: the wordmark and a short intro above a full-bleed
	image.

	On scroll the image's mask rises with the page while the photo inside
	moves slower, a parallax. The wordmark rides up with it, shrinking to
	12px tall, until it reaches the top-left corner — level with the menu
	button — and stays there for the rest of the page. (The latest updates
	live in the menu.)
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Picture as PictureSource } from 'vite-imagetools';
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import Picture from '$lib/components/Picture.svelte';
	import Wordmark from '$lib/components/Wordmark.svelte';
	import { initScroll, destroyScroll, gsap, ScrollTrigger, prefersReducedMotion } from '$lib/scroll';

	let {
		title,
		text,
		image
	}: {
		title: string;
		text: string;
		image: { src: PictureSource; alt: string };
	} = $props();

	let brand: HTMLElement;
	let mark: HTMLElement;
	let mask: HTMLElement;
	let photo: HTMLElement;

	onMount(() => {
		initScroll();
		const unit = () => parseFloat(getComputedStyle(document.body).fontSize);
		/** The wordmark's height once it's in the corner, in units: --wordmark-rest (12px at 1440). */
		const REST = 0.75;
		// Where the wordmark comes to rest: centred on the 34px menu button,
		// which sits one page margin (--page-margin, 1.25 units) in from the top.
		const restTop = () => unit() * (1.25 + (2.125 - REST) / 2);

		const ctx = gsap.context(() => {
			// Rides the page up with the image, then holds in the corner. It
			// pins when its bottom edge — the one anchored to the image — is
			// REST below restTop, which is where the shrunk mark's top lands.
			const pin = ScrollTrigger.create({
				trigger: brand,
				start: () => `bottom ${restTop() + unit() * REST}px`,
				end: 'max',
				pin: true,
				pinSpacing: false
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
	<div class="intro">
		<Row align="end" gap={40}>
			<Cell span={6} mobile={{ span: 12 }}>
				<div class="brand" bind:this={brand}>
					<a class="home" href="/" aria-label="Antares home" bind:this={mark}>
						<Wordmark />
					</a>
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

	<div class="mask" data-tone="dark" bind:this={mask}>
		<div class="photo" bind:this={photo}>
			<Picture {...image} ratio="auto" sizes="100vw" loading="eager" priority />
		</div>
	</div>
</section>

<style>
	/* The intro, then an image a full screen tall, so it runs on past the
	   first screen by the intro's height. */
	.hero {
		position: relative;
	}

	/* 356px tall at 1440, its content sitting on the bottom edge. */
	.intro {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		box-sizing: border-box;
		height: calc(var(--size-font) * 22.25);
		padding: 0 var(--grid-margin) var(--space-32);
	}

	/* Above the page and footer once pinned, below the menu (z-index 50).
	   White with a difference blend, so it reads black on the page and
	   white over the image and the footer. */
	.brand {
		position: relative;
		z-index: 40;
		mix-blend-mode: difference;
		color: var(--grey-0);
	}
	/* ScrollTrigger wraps the pinned wordmark in a spacer that copies its
	   z-index, which isolates the blend inside it; the spacer blends too. */
	:global(.pin-spacer:has(> .brand)) {
		mix-blend-mode: difference;
	}
	/* 48px tall at 1440 (12px once it has shrunk into the corner). */
	.home {
		display: block;
		width: fit-content;
		height: calc(var(--size-font) * 3);
		color: inherit;
		transform-origin: 0 100%;
	}
	.home:focus-visible {
		outline: 1px solid currentColor;
		outline-offset: 4px;
	}

	.blurb {
		display: grid;
		margin: 0;
	}
	.title {
		color: var(--grey-950);
	}
	.text {
		color: var(--grey-700);
	}

	/* Full bleed. The photo is 40% taller than its mask and starts raised
	   by that much, so it can drift down without opening a gap. Keep the
	   inset in step with the drift in the script. */
	.mask {
		position: relative;
		height: 100svh;
		min-height: calc(var(--size-font) * 40);
		overflow: clip;
		background: var(--grey-100);
	}
	.photo {
		position: absolute;
		inset: -40% 0 0;
		will-change: transform;
	}
	.photo :global(.picture) {
		height: 100%;
	}

	@media screen and (max-width: 767px) {
		/* The intro stacks, wordmark over the blurb, so it sizes to fit. */
		.intro {
			height: auto;
			padding-top: var(--space-120);
		}
		/* The wordmark is about 10.9 times as wide as it is tall: 30px tall
		   keeps it inside a phone's width (about 326px at 390). */
		.home {
			height: calc(var(--size-font) * 1.875);
		}
	}
</style>
