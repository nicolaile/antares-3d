<!--
	@component
	The outlined square icon button behind ArrowButton and PauseButton, the
	same ring as ToggleRing. Icons draw in currentColor; strokes take it too.
	Disabled stays focusable (`aria-disabled`, clicks ignored), so focus isn't
	dropped when, say, a carousel arrow reaches the end.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label,
		tone = 'light',
		pressed,
		disabled = false,
		onclick,
		children
	}: {
		/** Accessible name: the button has no visible text. */
		label: string;
		/** `dark` for dark stages and imagery. */
		tone?: 'light' | 'dark';
		/** For toggles: sets `aria-pressed`. */
		pressed?: boolean;
		/** Announced and faded, but still focusable; clicks do nothing. */
		disabled?: boolean;
		onclick: () => void;
		children: Snippet;
	} = $props();
</script>

<button
	class="outline"
	class:dark={tone === 'dark'}
	type="button"
	aria-label={label}
	aria-pressed={pressed}
	aria-disabled={disabled}
	onclick={() => disabled || onclick()}
>
	<span class="icon" aria-hidden="true">{@render children()}</span>
</button>

<style>
	.outline {
		display: grid;
		place-items: center;
		width: calc(var(--size-font) * 2.25);
		height: calc(var(--size-font) * 2.25);
		box-sizing: border-box;
		padding: 0;
		border: 1px solid var(--grey-200);
		border-radius: 8px;
		background: none;
		color: var(--black);
		cursor: pointer;
		transition:
			border-color 0.25s ease,
			opacity 0.25s ease;
	}
	.outline:hover:not([aria-disabled='true']) {
		border-color: var(--black);
	}
	.outline[aria-disabled='true'] {
		opacity: 0.4;
		cursor: default;
	}
	.outline:focus-visible {
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
