<!--
	@component
	The fixed top-left wordmark linking home, at the size and spot where
	home's hero wordmark comes to rest. A white difference blend keeps it
	legible on any background. Hides on scroll down with the header. Used on
	every page but home, whose hero brings its own.
-->
<script lang="ts">
	import Wordmark from '$lib/components/Wordmark.svelte';
	import { header, slideWithHeader } from '$lib/chrome/header.svelte';
</script>

<a
	class="mark"
	href="/"
	aria-label="Antares home"
	{@attach slideWithHeader(
		() => header.hidden,
		() => header.follow
	)}><Wordmark /></a
>

<style>
	/* Centred on the menu button's line, matching the hero's resting mark. */
	.mark {
		--height: var(--wordmark-rest);
		position: fixed;
		top: calc(var(--header-top) + (var(--header-button) - var(--height)) / 2);
		left: var(--grid-margin);
		z-index: 40;
		display: block;
		height: var(--height);
		color: var(--white);
		mix-blend-mode: difference;
	}
	.mark:focus-visible {
		outline: 1px solid currentColor;
		outline-offset: 4px;
	}
</style>
