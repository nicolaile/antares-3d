<!--
	@component
	A small "WIP" tag for stand-in media: says the image or video it sits on
	isn't final. Place it inside a positioned box; it pins itself to the
	top-right corner (or `corner`). Orange by default, the accent; light or
	dark to sit back.
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
		/** `accent`: orange, as the open tab's badge (the default); `dark` or `light` to sit back. */
		tone?: 'accent' | 'light' | 'dark';
	} = $props();
</script>

<span class="wip type-annotation {corner} {tone}" title="Work in progress: not final">{label}</span>

<style>
	/* 8px in from its corner at 1440, over whatever it's tagging. */
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
		background: var(--accent-500);
		color: var(--grey-0);
	}
	.dark {
		background: var(--grey-950);
		color: var(--grey-0);
		box-shadow: inset 0 0 0 1px var(--grey-700);
	}
	.light {
		background: var(--grey-0);
		color: var(--grey-950);
	}
</style>
