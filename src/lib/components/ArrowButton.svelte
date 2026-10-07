<!--
	@component
	A round, outlined arrow button for stepping through a carousel: the
	ring of Capabilities' toggle (36px at 1440) around a 16px arrow. The
	ring darkens on hover; at the end of the run it's disabled and fades.
-->
<script lang="ts">
	import left from '$lib/assets/icons/left-arrow.svg?raw';
	import right from '$lib/assets/icons/right-arrow.svg?raw';

	let {
		direction,
		label,
		disabled = false,
		onclick
	}: {
		direction: 'previous' | 'next';
		/** Accessible name, e.g. "Previous openings". */
		label: string;
		disabled?: boolean;
		onclick: () => void;
	} = $props();
</script>

<button class="arrow" type="button" aria-label={label} {disabled} {onclick}>
	<span class="icon" aria-hidden="true">{@html direction === 'next' ? right : left}</span>
</button>

<style>
	.arrow {
		display: grid;
		place-items: center;
		width: calc(var(--size-font) * 2.25);
		height: calc(var(--size-font) * 2.25);
		box-sizing: border-box;
		padding: 0;
		border: 1px solid var(--grey-300);
		border-radius: 50%;
		background: none;
		color: var(--grey-950);
		cursor: pointer;
		transition: border-color 0.25s ease, opacity 0.25s ease;
	}
	.arrow:hover:not(:disabled) {
		border-color: var(--grey-950);
	}
	.arrow:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.arrow:focus-visible {
		outline: 1px solid var(--grey-950);
		outline-offset: 2px;
	}
	.icon {
		display: block;
		width: calc(var(--size-font) * 1);
		height: calc(var(--size-font) * 1);
	}
	.icon :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
	.icon :global(path) {
		stroke: currentColor;
	}
</style>
