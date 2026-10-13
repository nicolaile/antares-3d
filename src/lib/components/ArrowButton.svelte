<!--
	@component
	A square, outlined arrow button (4px corners) for stepping through a carousel: the
	ring of Capabilities' toggle (36px at 1440) around a 16px arrow. The
	ring darkens on hover; at the end of the run it's disabled and fades.

	`tone="dark"`, for controls over a dark stage (the reactor explorer's
	feature steppers): the same outlined square in Grey 750 with a white
	chevron, the outline turning white on hover.
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
		/** `dark`: the small filled square with a chevron, for dark stages. */
		tone?: 'light' | 'dark';
		/** Accessible name, e.g. "Previous openings". */
		label: string;
		disabled?: boolean;
		onclick: () => void;
	} = $props();

	const icon = $derived(
		tone === 'dark' ? (direction === 'next' ? chevronRight : chevronLeft) : direction === 'next' ? right : left
	);
</script>

<button class="arrow" class:dark={tone === 'dark'} type="button" aria-label={label} {disabled} {onclick}>
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
	.arrow:hover:not(:disabled) {
		border-color: var(--black);
	}
	.arrow:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.arrow:focus-visible {
		outline: 1px solid var(--black);
		outline-offset: 2px;
	}

	/* Dark: the same square outlined in Grey 750 on a dark stage, the
	   chevron white; the outline turns white on hover. */
	.dark {
		border-color: var(--grey-750);
		color: var(--white);
	}
	.dark:hover:not(:disabled) {
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
