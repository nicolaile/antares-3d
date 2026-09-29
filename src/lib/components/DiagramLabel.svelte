<!--
	@component
	A marker on a diagram: an accent dot that reveals its label on hover or
	focus, with a leader line up to a boxed tag. The dot keeps one size on
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
	<span class="tag type-label">{label}</span>
</button>

<style>
	.marker {
		--dot: calc(var(--size-font) * 0.42);
		--leader: calc(var(--size-font) * 1.8);
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
			--dot: calc(var(--size-font) * 0.36);
		}
	}

	.dot {
		position: absolute;
		inset: 0;
		margin: auto;
		width: var(--dot);
		height: var(--dot);
		border-radius: 50%;
		background: var(--accent-500);
		transition: transform 0.3s ease;
	}
	.marker:hover .dot,
	.marker:focus-visible .dot {
		transform: scale(1.35);
	}
	.marker:focus-visible {
		outline: 1px solid var(--label-ink);
		outline-offset: -2px;
		border-radius: 50%;
	}

	/* Leader line from the dot up to the tag. */
	.marker::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: calc(50% + var(--dot) * 0.5);
		width: 1px;
		height: var(--leader);
		background: var(--label-ink);
		transform: scaleY(0);
		transform-origin: bottom;
		transition: transform 0.25s ease;
	}

	.tag {
		position: absolute;
		bottom: calc(50% + var(--dot) * 0.5 + var(--leader));
		padding: calc(var(--size-font) * 0.3) calc(var(--size-font) * 0.55);
		border: 1px solid var(--label-ink);
		background: var(--label-fill);
		color: var(--label-ink);
		white-space: nowrap;
		opacity: 0;
		transform: translateY(calc(var(--size-font) * 0.3));
		transition:
			opacity 0.2s ease,
			transform 0.25s ease;
		pointer-events: none;
	}
	.center .tag {
		left: 50%;
		translate: -50% 0;
	}
	.start .tag {
		left: calc(50% - var(--size-font) * 0.6);
	}
	.end .tag {
		right: calc(50% - var(--size-font) * 0.6);
	}

	.marker:hover::after,
	.marker:focus-visible::after {
		transform: scaleY(1);
	}
	.marker:hover .tag,
	.marker:focus-visible .tag {
		opacity: 1;
		transform: none;
		transition-delay: 0.08s;
	}
	/* Touch has no hover: a tap focuses the marker, so show it on plain focus. */
	@media (hover: none) {
		.marker:focus::after {
			transform: scaleY(1);
		}
		.marker:focus .tag {
			opacity: 1;
			transform: none;
		}
	}
</style>
