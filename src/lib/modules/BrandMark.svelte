<!--
	@component
	The wordmark fixed in the top-left corner, linking home: 12px tall at
	1440 (--wordmark-rest), centred on the menu button opposite, where the home page's hero
	wordmark comes to rest. White with a difference blend, so it reads black
	on light pages and white on dark ones and over images. The layout puts
	it on every page but home, whose hero brings its own.
-->
<script lang="ts">
	import Wordmark from '$lib/components/Wordmark.svelte';
</script>

<a class="mark" href="/" aria-label="Antares home"><Wordmark /></a>

<style>
	/* The menu button is 34px (2.125 units) one page margin from the top;
	   the mark sits on its centre line, as the hero's does. */
	.mark {
		--height: var(--wordmark-rest);
		position: fixed;
		top: calc(var(--page-margin) + (var(--size-font) * 2.125 - var(--height)) / 2);
		left: var(--grid-margin);
		z-index: 40;
		display: block;
		height: var(--height);
		color: var(--grey-0);
		mix-blend-mode: difference;
	}
	.mark:focus-visible {
		outline: 1px solid currentColor;
		outline-offset: 4px;
	}
</style>
