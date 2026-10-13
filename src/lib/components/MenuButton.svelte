<!--
	@component
	The round menu toggle: four dots in a square that glide to the centre and
	merge into one when the menu is open.
-->
<script lang="ts">
	import { gsap, prefersReducedMotion } from '$lib/motion/scroll';

	let {
		open = false,
		tone = 'light',
		controls,
		onclick
	}: {
		open?: boolean;
		/** `dark` over dark backgrounds: a dark frosted fill, white dots. */
		tone?: 'light' | 'dark';
		/** The id of the panel this button shows and hides. */
		controls: string;
		onclick: (e: MouseEvent) => void;
	} = $props();

	let button: HTMLButtonElement;
	let face: HTMLSpanElement;

	/**
	 * Tone changes crossfade the dark fill (--dark, 0 to 1) and the dot colour,
	 * resolved from tokens so GSAP can blend them. Open, the dots stay dark.
	 */
	const FADE = { duration: 0.15, ease: 'power1.out' };
	/* Matches the white fill's timing, so the dark one never drops out ahead
	   of it and flashes the translucent grey. */
	const TOGGLE = { duration: 0.3, ease: 'menu' };
	let first = true;
	let wasOpen = false;
	$effect(() => {
		const dark = tone === 'dark';
		const isOpen = open;
		const token = (name: string) => getComputedStyle(button).getPropertyValue(name).trim();
		const to = {
			'--dark': dark && !isOpen ? 1 : 0,
			color: token(dark && !isOpen ? '--white' : '--black')
		};
		if (first || prefersReducedMotion()) gsap.set(button, to);
		else gsap.to(button, { ...to, ...(isOpen !== wasOpen ? TOGGLE : FADE), overwrite: 'auto' });
		first = false;
		wasOpen = isOpen;
	});

	/**
	 * A press bounce. GSAP rather than :active, which a quick click holds for
	 * only a few ms. Scales the face, not the button: scaling the element with
	 * the backdrop blur re-rasterises the blur mid-tween and the fill flickers.
	 */
	function bounce() {
		if (prefersReducedMotion()) return;
		gsap.killTweensOf(face, 'scale');
		gsap
			.timeline({ defaults: { force3D: true } })
			.to(face, { scale: 0.95, duration: 0.08, ease: 'power2.out' })
			.to(face, { scale: 1, duration: 0.45, ease: 'back.out(3)' });
	}

	/** Each dot's resting offset and its hover offset (1px further out). */
	const DOTS = [
		{ x: -5, y: -5, hx: -6, hy: -6 },
		{ x: 5, y: -5, hx: 6, hy: -6 },
		{ x: -5, y: 5, hx: -6, hy: 6 },
		{ x: 5, y: 5, hx: 6, hy: 6 }
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
	<span class="face" bind:this={face}>
	<!-- Centred on 0,0, so a dot's resting place is its offset. -->
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
	</span>
</button>

<style>
	.menu-button {
		/* Keep in step with CustomEase 'menu' in $lib/motion/scroll. */
		--ease: cubic-bezier(0.48, 0.02, 0.03, 0.98);
		position: relative;
		display: block;
		width: calc(var(--size-font) * 2.125);
		height: calc(var(--size-font) * 2.125);
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--black);
		cursor: pointer;
		/* Frosted glass behind the translucent fill; cheap at this size. */
		-webkit-backdrop-filter: blur(4px);
		backdrop-filter: blur(4px);
	}
	/* What bounces on a press: the fills and the dots, inside the blur. */
	.face {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		/* Always its own layer: GSAP promoting and dropping it around the
		   bounce re-composites the fills under the blur, a one-frame flash. */
		will-change: transform;
	}
	/* Translucent via opacity, since the colour tokens have no alpha values. */
	.face::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: var(--button);
		opacity: 0.4;
		transition:
			opacity 300ms var(--ease),
			background 300ms var(--ease);
	}
	/* The dark fill, faded in by --dark (GSAP, above); 0 while open. */
	.face::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: var(--grey-800);
		opacity: var(--dark, 0);
	}
	/* Matches the panel it opened. */
	.open .face::before,
	.open:hover .face::before {
		background: var(--white);
		opacity: 1;
	}
	/* A hit area of at least 24px at small sizes. */
	.menu-button::before {
		content: '';
		position: absolute;
		inset: -4px;
	}
	.menu-button:focus-visible {
		outline: 1px solid var(--black);
		outline-offset: 2px;
	}
	svg {
		position: relative;
		z-index: 1;
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	.dot {
		fill: currentColor;
		transform: translate(var(--x), var(--y));
		transition: transform 300ms var(--ease);
	}
	/* Real pointers only: on touch, a tap would leave the hover stuck. */
	@media (hover: hover) {
		.menu-button:not(.open):hover .dot {
			transform: translate(var(--hx), var(--hy));
		}
	}
	/* Slower to merge; a transition follows its target state, so hover and
	   closing keep 300ms. */
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
