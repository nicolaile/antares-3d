<!--
	@component
	A square icon-only button. The icon is a snippet so callers draw their own.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label,
		pressed,
		onclick,
		children
	}: {
		/** Accessible name — the button has no visible text. */
		label: string;
		pressed?: boolean;
		onclick: () => void;
		children: Snippet;
	} = $props();
</script>

<button class="icon-button" type="button" aria-label={label} aria-pressed={pressed} {onclick}>
	{@render children()}
</button>

<style>
	.icon-button {
		display: grid;
		place-items: center;
		width: var(--toggle-size);
		height: var(--toggle-size);
		padding: 0;
		border: 0;
		background: var(--grey-200);
		color: var(--grey-950);
		cursor: pointer;
		transition: background 0.25s ease;
	}
	.icon-button:hover {
		background: var(--grey-400);
	}
	.icon-button:focus-visible {
		outline: 1px solid var(--grey-950);
		outline-offset: 2px;
	}
	.icon-button :global(svg) {
		width: calc(var(--size-font) * 0.75);
		height: calc(var(--size-font) * 0.75);
	}
</style>
