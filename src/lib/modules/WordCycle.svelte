<!--
	@component
	A line over a stack of photos, driven by the scroll: a phrase, then a
	stack of words beside it ("Abundant energy for / Space / Earth /
	Underwater"), set in the frame's bottom-left corner, one word lit and
	the rest dimmed. The line fades in as the frame opens.

	The frame comes up the page inside the grid, with the page's margins and
	rounded corners, and opens out to full bleed as it reaches the top. There
	it pins, and each further photo slides up from below and stacks over the
	last, lighting its word as it lands. The scroll decides when: crossing
	into each photo's stretch of the pin plays its change on its own, about
	a second, and scrolling back plays it in reverse. Inside each slide the photo moves at
	its own speed: a coming slide's photo rises slower than its frame, and
	the photo it covers drifts down, a parallax. Lenis smooths the scroll;
	with reduced motion there's no pin, and the first photo holds.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import Picture from '$lib/components/Picture.svelte';
	import { gsap, ScrollTrigger, initScroll, destroyScroll, prefersReducedMotion } from '$lib/scroll';
	import type { Picture as Source } from 'vite-imagetools';

	let { phrase, items }: { phrase: string; items: { word: string; image: { src: Source; alt: string } }[] } = $props();

	/** The dimmed words' opacity. */
	const DIM = 0.45;
	/** How far a coming photo lags its frame, and a covered one drifts, as a share of the screen. */
	const LAG = 0.4;
	const DRIFT = 0.2;
	/** Scroll per photo while pinned, as a share of the screen's height. */
	const PIN = 0.65;
	/** Each change, once triggered: the slide and photos, then the words. */
	const MOVE = { duration: 1.1, ease: 'power3.inOut', overwrite: 'auto' as const };
	const FADE = { duration: 0.5, delay: 0.4, ease: 'power1.out', overwrite: 'auto' as const };

	let section: HTMLElement;
	let stage: HTMLElement;
	let frame: HTMLElement;
	let line: HTMLElement;
	let slides: HTMLElement[] = $state([]);
	let photos: HTMLElement[] = $state([]);
	let words: HTMLElement[] = $state([]);
	let current = $state(0);

	/** A length token resolved to px, measured in the stage. */
	function px(value: string) {
		const probe = document.createElement('span');
		probe.style.cssText = `position:absolute;visibility:hidden;width:${value}`;
		stage.appendChild(probe);
		const w = probe.getBoundingClientRect().width;
		probe.remove();
		return w;
	}

	onMount(() => {
		initScroll();
		gsap.set(words, { opacity: (i: number) => (i === 0 ? 1 : DIM) });
		if (prefersReducedMotion()) return destroyScroll;

		const ctx = gsap.context(() => {
			// In the grid, then full bleed: the frame's sides clipped in by the
			// page margin, corners rounded, opening from the first bit of
			// scroll until it reaches the top.
			const inset = () => `inset(0px ${px('var(--grid-margin)')}px round ${px('var(--card-radius)')}px)`;
			// The line fades in over the second half of the opening.
			gsap
				.timeline({
					scrollTrigger: { trigger: section, start: 0, end: 'top top', scrub: true, invalidateOnRefresh: true }
				})
				.fromTo(frame, { clipPath: inset }, { clipPath: 'inset(0px 0px round 0px)', ease: 'power2.inOut', duration: 1 }, 0)
				.fromTo(line, { autoAlpha: 0 }, { autoAlpha: 1, ease: 'power1.out', duration: 0.5 }, 0.5);

			// Every photo after the first waits below, its photo lagging.
			const h = () => window.innerHeight;
			gsap.set(slides.slice(1), { yPercent: 100 });
			gsap.set(photos.slice(1), { y: () => -LAG * h() });

			// Pinned, PIN of a screen of scroll per photo. The scroll only
			// says which photo is up; crossing into its stretch plays the
			// change on its own: it slides up over the last, its photo
			// catching up, the covered one drifting down, its word lighting.
			// Back the other way, it slides away again.
			const show = (to: number) => {
				if (to === current) return;
				current = to;
				slides.forEach((slide, j) => {
					if (j > 0) gsap.to(slide, { yPercent: j <= to ? 0 : 100, ...MOVE });
					gsap.to(photos[j], { y: j < to ? DRIFT * h() : j === to ? 0 : -LAG * h(), ...MOVE });
					gsap.to(words[j], { opacity: j === to ? 1 : DIM, ...FADE });
				});
			};
			ScrollTrigger.create({
				trigger: stage,
				start: 'top top',
				end: () => `+=${(items.length - 1) * h() * PIN}`,
				pin: true,
				invalidateOnRefresh: true,
				onUpdate: (self) => show(Math.min(items.length - 1, Math.round(self.progress * (items.length - 1))))
			});
		}, section);

		return () => {
			ctx.revert();
			destroyScroll();
		};
	});
</script>

<section class="slides" bind:this={section}>
	<div class="stage" data-tone="dark" bind:this={stage}>
		<div class="frame" bind:this={frame}>
			{#each items as item, i (i)}
				<div class="slide" bind:this={slides[i]} aria-hidden={i !== current}>
					<div class="photo" bind:this={photos[i]}>
						<Picture {...item.image} ratio="auto" sizes="100vw" loading={i === 0 ? 'eager' : 'lazy'} />
					</div>
				</div>
			{/each}
		</div>
		<h2 class="line type-h2" bind:this={line}>
			<span class="phrase">{phrase}</span>
			<span class="words">
				{#each items as item, i (i)}
					<span class="word" bind:this={words[i]}>{item.word}</span>
				{/each}
			</span>
		</h2>
	</div>
</section>

<style>
	/* A screen tall, pinned while the photos stack. */
	.stage {
		position: relative;
		height: 100svh;
		color: var(--grey-0);
	}
	.frame {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: var(--grey-950);
	}

	/* The slides stacked, each later one over the last. Each photo a fifth
	   taller than its slide, so it has room to move inside it. */
	.slide {
		position: absolute;
		inset: 0;
		overflow: hidden;
	}
	.photo {
		position: absolute;
		inset: -10% 0;
		will-change: transform;
	}
	.photo :global(.picture) {
		height: 100%;
	}

	/* In the bottom-left corner, inside the frame's margin while it's in the
	   grid; the words stacked beside the phrase, the first level with it. */
	.line {
		position: absolute;
		/* 240px at 1440. */
		bottom: calc(var(--space-160) + var(--space-80));
		left: calc(var(--grid-margin) * 2);
		display: flex;
		gap: var(--space-16);
		margin: 0;
	}
	.words {
		display: grid;
	}

	@media screen and (max-width: 767px) {
		.line {
			flex-direction: column;
			gap: 0;
			bottom: var(--space-40);
		}
	}
</style>
