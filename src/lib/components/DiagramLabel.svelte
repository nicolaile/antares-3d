<!--
	@component
	A marker on a diagram: a small dark square with a plus. On hover or
	focus it turns orange and a card opens out beside it, top-aligned with
	it, carrying the part's name and a line on what it does: to the right,
	or to the left near the diagram's right edge so it never clips. The
	square keeps one size on screen whatever size the diagram is; its
	position is a fraction of the diagram so it tracks the drawing exactly.
-->
<script lang="ts">
	import { gsap, prefersReducedMotion } from '$lib/scroll';

	let {
		label,
		text = undefined,
		x,
		y,
		order = 0,
		lit = false,
		onactive
	}: {
		label: string;
		/** What the part does, under its name on the card. */
		text?: string;
		/** Position as fractions of the diagram, 0..1. */
		x: number;
		y: number;
		/** Place in the reveal sequence. */
		order?: number;
		/** This marker's part is the one highlighted. */
		lit?: boolean;
		/** Hover, focus or tap starts (true) or ends (false). */
		onactive?: (on: boolean) => void;
	} = $props();

	// Cards near the right edge open to the left, so they never clip.
	const align = $derived(x > 0.7 ? 'end' : 'start');

	let boxEl: HTMLSpanElement;
	let cardEl: HTMLSpanElement;
	let hovered = $state(false);
	/** Keyboard focus — or any focus on touch, where a tap is the hover. */
	let focused = $state(false);
	const open = $derived(hovered || focused);

	function onfocus(e: FocusEvent) {
		const el = e.currentTarget as HTMLElement;
		focused = matchMedia('(hover: none)').matches || el.matches(':focus-visible');
		onactive?.(true);
	}
	function onblur() {
		focused = false;
		onactive?.(false);
	}

	/**
	 * Open: the square turns orange, and the card fades in as it opens out
	 * from the square's side. Close plays it back, quicker.
	 */
	let tl: gsap.core.Timeline | null = null;
	$effect(() => {
		const on = open;
		if (!cardEl) return;
		const root = getComputedStyle(document.documentElement);
		const fill = root.getPropertyValue(on ? '--accent-500' : '--grey-775').trim();
		const shut = align === 'end' ? 'inset(0% 0% 0% 100%)' : 'inset(0% 100% 0% 0%)';
		const quick = prefersReducedMotion() ? 0 : 1;
		tl?.kill();
		tl = gsap
			.timeline()
			.to(boxEl, { backgroundColor: fill, duration: 0.2 * quick, ease: 'power1.out' }, 0)
			.to(cardEl, { autoAlpha: on ? 1 : 0, duration: (on ? 0.2 : 0.12) * quick, ease: 'power1.out' }, 0)
			.fromTo(
				cardEl,
				{ clipPath: on ? shut : 'inset(0% 0% 0% 0%)' },
				{ clipPath: on ? 'inset(0% 0% 0% 0%)' : shut, duration: (on ? 0.4 : 0.2) * quick, ease: on ? 'power3.out' : 'power2.in' },
				0
			);
		return () => tl?.kill();
	});
</script>

<button
	class="marker {align}"
	class:lit
	class:open
	type="button"
	onpointerenter={() => {
		hovered = true;
		onactive?.(true);
	}}
	onpointerleave={() => {
		hovered = false;
		onactive?.(false);
	}}
	{onfocus}
	{onblur}
	style:left="{x * 100}%"
	style:top="{y * 100}%"
	style:--order={order}
>
	<span class="box" aria-hidden="true" bind:this={boxEl}>
		<svg viewBox="0 0 10 10"><path d="M5 0V10M0 5H10" /></svg>
	</span>
	<span class="card" bind:this={cardEl}>
		<span class="name type-annotation">{label}</span>
		{#if text}<span class="text type-annotation">{text}</span>{/if}
	</span>
</button>

<style>
	.marker {
		/* The square: 22px at 1440, its plus 16px with 3px clear all round. */
		--plus: calc(var(--size-font) * 1);
		--box: calc(var(--plus) + var(--size-font) * 0.375);
		position: absolute;
		width: var(--box);
		height: var(--box);
		margin: calc(var(--box) * -0.5) 0 0 calc(var(--box) * -0.5);
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}
	/* The type unit grows on phones; the diagram doesn't, so hold the squares back. */
	@media screen and (max-width: 767px) {
		.marker {
			--plus: calc(var(--size-font) * 0.8);
			--box: calc(var(--plus) + var(--size-font) * 0.3);
		}
	}

	.box {
		position: absolute;
		inset: 0;
		z-index: 2;
		display: grid;
		place-items: center;
		border-radius: var(--stage-radius);
		background: var(--grey-775);
		color: var(--grey-0);
	}
	.box svg {
		position: relative;
		z-index: 1;
		width: var(--plus);
		height: var(--plus);
		overflow: visible;
	}
	.box path {
		fill: none;
		stroke: currentColor;
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	.marker:focus-visible {
		outline: none;
	}
	.marker:focus-visible .box {
		outline: 1px solid var(--grey-0);
		outline-offset: 2px;
	}

	/* Beside the square, its top level with the square's, a gap between. */
	.card {
		position: absolute;
		top: 0;
		z-index: 1;
		display: flex;
		flex-direction: column;
		/* 216px at 1440. */
		width: calc(var(--size-font) * 13.5);
		box-sizing: border-box;
		padding: var(--space-16);
		border-radius: var(--stage-radius);
		background: var(--grey-800);
		color: var(--grey-0);
		text-align: left;
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
	}
	.start .card {
		left: calc(100% + var(--space-8));
	}
	.end .card {
		right: calc(100% + var(--space-8));
	}
	/* Bridges the gap to the square, so the pointer can cross it onto the
	   card without the marker closing. */
	.card::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		width: var(--space-8);
	}
	.start .card::before {
		right: 100%;
	}
	.end .card::before {
		left: 100%;
	}
	.text {
		color: var(--grey-400);
		text-wrap: balance;
	}

	/* Open (hover, keyboard focus, or a tap on touch): on top of its
	   neighbours, and the card takes the pointer too — it's inside the
	   marker, so moving from the square onto it keeps the marker open. The
	   motion itself is GSAP, in the script. */
	.open {
		z-index: 3;
	}
	.open .card {
		pointer-events: auto;
	}
</style>
