<!--
	@component
	A line over a stack of photos, driven by the scroll: a phrase, then a
	stack of words beside it ("Abundant energy for / Space / Earth /
	Underwater"), set in the frame's bottom-left corner, one word lit and
	the rest dimmed. The line fades in as the frame opens.

	The frame comes up the page inside the grid, with the page's margins and
	rounded corners, and opens out to full bleed as it reaches the top. There
	it pins, and each further photo slides up from below and stacks over the
	last, lighting its word as it lands. One gesture, one photo: while
	pinned the page holds, and each wheel flick, swipe or arrow key plays
	one change on its own, under a second; past the last photo, or back
	before the first, the page scrolls on. Inside each slide the photo moves at its own speed: a coming slide's photo rises slower than its frame, and
	the photo it covers drifts up after it, slower still, a parallax. Lenis smooths the scroll;
	with reduced motion there's no pin, and the first photo holds.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import Picture from '$lib/components/Picture.svelte';
	import { gsap, ScrollTrigger, initScroll, destroyScroll, getLenis, prefersReducedMotion } from '$lib/scroll';
	import { Observer } from 'gsap/Observer';

	gsap.registerPlugin(Observer);
	import type { Picture as Source } from 'vite-imagetools';

	let { phrase, items }: { phrase: string; items: { word: string; image: { src: Source; alt: string } }[] } = $props();

	/** The dimmed words' opacity. */
	const DIM = 0.45;
	/**
	 * How far a coming photo lags its frame, and how far a covered one drifts
	 * up after it, as a share of the screen. Up, with the slide: drifting down
	 * it fought the slide, and opened a gap above it past its 10% overhang.
	 */
	const LAG = 0.4;
	const DRIFT = 0.2;
	/**
	 * Each change, once triggered: the slide and photos, then the words. It
	 * answers the gesture at once and settles softly (an ease-out: an
	 * ease-in-out held still for the first beat, and read as lag).
	 */
	// `auto`: a change taken while the last is landing takes over from it, no tug of war.
	const MOVE = { duration: 0.85, ease: 'power3.out', overwrite: 'auto' as const };
	const FADE = { duration: 0.4, ease: 'power1.out', overwrite: 'auto' as const };
	/** When the next gesture is taken, as a share of the change: the slide all but landed. */
	const READY = 0.8;

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
			gsap.set(slides.slice(1), { yPercent: 100 });
			gsap.set(photos.slice(1), { y: () => -LAG * h() });

			// One gesture, one photo. Once the frame reaches the top it pins
			// and the page stops: each wheel flick, swipe or arrow key plays
			// one change on its own, under a second, the photo sliding up over
			// the last (or away, going back), its word lighting. Input during
			// a change is ignored, so nothing queues. Past the last photo, or
			// back past the first, the pin lets go and the page scrolls on.
			let busy = false;
			const go = (to: number) => {
				busy = true;
				current = to;
				const tl = gsap.timeline({ defaults: MOVE });
				tl.call(() => (busy = false), [], MOVE.duration * READY);
				slides.forEach((slide, j) => {
					if (j > 0) tl.to(slide, { yPercent: j <= to ? 0 : 100 }, 0);
					tl.to(photos[j], { y: j < to ? -DRIFT * h() : j === to ? 0 : -LAG * h() }, 0);
					tl.to(words[j], { opacity: j === to ? 1 : DIM, ...FADE }, 0.15);
				});
			};

			const lenis = getLenis();
			/**
			 * Whether reaching the pin holds the page. Off once it lets go, until
			 * the page has scrolled out of it, so the let-go can't be caught
			 * straight back.
			 */
			let armed = true;
			/** Holding the page now: hold() runs once, however many triggers fire together. */
			let holding = false;
			/** ScrollTrigger is re-measuring the page: its triggers firing then aren't the visitor's scroll. */
			let refreshing = false;
			const onRefreshInit = () => (refreshing = true);
			// Declared first: created already past it (a reload partway down),
			// ScrollTrigger fires its callbacks before `create` returns.
			let pin: ScrollTrigger | undefined;
			pin = ScrollTrigger.create({
				trigger: stage,
				start: 'top top',
				end: '+=1',
				pin: true,
				onEnter: () => hold(),
				onEnterBack: () => hold(),
				onLeave: () => (armed = true),
				onLeaveBack: () => (armed = true)
			});
			/** Lets go of the pin: the page scrolls on from where it is, with the next gesture. */
			const release = () => {
				armed = false;
				holding = false;
				gestures.disable();
				window.removeEventListener('keydown', onKey);
				lenis?.start();
			};
			const next = () => {
				if (busy) return;
				if (current < items.length - 1) go(current + 1);
				else release();
			};
			const previous = () => {
				if (busy) return;
				if (current > 0) go(current - 1);
				else release();
			};
			const onKey = (e: KeyboardEvent) => {
				if (['ArrowDown', 'PageDown', ' '].includes(e.key)) next();
				else if (['ArrowUp', 'PageUp'].includes(e.key)) previous();
				else return;
				e.preventDefault();
			};
			// Scrolling down reads as "up" with wheelSpeed -1, as a swipe up
			// does: both bring the next photo.
			const gestures = Observer.create({
				target: window,
				type: 'wheel,touch',
				wheelSpeed: -1,
				tolerance: 12,
				preventDefault: true,
				onUp: next,
				onDown: previous
			});
			gestures.disable();
			/** Holds the page at the pin and hands input to the gestures. */
			function hold() {
				// Not for a trigger firing while ScrollTrigger re-measures the page:
				// only a visitor scrolling into the pin is held.
				if (!pin || !armed || holding || refreshing) return;
				// Nor for a jump that passes over it (the scroll restored on a
				// reload, a link to further down): only arriving at it holds.
				if (Math.abs(window.scrollY - pin.start) > window.innerHeight / 2) return;
				holding = true;
				lenis?.stop();
				if (lenis) lenis.scrollTo(pin.start, { immediate: true, force: true });
				gestures.enable();
				window.addEventListener('keydown', onKey);
			}
			// Scrolled from outside the gestures while holding (a restored scroll
			// position, a link, the scrollbar dragged): let go, so the page can
			// never be left stopped away from the pin; re-armed, as it's left it.
			const onScroll = () => {
				if (!pin || !holding || Math.abs(window.scrollY - pin.start) <= 4) return;
				release();
				armed = true;
			};
			window.addEventListener('scroll', onScroll, { passive: true });
			// Re-measured while holding (the page above changed height): the pin
			// has moved, so the page moves with it rather than freezing where
			// the pin used to be.
			const onRefresh = () => {
				refreshing = false;
				if (pin && holding && lenis) lenis.scrollTo(pin.start, { immediate: true, force: true });
			};
			ScrollTrigger.addEventListener('refreshInit', onRefreshInit);
			ScrollTrigger.addEventListener('refresh', onRefresh);
			cleanups.push(() => {
				ScrollTrigger.removeEventListener('refreshInit', onRefreshInit);
				ScrollTrigger.removeEventListener('refresh', onRefresh);
				window.removeEventListener('scroll', onScroll);
				gestures.kill();
				window.removeEventListener('keydown', onKey);
				lenis?.start();
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
