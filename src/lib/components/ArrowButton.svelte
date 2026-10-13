<!--
	@component
	An outlined square arrow button for stepping through a carousel, the same
	ring as ToggleRing. Disabled stays focusable (`aria-disabled`, clicks
	ignored), so focus isn't dropped when the arrow reaches the end.
-->
<script lang="ts">
	import left from '$lib/assets/icons/left-arrow.svg?raw';
	import right from '$lib/assets/icons/right-arrow.svg?raw';
	import chevronLeft from '$lib/assets/icons/chevron-left.svg?raw';
	import chevronRight from '$lib/assets/icons/chevron-right.svg?raw';

	let {
		direction,
		label,
		disabled = false,
		tone = 'light',
		onclick
	}: {
		direction: 'previous' | 'next';
		/** `dark`: a chevron in a dark outline, for dark stages (the reactor explorer). */
		tone?: 'light' | 'dark';
		/** Accessible name, e.g. "Previous openings". */
		label: string;
		/** Announced and faded, but still focusable; clicks do nothing. */
		disabled?: boolean;
		onclick: () => void;
	} = $props();

	const icon = $derived(
		tone === 'dark' ? (direction === 'next' ? chevronRight : chevronLeft) : direction === 'next' ? right : left
	);
</script>

<button
	class="arrow"
	class:dark={tone === 'dark'}
	type="button"
	aria-label={label}
	aria-disabled={disabled}
	onclick={() => disabled || onclick()}
>
	<span class="icon" aria-hidden="true">{@html icon}</span>
</button>

<style>
	.arrow {
		display: grid;
		place-items: center;
		width: calc(var(--size-font) * 2.25);
		height: calc(var(--size-font) * 2.25);
		box-sizing: border-box;
		padding: 0;
		border: 1px solid var(--grey-200);
		border-radius: 4px;
		background: none;
		color: var(--black);
		cursor: pointer;
		transition: border-color 0.25s ease, opacity 0.25s ease;
	}
	.arrow:hover:not([aria-disabled='true']) {
		border-color: var(--black);
	}
	.arrow[aria-disabled='true'] {
		opacity: 0.4;
		cursor: default;
	}
	.arrow:focus-visible {
		outline: 1px solid var(--black);
		outline-offset: 2px;
	}

	.dark {
		border-color: var(--grey-750);
		color: var(--white);
	}
	.dark:hover:not([aria-disabled='true']) {
		border-color: var(--white);
	}
	.dark:focus-visible {
		outline-color: var(--white);
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
