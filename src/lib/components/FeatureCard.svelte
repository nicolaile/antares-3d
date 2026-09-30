<!--
	@component
	One entry in a feature list, on a dark card: a numbered badge with the
	title under it, in Body (18px) open or closed. Open, the badge turns
	orange, the title drops a little and the description follows. The list decides which card is open, and
	can stretch the open card with `--open-height`.
-->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { gsap, prefersReducedMotion } from '$lib/scroll';

	let {
		index,
		title,
		text,
		open = false,
		onselect
	}: {
		/** Zero-based; shown as 1, 2, … */
		index: number;
		title: string;
		text: string;
		open?: boolean;
		onselect: () => void;
	} = $props();

	const number = $derived(String(index + 1));

	let card: HTMLLIElement;
	let textEl: HTMLSpanElement;
	let copyEl: HTMLSpanElement;
	/** Lags `open` on the way closed, so the close can play in the open layout. */
	let expanded = $state(untrack(() => open));
	/** The state last asked for — may differ from `expanded` mid-close. */
	let target = untrack(() => open);
	let tl: gsap.core.Timeline | null = null;

	/**
	 * Height runs the same length and curve both ways, so the card closing
	 * and the card opening move in lockstep and the list's total height stays
	 * nearly constant. The title's drop rides the same tween, so everything
	 * lands together.
	 */
	const HEIGHT = { duration: 0.4, ease: 'power3.inOut' };

	/** Base units, resolved from the body's font-size, which Osmo keeps at one unit. */
	const unit = () => parseFloat(getComputedStyle(document.body).fontSize);
	/** Closed card: 6 units (96px at 1440). Keep in step with --closed-height. */
	const closedHeight = () => unit() * 6;

	// Open: the card grows, the title and description drop together as one
	// block (`--drop`, 0 closed to 1 open, a CSS variable so the distance
	// stays right if the window resizes), and partway in the description
	// fades in. Close: it fades as the card shrinks,
	// its edge masking it. The title never fades, so nothing flickers.
	// GSAP tweens from wherever things are, so a click mid-animation just
	// turns it around.
	$effect(() => {
		const next = open;
		if (next === target) return;
		target = next;
		tl?.kill();

		if (prefersReducedMotion()) {
			expanded = next;
			gsap.set(card, { clearProps: 'height' });
			gsap.set(textEl, { clearProps: 'opacity,visibility' });
			gsap.set(copyEl, { '--drop': next ? 1 : 0 });
			return;
		}
		// Starts on the click, before the layout switches below.
		const drop = gsap.to(copyEl, { '--drop': next ? 1 : 0, ...HEIGHT });

		(async () => {
			const from = card.offsetHeight;
			if (next) {
				expanded = true;
				await tick();
				gsap.set(card, { height: 'auto' });
				const to = card.offsetHeight;
				gsap.set(textEl, { autoAlpha: 0 });
				tl = gsap
					.timeline()
					.fromTo(card, { height: from }, { height: to, ...HEIGHT, clearProps: 'height' }, 0)
					.to(
						textEl,
						{ autoAlpha: 1, duration: 0.4, ease: 'power2.out' },
						HEIGHT.duration * 0.3
					);
			} else {
				// The card's height is held by the tween, so the layout can switch
				// to closed as soon as the copy is gone.
				const out = 0.16;
				tl = gsap
					.timeline({ onComplete: () => gsap.set(card, { clearProps: 'height' }) })
					.fromTo(card, { height: from }, { height: closedHeight(), ...HEIGHT }, 0)
					.to(textEl, { autoAlpha: 0, duration: out, ease: 'power2.in' }, 0)
					.call(
						() => {
							expanded = false;
							tick().then(() => gsap.set(textEl, { clearProps: 'opacity,visibility' }));
						},
						undefined,
						out + 0.03
					);
			}
		})();

		return () => {
			tl?.kill();
			drop.kill();
		};
	});
</script>

<li class="card" class:open={expanded} class:active={open} bind:this={card}>
	<button type="button" class="face" aria-expanded={open} onclick={onselect}>
		<span class="number type-annotation type-tabular">{number}</span>
		<span class="copy" bind:this={copyEl} style:--drop={untrack(() => (open ? 1 : 0))}>
			<span class="title type-body">{title}</span>
			<span class="text type-small" bind:this={textEl}>{text}</span>
		</span>
	</button>
</li>

<style>
	/* 96px closed (closedHeight in the script), 381px open at 1440 unless
	   the list stretches it. */
	.card {
		--closed-height: calc(var(--size-font) * 6);
		overflow: hidden;
		border-radius: var(--stage-radius);
		background: var(--grey-800);
	}

	/* Badge, then title, then (open) the copy, stacked from the top. */
	.face {
		display: grid;
		align-content: start;
		justify-items: start;
		width: 100%;
		min-height: var(--closed-height);
		box-sizing: border-box;
		padding: var(--space-20);
		border: 0;
		background: none;
		color: var(--grey-0);
		text-align: left;
		cursor: pointer;
	}
	.card:not(.open) .face:hover {
		color: var(--grey-300);
	}
	.face:focus-visible {
		outline: 1px solid var(--grey-0);
		outline-offset: -1px;
	}

	/* 22px square at 1440: pale when closed, the accent when open. */
	.number {
		display: grid;
		place-items: center;
		width: calc(var(--size-font) * 1.375);
		height: calc(var(--size-font) * 1.375);
		border-radius: var(--stage-radius);
		background: var(--grey-300);
		color: var(--grey-950);
		/* Swaps at once, no transition: fading the fill and the number
		   together passes through a moment where they're the same shade,
		   and the number flickers. */
	}
	.active .number {
		background: var(--accent-500);
		color: var(--grey-0);
	}

	/* Title and description as one block. Open, it drops to sit further
	   from the badge, carrying both: --drop runs 0 to 1, tweened by GSAP in
	   the script. A transform, so it never changes the layout — the height
	   tween owns that. */
	.copy {
		display: grid;
		justify-items: start;
		margin-top: var(--space-12);
		translate: 0 calc((var(--space-30) - var(--space-12)) * var(--drop, 0));
	}
	.card:not(.open) {
		height: var(--closed-height);
	}
	.text {
		display: none;
	}

	.open .face {
		min-height: var(--open-height, calc(var(--size-font) * 23.75));
	}
	.open .text {
		display: block;
		max-width: 20em;
		margin-top: var(--space-8);
		color: var(--grey-400);
	}
</style>
