<!--
	@component
	A phrase beside a stack of words ("Abundant energy for / Space / Earth"),
	over a stack of photos, driven by the scroll. The frame opens from the
	grid to full bleed as it reaches the top, then pins for a screen of
	scroll per further photo: each slides up over the last (with parallax)
	and lights its word. Released between photos, the page settles onto the
	nearest. With reduced motion there's no pin and the first photo holds.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import Picture from '$lib/components/Picture.svelte';
	import { gsap, ScrollTrigger, initScroll, destroyScroll, getLenis, prefersReducedMotion } from '$lib/motion/scroll';
	import { freezeHeader } from '$lib/chrome/header.svelte';
	import type { Picture as Source } from 'vite-imagetools';

	let { phrase, items }: { phrase: string; items: { word: string; image: { src: Source; alt: string } }[] } = $props();

	const DIM = 0.45;
	/**
	 * How far a coming photo lags its frame, and how far a covered one drifts
	 * up after it, as shares of the screen. Drifting down would fight the
	 * slide and open a gap past the photo's 10% overhang.
	 */
	const LAG = 0.65;
	const DRIFT = 0.3;
	/** The settle onto the nearest photo; its length grows with the distance left. */
	const SNAP = { min: 0.55, max: 0.95, ease: 'sine.inOut' };
	/** Ms after the last input and the page coming to rest before it settles. */
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
			// From inset by the page margin with rounded corners to full bleed.
			const inset = () => `inset(0px ${px('var(--grid-margin)')}px round ${px('var(--card-radius)')}px)`;
			gsap
				.timeline({
					scrollTrigger: { trigger: section, start: 0, end: 'top top', scrub: true, invalidateOnRefresh: true }
				})
				.fromTo(frame, { clipPath: inset }, { clipPath: 'inset(0px 0px round 0px)', ease: 'power2.inOut', duration: 1 }, 0)
				.fromTo(line, { autoAlpha: 0 }, { autoAlpha: 1, ease: 'power1.out', duration: 0.5 }, 0.5);

			const h = () => window.innerHeight;
			const steps = items.length - 1;
			gsap.set(slides.slice(1), { yPercent: 100 });
			gsap.set(photos.slice(1), { y: () => -LAG * h() });

			// One timeline unit per change, a screen of scroll each.
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
				// Lenis already smooths the scroll.
				scrub: true,
				animation: tl,
				invalidateOnRefresh: true,
				onUpdate: (self) => (current = Math.round(self.progress * steps))
			});

			// Settle onto the nearest photo only once input has stopped, no
			// finger is down and the page is at rest. Any input during the settle
			// cancels it, so it never pulls against a scroll.
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
				// The page moving itself isn't the visitor scrolling, so the header holds.
				settling = true;
				freezeHeader(true);
				const done = () => {
					settling = false;
					freezeHeader(false);
				};
				if (lenis) lenis.scrollTo(target, { duration, easing: gsap.parseEase(SNAP.ease), onComplete: done });
				else window.scrollTo({ top: target, behavior: 'smooth' });
			}
			/** Stops a settle where it is, and puts the next one off. */
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
	.stage {
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

	/* Each photo a fifth taller than its slide, so it has room to move. */
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

	/* Inside the frame's margin while it's still in the grid. */
	.line {
		position: absolute;
		bottom: calc(var(--space-160) + var(--space-40));
		left: calc(var(--grid-margin) * 2);
		display: flex;
		gap: var(--space-16);
		margin: 0;
	}
	.words {
		display: grid;
	}
	.word + .word {
		margin-top: calc(var(--space-8) * -1);
	}

	@media screen and (max-width: 767px) {
		.line {
			flex-direction: column;
			gap: 0;
			bottom: var(--space-40);
		}
	}
</style>
