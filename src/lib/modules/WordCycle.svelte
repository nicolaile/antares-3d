<!--
	@component
	A line over a stack of photos, driven by the scroll: a phrase, then a
	stack of words beside it ("Abundant energy for / Space / Earth /
	Underwater"), set in the frame's bottom-left corner, one word lit and
	the rest dimmed. The line fades in as the frame opens.
	The frame comes up the page inside the grid, with the page's margins and
	rounded corners, and opens out to full bleed as it reaches the top. There
	it pins for a screen of scroll per further photo: each slides up from
	below with the scroll and stacks over the last, lighting its word as it
	passes halfway. Inside each slide the photo moves at its own speed: a
	coming slide's photo rises slower than its frame, and the photo it covers
	drifts up after it, slower still, a parallax. Let go partway and the page
	settles onto the nearest photo, full screen. Lenis smooths the scroll;
	with reduced motion there's no pin, and the first photo holds.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import Picture from '$lib/components/Picture.svelte';
	import { gsap, ScrollTrigger, initScroll, destroyScroll, getLenis, prefersReducedMotion } from '$lib/scroll';
	import { freezeHeader } from '$lib/header.svelte';
	import type { Picture as Source } from 'vite-imagetools';

	let { phrase, items }: { phrase: string; items: { word: string; image: { src: Source; alt: string } }[] } = $props();

	/** The dimmed words' opacity. */
	const DIM = 0.45;
	/**
	 * How far a coming photo lags its frame, and how far a covered one drifts
	 * up after it, as a share of the screen. Up, with the slide: drifting down
	 * it fought the slide, and opened a gap above it past its 10% overhang.
	 */
	const LAG = 0.65;
	const DRIFT = 0.3;
	/**
	 * The gentle settle onto the nearest photo once the scroll has rested:
	 * from a standstill, so a soft ease-in-out, its length growing with the
	 * distance left to go.
	 */
	const SNAP = { min: 0.55, max: 0.95, ease: 'sine.inOut' };
	/**
	 * How long after the visitor's last input, and the page coming to rest,
	 * before it settles, in ms.
	 */
	const REST = 450;

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

		const cleanups: (() => void)[] = [];
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
			const steps = items.length - 1;
			gsap.set(slides.slice(1), { yPercent: 100 });
			gsap.set(photos.slice(1), { y: () => -LAG * h() });

			// Pinned for a screen of scroll per photo, scrubbed: one unit of
			// the timeline per change, the slide and its photo rising, the
			// photo under it drifting after, the words swapping halfway.
			const tl = gsap.timeline({ defaults: { ease: 'none', duration: 1 } });
			for (let i = 1; i <= steps; i++) {
				const at = i - 1;
				tl.to(slides[i], { yPercent: 0 }, at)
					.to(photos[i], { y: 0 }, at)
					.to(photos[i - 1], { y: () => -DRIFT * h() }, at)
					.to(words[i], { opacity: 1, duration: 0.3, ease: 'power1.out' }, at + 0.35)
					.to(words[i - 1], { opacity: DIM, duration: 0.3, ease: 'power1.out' }, at + 0.35);
			}
			const pin = ScrollTrigger.create({
				trigger: stage,
				start: 'top top',
				end: () => `+=${steps * h()}`,
				pin: true,
				// Lenis already smooths the scroll; the slides follow it exactly.
				scrub: true,
				animation: tl,
				invalidateOnRefresh: true,
				onUpdate: (self) => (current = Math.round(self.progress * steps))
			});

			// Only once the visitor has stopped (no wheel, touch or key for a
			// beat, no finger down, the page itself at rest) and it's left between
			// two photos does it settle onto the nearest. Any input during the
			// settle cancels it on the spot, so it never pulls against a scroll.
			const lenis = getLenis();
			let timer = 0;
			let touching = false;
			let settling = false;
			const later = () => {
				clearTimeout(timer);
				timer = window.setTimeout(settle, REST);
			};
			function settle() {
				if (touching || !pin.isActive) return;
				// Still gliding to a stop: look again once it has.
				if (lenis?.isScrolling) return later();
				const length = pin.end - pin.start;
				const target = pin.start + (Math.round(pin.progress * steps) / steps) * length;
				const distance = Math.abs(window.scrollY - target);
				if (distance < 2) return;
				const duration = gsap.utils.clamp(SNAP.min, SNAP.max, SNAP.min + (distance / h()) * (SNAP.max - SNAP.min));
				// The page moving itself isn't the visitor scrolling: the header holds.
				settling = true;
				freezeHeader(true);
				const done = () => {
					settling = false;
					freezeHeader(false);
				};
				if (lenis) lenis.scrollTo(target, { duration, easing: gsap.parseEase(SNAP.ease), onComplete: done });
				else window.scrollTo({ top: target, behavior: 'smooth' });
			}
			/** The visitor's input: stops a settle where it is, and puts the next one off. */
			const onInput = () => {
				if (settling) {
					settling = false;
					freezeHeader(false);
					lenis?.scrollTo(window.scrollY, { immediate: true, force: true });
				}
				later();
			};
			const onTouchStart = () => {
				touching = true;
				onInput();
			};
			const onTouchEnd = () => {
				touching = false;
				later();
			};
			// The settle's own scroll doesn't put itself off; anything else does.
			const onScroll = () => {
				if (!settling) later();
			};
			// Captured, so a settle is stopped before Lenis takes the same wheel.
			const listeners: [string, EventListener][] = [
				['wheel', onInput],
				['keydown', onInput],
				['pointerdown', onInput],
				['touchstart', onTouchStart],
				['touchend', onTouchEnd],
				['touchcancel', onTouchEnd],
				['scroll', onScroll]
			];
			listeners.forEach(([type, fn]) => window.addEventListener(type, fn, { passive: true, capture: true }));
			cleanups.push(() => {
				clearTimeout(timer);
				listeners.forEach(([type, fn]) => window.removeEventListener(type, fn, { capture: true }));
				if (settling) freezeHeader(false);
			});
		}, section);

		return () => {
			cleanups.forEach((fn) => fn());
			ctx.revert();
			destroyScroll();
		};
	});
</script>

<section class="slides" bind:this={section}>
	<div class="stage" data-tone="dark" data-header="light" bind:this={stage}>
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
