<!--
	@component
	A marker on a diagram: a small grey square that, on hover or focus,
	opens into an orange pill carrying the part's name — the square turns
	white and sits inside it, and the pill grows out from it towards the
	middle of the diagram. The dot keeps one size on
	screen whatever size the diagram is; its position is a fraction of the
	diagram so it tracks the drawing exactly.
-->
<script lang="ts">
	let {
		label,
		x,
		y,
		order = 0,
		lit = false,
		onactive
	}: {
		label: string;
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

	// Labels near an edge open inwards so they never clip.
	const align = $derived(x < 0.3 ? 'start' : x > 0.7 ? 'end' : 'center');
</script>

<button
	class="marker {align}"
	class:lit
	type="button"
	onpointerenter={() => onactive?.(true)}
	onpointerleave={() => onactive?.(false)}
	onfocus={() => onactive?.(true)}
	onblur={() => onactive?.(false)}
	style:left="{x * 100}%"
	style:top="{y * 100}%"
	style:--order={order}
>
	<span class="dot" aria-hidden="true"></span>
	<span class="tag type-caption"><span class="pill">{label}</span></span>
</button>

<style>
	.marker {
		/* 10px at 1440. */
		--dot: calc(var(--size-font) * 0.625);
		/* The pill: 26px tall, the square inset evenly from its end. */
		--pill: calc(var(--size-font) * 1.625);
		--inset: calc((var(--pill) - var(--dot)) / 2);
		/* Hit area well past the dot, centred on the point, so small dots stay easy to hover and tap. */
		--hit: calc(var(--size-font) * 1.8);
		position: absolute;
		width: var(--hit);
		height: var(--hit);
		margin: calc(var(--hit) * -0.5) 0 0 calc(var(--hit) * -0.5);
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}
	/* The type unit grows on phones; the diagram doesn't, so hold the dots back. */
	@media screen and (max-width: 767px) {
		.marker {
			--dot: calc(var(--size-font) * 0.54);
		}
	}

	.dot {
		position: absolute;
		inset: 0;
		z-index: 2;
		margin: auto;
		width: var(--dot);
		height: var(--dot);
		border-radius: var(--stage-radius);
		background: var(--grey-400);
		transition: background 0.25s ease;
	}
	.marker:focus-visible {
		outline: none;
	}

	/* Centred on the dot vertically; one end sits the square's inset past
	   the dot, so the dot lands inside it like the square in a tag.
	   Two layers: the tag is the full-size, unclipped hit area, so the
	   pointer can move onto the pill while it's still opening without
	   falling through; the pill inside carries the colour and does the
	   reveal, hidden as a sliver around the dot and opening along its
	   length. */
	.tag {
		position: absolute;
		top: 50%;
		z-index: 1;
		display: flex;
		height: var(--pill);
		translate: 0 -50%;
		opacity: 0;
		transition: opacity 0.15s ease;
		pointer-events: none;
	}
	.pill {
		display: flex;
		align-items: center;
		box-sizing: border-box;
		border-radius: 4px;
		background: var(--accent-500);
		color: var(--grey-950);
		white-space: nowrap;
		transition: clip-path 0.35s cubic-bezier(0.22, 1, 0.36, 1);
	}
	/* Opens to the right, square at the left end. */
	.start .tag,
	.center .tag {
		left: calc(50% - var(--dot) / 2 - var(--inset));
	}
	.start .pill,
	.center .pill {
		padding: 0 var(--space-12) 0 calc(var(--inset) + var(--dot) + var(--space-8));
		clip-path: inset(0 calc(100% - var(--pill)) 0 0 round 4px);
	}
	/* Near the right edge it opens to the left instead, square at the right. */
	.end .tag {
		right: calc(50% - var(--dot) / 2 - var(--inset));
	}
	.end .pill {
		padding: 0 calc(var(--inset) + var(--dot) + var(--space-8)) 0 var(--space-12);
		clip-path: inset(0 0 0 calc(100% - var(--pill)) round 4px);
	}

	.marker:hover,
	.marker:focus-visible {
		z-index: 3;
	}
	.marker:hover .dot,
	.marker:focus-visible .dot {
		background: var(--grey-0);
	}
	/* Open, the pill takes the pointer too: it's inside the marker, so moving
	   from the dot onto it keeps the marker hovered and the pill open. */
	.marker:hover .tag,
	.marker:focus-visible .tag {
		opacity: 1;
		pointer-events: auto;
	}
	.marker:hover .pill,
	.marker:focus-visible .pill {
		clip-path: inset(0 round 4px);
	}
	/* Touch has no hover: a tap focuses the marker, so show it on plain focus. */
	@media (hover: none) {
		.marker:focus {
			z-index: 3;
		}
		.marker:focus .dot {
			background: var(--grey-0);
		}
		.marker:focus .tag {
			opacity: 1;
		}
		.marker:focus .pill {
			clip-path: inset(0 round 4px);
		}
	}
</style>
