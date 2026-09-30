<!--
	@component
	The round menu toggle: four 3px dots in a square that glide to the centre
	and merge into one when the menu is open. 34px at 1440, scaling with the
	Osmo system; the dots are vector so they stay crisp at any size.
-->
<script lang="ts">
	import { gsap, prefersReducedMotion } from '$lib/scroll';

	let {
		open = false,
		controls,
		onclick
	}: {
		open?: boolean;
		/** id of the panel this button shows and hides. */
		controls: string;
		onclick: (e: MouseEvent) => void;
	} = $props();

	let button: HTMLButtonElement;

	/**
	 * A tiny bounce on every press: a quick dip to 95%, then a spring back
	 * with a slight overshoot. GSAP rather than :active, because a quick
	 * click holds :active for only a few milliseconds.
	 */
	function bounce() {
		if (prefersReducedMotion()) return;
		gsap
			.timeline({ overwrite: true })
			.to(button, { scale: 0.95, duration: 0.08, ease: 'power2.out' })
			.to(button, { scale: 1, duration: 0.45, ease: 'back.out(3)' });
	}

	/**
	 * Each dot's resting place (a square, 5px out on each axis) and its hover
	 * place (a diamond, 7px out on one axis) — the square turned 45°, each
	 * dot moving a quarter-turn to its neighbour's side.
	 */
	const DOTS = [
		{ x: -5, y: -5, hx: 0, hy: -7 },
		{ x: 5, y: -5, hx: 7, hy: 0 },
		{ x: -5, y: 5, hx: -7, hy: 0 },
		{ x: 5, y: 5, hx: 0, hy: 7 }
	] as const;
</script>

<button
	type="button"
	class="menu-button"
	class:open
	aria-expanded={open}
	aria-controls={controls}
	aria-label={open ? 'Close menu' : 'Open menu'}
	bind:this={button}
	onclick={(e) => {
		bounce();
		onclick(e);
	}}
>
	<!-- 34-unit box centred on 0,0, so a dot's resting place is its offset. -->
	<svg viewBox="-17 -17 34 34" aria-hidden="true">
		{#each DOTS as dot, i (i)}
			<rect
				class="dot"
				x="-1.5"
				y="-1.5"
				width="3"
				height="3"
				style:--x="{dot.x}px"
				style:--y="{dot.y}px"
				style:--hx="{dot.hx}px"
				style:--hy="{dot.hy}px"
			/>
		{/each}
	</svg>
</button>

<style>
	.menu-button {
		/* Keep in step with CustomEase 'menu' in $lib/scroll. */
		--ease: cubic-bezier(0.48, 0.02, 0.03, 0.98);
		position: relative;
		display: block;
		width: calc(var(--size-font) * 2.125);
		height: calc(var(--size-font) * 2.125);
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--grey-950);
		cursor: pointer;
		/* Frosted glass behind the translucent fill. Only a 34px circle, so
		   the blur costs next to nothing. */
		-webkit-backdrop-filter: blur(4px);
		backdrop-filter: blur(4px);
	}
	/* Grey 300 at 40%, on its own layer: the colour system allows no
	   translucent colour values, so opacity does it — and the layer
	   cross-fades to solid white when open. */
	.menu-button::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: var(--grey-300);
		opacity: 0.4;
		transition:
			opacity 300ms var(--ease),
			background 300ms var(--ease);
	}
	/* Open: solid white, matching the panel it opened. */
	.open::before,
	.open:hover::before {
		background: var(--grey-0);
		opacity: 1;
	}
	.menu-button:focus-visible {
		outline: 1px solid var(--grey-950);
		outline-offset: 2px;
	}
	svg {
		position: relative;
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	/* Rest: a square of dots. Hover: turned into a diamond. Open: all four
	   pulled to the centre, where they overlap into one. All on the menu
	   curve. */
	.dot {
		fill: currentColor;
		transform: translate(var(--x), var(--y));
		transition: transform 300ms var(--ease);
	}
	/* Real pointers only: on touch, a tap would leave the diamond stuck. */
	@media (hover: hover) {
		.menu-button:not(.open):hover .dot {
			transform: translate(var(--hx), var(--hy));
		}
	}
	/* Merging into one on open takes a little longer: 400ms. A transition
	   follows the state it's going to, so hover and closing keep 300ms. */
	.open .dot {
		transform: translate(0, 0);
		transition-duration: 400ms;
	}

	@media (prefers-reduced-motion: reduce) {
		.dot {
			transition: none;
		}
	}
</style>
