<!--
	@component
	One entry in a feature list. Closed, it's a "02  Title" row. Open, the
	number and thumbnail sit at the top, and the title and description sit
	together at the bottom, the title keeping its indent. The list decides
	which card is open.
-->
<script lang="ts">
	import type { Picture as PictureSource } from 'vite-imagetools';
	import Picture from './Picture.svelte';
	import { tick, untrack } from 'svelte';
	import { gsap, prefersReducedMotion } from '$lib/scroll';

	let {
		index,
		title,
		text,
		thumb,
		open = false,
		onselect
	}: {
		/** Zero-based; shown as 01, 02, … */
		index: number;
		title: string;
		text: string;
		thumb?: PictureSource;
		open?: boolean;
		onselect: () => void;
	} = $props();

	const number = $derived(String(index + 1).padStart(2, '0'));

	let card: HTMLLIElement;
	let titleEl: HTMLSpanElement;
	let extras: HTMLElement[] = [];
	/** Lags `open` on the way closed, so the close can play in the open layout. */
	let expanded = $state(untrack(() => open));
	/** The state last asked for — may differ from `expanded` mid-close. */
	let target = untrack(() => open);
	let tl: gsap.core.Timeline | null = null;

	/**
	 * Height runs the same length and curve both ways, so the card closing
	 * and the card opening move in lockstep and the list's total height stays
	 * nearly constant. Content eases out on its own, softer curve on top.
	 */
	const HEIGHT = { duration: 0.75, ease: 'power3.inOut' };
	const REVEAL = { duration: 0.65, ease: 'power3.out', stagger: 0.07, overwrite: 'auto' as const };

	/** Base units, resolved from the body's font-size, which Osmo keeps at one unit. */
	const unit = () => parseFloat(getComputedStyle(document.body).fontSize);
	/** Closed card: 4.1875 units (67px at 1440). Keep in step with --closed-height. */
	const closedHeight = () => unit() * 4.1875;
	/** How far content rises as it arrives: 12px at 1440. */
	const rise = () => unit() * 0.75;

	/** Title first, then the drawing, then the copy — top to bottom as read. */
	const content = () => [titleEl, ...extras].filter(Boolean);

	// Open: the card grows; partway in, the title, drawing and copy rise in,
	// staggered. Close: they fade out as the card shrinks, its edge masking
	// them; then the title eases back into the closed row. GSAP tweens from
	// wherever things are, so a click mid-animation just turns it around.
	$effect(() => {
		const next = open;
		if (next === target) return;
		target = next;
		tl?.kill();

		if (prefersReducedMotion()) {
			expanded = next;
			gsap.set(card, { clearProps: 'height' });
			gsap.set(content(), { clearProps: 'opacity,visibility,transform' });
			return;
		}

		(async () => {
			const from = card.offsetHeight;
			if (next) {
				const fresh = !expanded;
				const titleTop = titleEl.getBoundingClientRect().top;
				expanded = true;
				await tick();
				gsap.set(card, { height: 'auto' });
				const to = card.offsetHeight;
				const reveal = HEIGHT.duration * 0.3;
				tl = gsap.timeline().fromTo(card, { height: from }, { height: to, ...HEIGHT, clearProps: 'height' }, 0);
				if (fresh) {
					// The title has already moved to the bottom row. Offset it back to
					// where it was and fade it out there, so it leaves the header
					// gently instead of vanishing — then it rises in with the rest.
					const back = titleTop - titleEl.getBoundingClientRect().top;
					gsap.set(extras.filter(Boolean), { autoAlpha: 0, y: rise() });
					tl.fromTo(
						titleEl,
						{ autoAlpha: 1, y: back },
						{ autoAlpha: 0, y: back - rise() / 2, duration: reveal * 0.9, ease: 'power2.in' },
						0
					).set(titleEl, { y: rise() }, reveal * 0.9);
				}
				tl.to(content(), { autoAlpha: 1, y: 0, ...REVEAL, clearProps: 'transform' }, reveal);
			} else {
				// The card's height is held by the tween, so the layout can switch
				// to closed as soon as the content is gone — the title reappears in
				// its row while the card is still shrinking, not after.
				const out = 0.3;
				tl = gsap
					.timeline({ onComplete: () => gsap.set(card, { clearProps: 'height' }) })
					.fromTo(card, { height: from }, { height: closedHeight(), ...HEIGHT }, 0)
					.to(content(), { autoAlpha: 0, y: -rise() / 2, duration: out, ease: 'power2.in', stagger: 0.03 }, 0)
					.call(
						() => {
							expanded = false;
							tick().then(() => {
								gsap.set(extras.filter(Boolean), { clearProps: 'opacity,visibility,transform' });
								gsap.fromTo(
									titleEl,
									{ autoAlpha: 0, y: rise() },
									{ autoAlpha: 1, y: 0, duration: 0.35, ease: 'power3.out', clearProps: 'transform' }
								);
							});
						},
						undefined,
						out + 0.03
					);
			}
		})();

		return () => tl?.kill();
	});
</script>

<li class="card" class:open={expanded} bind:this={card}>
	<button type="button" class="face type-body" aria-expanded={open} onclick={onselect}>
		<span class="number type-body">{number}</span>
		<span class="title type-body" bind:this={titleEl}>{title}</span>
		{#if thumb}
			<span class="thumb" class:wide={thumb.img.w / thumb.img.h > 0.8} bind:this={extras[0]}>
				<Picture src={thumb} ratio="{thumb.img.w} / {thumb.img.h}" fit="contain" sizes="140px" />
			</span>
		{/if}
		<span class="text" bind:this={extras[1]}>{text}</span>
	</button>
</li>

<style>
	/* 67px closed (CLOSED_UNITS in the script), 346px open, at 1440. */
	.card {
		--closed-height: calc(var(--size-font) * 4.1875);
		overflow: hidden;
		background: var(--grey-0);
	}

	/* Number in a fixed first column, title in the second — the same two
	   columns open or closed, so the title keeps its indent. */
	.face {
		display: grid;
		grid-template-columns: var(--space-40) 1fr auto;
		align-content: start;
		width: 100%;
		min-height: var(--closed-height);
		box-sizing: border-box;
		padding: var(--space-15);
		border: 0;
		background: none;
		color: var(--grey-950);
		text-align: left;
		cursor: pointer;
	}
	.card:not(.open) .face:hover {
		color: var(--grey-700);
	}
	.face:focus-visible {
		outline: 1px solid var(--grey-950);
		outline-offset: -1px;
	}

	.number {
		grid-area: 1 / 1;
	}
	.title {
		grid-area: 1 / 2;
	}
	.thumb,
	.text {
		display: none;
	}

	/* Open: number and thumbnail pinned top, title and copy pinned bottom. */
	.open .face {
		grid-template-rows: auto 1fr auto auto;
		align-content: stretch;
		min-height: calc(var(--size-font) * 21.625);
	}
	.open .thumb {
		display: block;
		grid-area: 1 / 3 / 3 / 4;
		width: calc(var(--size-font) * 6.25);
	}
	/* Square-ish drawings read small at a tall one's width: 140px at 1440. */
	.open .thumb.wide {
		width: calc(var(--size-font) * 8.75);
	}
	/* Spans the thumbnail's column too — the thumbnail stops above it. */
	.open .title {
		grid-area: 3 / 2 / 4 / -1;
		margin-top: var(--space-20);
	}
	.open .text {
		display: block;
		grid-area: 4 / 1 / 5 / -1;
		margin-top: var(--space-8);
		color: var(--grey-700);
	}
</style>
