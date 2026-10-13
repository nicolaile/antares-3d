<!--
	@component
	A "WIP" tag marking stand-in media as not final. Place it inside a
	positioned box; it pins itself to `corner`.
-->
<script lang="ts">
	let {
		label = 'WIP',
		corner = 'top-right',
		tone = 'accent'
	}: {
		label?: string;
		/** `bottom`: centred along the foot, under what it tags. */
		corner?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'bottom';
		/** `dark` or `light` to sit back from the orange accent. */
		tone?: 'accent' | 'light' | 'dark';
	} = $props();
</script>

<span class="wip type-annotation {corner} {tone}" title="Work in progress: not final">{label}</span>

<style>
	.wip {
		position: absolute;
		z-index: 2;
		padding: var(--space-4) var(--space-8);
		border-radius: var(--stage-radius);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		pointer-events: none;
	}
	.top-left,
	.top-right {
		top: var(--space-8);
	}
	.bottom-left,
	.bottom-right,
	.bottom {
		bottom: var(--space-8);
	}
	.bottom {
		left: 50%;
		translate: -50% 0;
		white-space: nowrap;
	}
	.top-left,
	.bottom-left {
		left: var(--space-8);
	}
	.top-right,
	.bottom-right {
		right: var(--space-8);
	}
	.accent {
		background: var(--orange);
		color: var(--white);
	}
	.dark {
		background: var(--black);
		color: var(--white);
		box-shadow: inset 0 0 0 1px var(--grey-700);
	}
	.light {
		background: var(--white);
		color: var(--black);
	}
</style>
