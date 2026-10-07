<!--
	@component
	One tab in the R1 feature strip: a number on a grey badge in the top
	left of a narrow cell, divided from its neighbours by a hairline. Open,
	the cell widens, the badge turns orange with the title beside it, and
	the description hangs below the strip, in line with the badge. The strip
	decides which tab is open.
-->
<script lang="ts">
	import { untrack } from 'svelte';
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

	let tab: HTMLLIElement;
	let copyEl: HTMLSpanElement;
	let tl: gsap.core.Timeline | null = null;
	/** The state last animated to. */
	let target = untrack(() => open);

	/**
	 * The width runs the same length and curve both ways, so the tab closing
	 * and the tab opening move in lockstep and the strip keeps its length.
	 * Widths come from the strip's stylesheet (--closed-width, --open-width,
	 * in its container units), read at the moment.
	 */
	const WIDTH = { duration: 0.5, ease: 'power3.inOut' };

	/** The tab's width before `open` changed the layout, read ahead of the DOM update. */
	let from = 0;
	$effect.pre(() => {
		if (open !== target && tab) from = tab.getBoundingClientRect().width;
	});

	$effect(() => {
		const next = open;
		if (next === target) return;
		target = next;
		tl?.kill();

		/** A width variable in px, resolved inside the strip. */
		const px = (name: string) => {
			const probe = document.createElement('span');
			probe.style.cssText = `position:absolute;visibility:hidden;width:var(${name})`;
			tab.appendChild(probe);
			const w = probe.getBoundingClientRect().width;
			probe.remove();
			return w;
		};
		if (prefersReducedMotion()) {
			gsap.set(tab, { clearProps: 'width' });
			gsap.set(copyEl, { autoAlpha: next ? 1 : 0 });
			return;
		}
		const to = px(next ? '--open-width' : '--closed-width');
		tl = gsap
			.timeline({ onComplete: () => gsap.set(tab, { clearProps: 'width' }) })
			.fromTo(tab, { width: from }, { width: to, ...WIDTH }, 0);
		// The copy follows the width in, and leaves before it narrows.
		if (next) tl.fromTo(copyEl, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, ease: 'power2.out' }, WIDTH.duration * 0.45);
		else tl.to(copyEl, { autoAlpha: 0, duration: 0.15, ease: 'power2.in' }, 0);

		return () => tl?.kill();
	});
</script>

<li class="tab" class:open bind:this={tab}>
	<button type="button" class="face" aria-expanded={open} onclick={onselect}>
		<span class="number type-annotation type-tabular">{number}</span>
		<span class="copy" bind:this={copyEl} style:visibility={untrack(() => (open ? null : 'hidden'))}>
			<span class="title type-body-default">{title}</span>
			<span class="text type-body-default">{text}</span>
		</span>
	</button>
</li>

<style>
	.tab {
		--badge: calc(var(--size-font) * 1.375);
		flex: none;
		width: var(--closed-width);
		height: var(--strip-height);
		box-sizing: border-box;
		border-left: 1px solid var(--grey-775);
		/* Sideways the tab trims its copy as it narrows; downwards the open
		   description hangs below the strip. */
		overflow-x: clip;
	}
	.tab.open {
		width: var(--open-width);
	}

	/* The badge sits in the top-left corner, as far in from the hairline
	   as from the strip's top and bottom (8px at 1440), open or closed; the
	   title beside it. */
	.face {
		--inset: calc((var(--strip-height) - var(--badge)) / 2);
		position: relative;
		display: flex;
		align-items: flex-start;
		gap: var(--space-24);
		width: 100%;
		height: 100%;
		box-sizing: border-box;
		padding: var(--inset);
		border: 0;
		background: none;
		color: var(--grey-0);
		text-align: left;
		cursor: pointer;
	}
	.tab:not(.open) .face:hover {
		color: var(--grey-400);
	}
	.face:focus-visible {
		outline: 1px solid var(--grey-0);
		outline-offset: -1px;
	}

	/* Grey while closed, the accent once open. Swaps at once, no
	   transition: fading the fill and the number together passes through a
	   moment where they're the same shade, and the number flickers. */
	.number {
		flex: none;
		display: grid;
		place-items: center;
		width: var(--badge);
		height: var(--badge);
		border-radius: var(--stage-radius);
		background: var(--grey-775);
	}
	.open .number {
		background: var(--accent-500);
	}

	/* The title on one line, 16px, centred on the badge. */
	.copy {
		display: flex;
		flex: none;
		align-items: center;
		height: var(--badge);
		white-space: nowrap;
	}
	/* Below the strip, in line with the badge: 320px wide at 1440, a fixed
	   measure so it never rewraps as the tab widens. */
	.text {
		position: absolute;
		top: calc(100% + var(--space-24));
		left: var(--inset);
		width: calc(var(--size-font) * 20);
		color: var(--grey-400);
		white-space: normal;
	}
</style>
