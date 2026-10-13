<!--
	@component
	A quote set over a full-bleed photo, the speaker named under it. The
	photo comes up the page inside the grid's margins and opens out to the
	full width as it reaches the top, settling from a slight zoom. The quote
	lights up letter by letter with the scroll (`highlightText`), the photo
	drifting slower than the page behind it, and the speaker's name fades in once it's lit. With
	reduced motion it's the still photo and the lit quote.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import Picture from '$lib/components/Picture.svelte';
	import { highlightText } from '$lib/highlightText';
	import { gsap, prefersReducedMotion } from '$lib/scroll';
	import type { Picture as Source } from 'vite-imagetools';

	let {
		text,
		name,
		role,
		image
	}: { text: string; name: string; role?: string; image: { src: Source; alt: string } } = $props();

	/**
	 * Where the quote is fully lit: its middle at the middle of the
	 * screen. The name fades in from there.
	 */
	const QUOTE_END = 'center 50%';

	let band: HTMLElement;
	let quote: HTMLElement;
	let by: HTMLElement;
	let frame: HTMLElement;
	let photo: HTMLElement;

	/** A length token resolved to px, measured in the band. */
	function px(value: string) {
		const probe = document.createElement('span');
		probe.style.cssText = `position:absolute;visibility:hidden;width:${value}`;
		band.appendChild(probe);
		const w = probe.getBoundingClientRect().width;
		probe.remove();
		return w;
	}

	onMount(() => {
		if (prefersReducedMotion()) return;
		const ctx = gsap.context(() => {
			const inset = () => `inset(0px ${px('var(--grid-margin)')}px round ${px('var(--card-radius)')}px)`;

			// Opening out as it comes up to the top.
			gsap
				.timeline({
					defaults: { ease: 'none' },
					scrollTrigger: { trigger: band, start: 'top bottom', end: 'top top', scrub: true, invalidateOnRefresh: true }
				})
				.fromTo(frame, { clipPath: inset }, { clipPath: 'inset(0px 0px round 0px)', ease: 'power2.inOut' }, 0)
				.fromTo(photo, { scale: 1.25 }, { scale: 1 }, 0);


			// The name, once the quote is lit.
			gsap.from(by, {
				autoAlpha: 0,
				y: 12,
				duration: 0.8,
				ease: 'power2.out',
				scrollTrigger: { trigger: quote, start: QUOTE_END, toggleActions: 'play none none reverse' }
			});

			// The photo drifts down inside its frame as the band passes, 40% of
			// the band's height, so it moves slower than the page: the landing
			// hero's parallax.
			gsap.fromTo(
				photo,
				{ y: 0 },
				{
					y: () => band.offsetHeight * 0.4,
					ease: 'none',
					scrollTrigger: { trigger: band, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true }
				}
			);
		}, band);
		return () => ctx.revert();
	});
</script>

<section class="band" data-tone="dark" bind:this={band}>
	<div class="frame" bind:this={frame}>
		<div class="photo" bind:this={photo}>
			<Picture {...image} ratio="auto" sizes="100vw" />
		</div>
	</div>
	<figure class="quote">
		<blockquote class="text type-h5" bind:this={quote} {@attach highlightText({ scrollEnd: QUOTE_END })}>{text}</blockquote>
		<figcaption class="by type-annotation" bind:this={by}>
			{name}{#if role}<span class="divider" aria-hidden="true">|</span>{role}{/if}
		</figcaption>
	</figure>
</section>

<style>
	/* A screen tall, the photo filling it. */
	.band {
		position: relative;
		height: 100svh;
		color: var(--white);
	}
	.frame {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: var(--black);
	}
	/* Taller than the frame by the drift, reaching above it, so the photo
	   can move down inside it without showing an edge. */
	.photo {
		position: absolute;
		inset: -40% 0 0;
		will-change: transform;
	}
	.photo :global(.picture) {
		height: 100%;
	}

	/* From the second column, four wide, well clear of the header. */
	.quote {
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));
		column-gap: var(--grid-gutter);
		margin: 0;
		padding: calc(var(--header-height) + var(--space-120)) var(--grid-margin) 0;
	}
	.text,
	.by {
		grid-column: 2 / span 4;
		margin: 0;
	}
	.by {
		margin-top: var(--space-24);
	}
	.divider {
		margin-inline: var(--space-8);
	}

	@media screen and (max-width: 991px) {
		.text,
		.by {
			grid-column: 2 / span 7;
		}
	}
	@media screen and (max-width: 767px) {
		.text,
		.by {
			grid-column: 1 / -1;
		}
	}
</style>
