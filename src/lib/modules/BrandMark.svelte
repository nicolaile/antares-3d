<!--
	@component
	The wordmark fixed in the top-left corner, linking home: 20px tall at
	1440 (--wordmark-rest), centred on the menu button opposite, where the home page's hero
	wordmark comes to rest. White with a difference blend, so it reads black
	on light pages and white on dark ones and over images (and on the header
	bar, white or dark). It slides up out of the way while the visitor
	scrolls down, and back as they scroll up. The layout puts it on every
	page but home, whose hero brings its own.
-->
<script lang="ts">
	import Wordmark from '$lib/components/Wordmark.svelte';
	import { header, slideWithHeader } from '$lib/header.svelte';
</script>

<a class="mark" href="/" aria-label="Antares home" {@attach slideWithHeader(() => header.hidden, () => header.follow)}><Wordmark /></a>

<style>
	/* On the menu button's centre line, in the middle of the header band,
	   as the hero's mark is. */
	.mark {
		--height: var(--wordmark-rest);
		position: fixed;
		top: calc(var(--header-top) + (var(--header-button) - var(--height)) / 2);
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
