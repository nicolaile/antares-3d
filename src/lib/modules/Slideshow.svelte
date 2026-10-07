<!--
	@component
	A full-bleed dark band: its title (and, unless `count` is off, the number
	of images) centred at the top, then one image at a time on the middle
	six columns, its caption, if it has one, centred under it. The band's
	left and right halves are the Previous and Next buttons; it wraps round
	at either end. For now the image and caption change at once; with
	`ANIMATE` on, the new image slides in from the side it was asked for as
	the old one slides out the other way, and the captions cross-fade.

	Over either half a cursor label trails the pointer: "‹ Previous 01-08"
	or "Next 03-08 ›", the image it would go to, cut to the band. Sits
	outside anything transformed, like any CursorLabel.
-->
<script lang="ts">
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import Picture from '$lib/components/Picture.svelte';
	import CursorLabel from '$lib/components/CursorLabel.svelte';
	import chevronLeft from '$lib/assets/icons/chevron-left.svg?raw';
	import chevronRight from '$lib/assets/icons/chevron-right.svg?raw';
	import { gsap, prefersReducedMotion } from '$lib/scroll';
	import type { Slide } from '$lib/content/company';

	type Side = 'previous' | 'next';

	let {
		title,
		slides,
		count = true
	}: {
		title: string;
		slides: Slide[];
		/** Shows the number of images after the title: "Antares Prime (8)". */
		count?: boolean;
	} = $props();

	/** The image showing, from 0. */
	let current = $state(0);
	/** The half under the pointer. */
	let side = $state<Side | null>(null);
	/** Ties the labels to this band, should a page have two. */
	const id = $props.id();

	/** "02-08": the image `step` away from the current one, of how many. */
	function progress(step: number) {
		const n = slides.length;
		const pad = (i: number) => String(((i + n) % n) + 1).padStart(2, '0');
		return `${pad(current + step)}-${pad(n - 1)}`;
	}

	/** Off for now: the image and caption swap instantly. */
	const ANIMATE = false;
	const SLIDE = { duration: 1, ease: 'power3.inOut' };
	const FADE = { duration: 0.5, ease: 'power2.out' };

	let images: HTMLElement[] = $state([]);
	let captions: HTMLElement[] = $state([]);
	/** The slide in flight, so a quick second click finishes it first. */
	let tl: gsap.core.Timeline | null = null;

	function go(side: Side) {
		const n = slides.length;
		if (n < 2) return;
		tl?.progress(1);
		const from = current;
		const to = (from + (side === 'next' ? 1 : -1) + n) % n;
		const dir = side === 'next' ? 1 : -1;
		current = to;
		// The last fade-in leaves its caption visible inline; it's no longer current.
		if (captions[from]) gsap.set(captions[from], { clearProps: 'opacity,visibility' });
		if (!ANIMATE || prefersReducedMotion()) return;
		// The outgoing image is no longer current, so held up until it's gone.
		const out = images[from];
		tl = gsap
			.timeline({ onComplete: () => gsap.set(out, { clearProps: 'visibility,transform' }) })
			.set(out, { visibility: 'visible' }, 0)
			.fromTo(images[to], { xPercent: 100 * dir }, { xPercent: 0, ...SLIDE }, 0)
			.fromTo(out, { xPercent: 0 }, { xPercent: -100 * dir, ...SLIDE }, 0)
			.fromTo(captions[to], { autoAlpha: 0 }, { autoAlpha: 1, ...FADE }, SLIDE.duration * 0.4);
	}
</script>

<section class="slideshow" data-tone="dark" aria-label={title} aria-roledescription="carousel" data-slideshow-frame={id}>
	{#each ['previous', 'next'] as const as s (s)}
		<button
			type="button"
			class="half {s}"
			aria-label={s === 'next' ? 'Next image' : 'Previous image'}
			onclick={() => go(s)}
			onpointerenter={() => (side = s)}
			onpointerleave={() => (side = null)}
		></button>
	{/each}
	<h2 class="title type-h4">{title}{#if count}{' '}({slides.length}){/if}</h2>
	<Row>
		<Cell start={4} span={6} tablet={{ start: 2, span: 10 }} mobile={{ start: 1, span: 12 }}>
			<div class="frame">
				{#each slides as slide, i (i)}
					<div
						class="image"
						class:current={i === current}
						bind:this={images[i]}
						aria-hidden={i !== current}
					>
						<Picture
							{...slide.image}
							ratio="2040 / 1338"
							sizes="(max-width: 767px) 100vw, (max-width: 991px) 82vw, 48vw"
						/>
					</div>
				{/each}
			</div>
			{#if slides.some((slide) => slide.caption)}
				<div class="captions" aria-live="polite">
					{#each slides as slide, i (i)}
						<p class="caption type-body-default" class:current={i === current} bind:this={captions[i]}>
							{slide.caption ?? ''}
						</p>
					{/each}
				</div>
			{/if}
		</Cell>
	</Row>
</section>

<CursorLabel
	text="Previous"
	detail={progress(-1)}
	icon={chevronLeft}
	iconAt="start"
	active={side === 'previous'}
	clip="[data-slideshow-frame='{id}']"
	linger={0}
/>
<CursorLabel
	text="Next"
	detail={progress(1)}
	icon={chevronRight}
	active={side === 'next'}
	clip="[data-slideshow-frame='{id}']"
	linger={0}
/>

<style>
	.slideshow {
		position: relative;
		display: grid;
		padding: var(--space-24) var(--grid-margin) var(--space-160);
		background: var(--grey-850);
		color: var(--grey-0);
	}

	.title {
		margin: 0 0 var(--space-128);
		text-align: center;
	}

	/* The images stack in one cell; only the current one shows when nothing
	   is moving. Mid-slide, GSAP holds the outgoing one up too. */
	.frame {
		position: relative;
		display: grid;
		overflow: hidden;
		border-radius: var(--card-radius);
	}
	.image {
		grid-area: 1 / 1;
		visibility: hidden;
	}
	.image.current {
		visibility: visible;
	}

	.half {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 50%;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}
	.previous {
		left: 0;
	}
	.next {
		right: 0;
	}
	/* Above the image and caption, so the whole band is the two buttons. */
	.half {
		z-index: 1;
	}
	.half:focus-visible {
		outline: 1px solid var(--grey-0);
		outline-offset: calc(var(--space-4) * -2);
	}

	/* Captions stack too, so the line keeps the tallest one's height. Four
	   of the six columns, centred. */
	.captions {
		display: grid;
		justify-items: center;
		margin-top: var(--space-16);
	}
	.caption {
		grid-area: 1 / 1;
		max-width: calc((100% - 5 * var(--grid-gutter)) / 6 * 4 + 3 * var(--grid-gutter));
		margin: 0;
		color: var(--grey-400);
		text-align: center;
		visibility: hidden;
	}
	.caption.current {
		visibility: visible;
	}

	@media screen and (max-width: 767px) {
		.slideshow {
			padding-bottom: var(--space-96);
		}
		.caption {
			max-width: none;
		}
	}
</style>
