<script lang="ts">
	import '../app.css';
	import '$lib/styles/colors.css';
	import '$lib/styles/spacing.css';
	import '$lib/styles/typography.css';
	import favicon from '$lib/assets/favicon.svg';
	import { dev } from '$app/environment';
	import { page } from '$app/state';
	import { onNavigate, afterNavigate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { getLenis } from '$lib/motion/scroll';
	import Menu from '$lib/chrome/Menu.svelte';
	import BrandMark from '$lib/chrome/BrandMark.svelte';
	import HeaderBar from '$lib/chrome/HeaderBar.svelte';
	import { trackHeader, updateHeader } from '$lib/chrome/header.svelte';
	import { menu } from '$lib/content/site';
	import DevTools from '$lib/dev/DevTools.svelte';
	let { children } = $props();

	/**
	 * A new page starts at the top before it mounts, not after: SvelteKit
	 * only resets the scroll once the page is in, and until then the old
	 * page's position is clamped into the new, still-short one. Missions'
	 * pinned slideshow took that for a visitor arriving at its pin and held
	 * the page there. Back and forward, and links to a #section, keep
	 * SvelteKit's own restore.
	 */
	onNavigate(({ type, to }) => {
		if (type === 'popstate' || to?.url.hash) return;
		getLenis()?.scrollTo(0, { immediate: true, force: true });
		window.scrollTo(0, 0);
	});

	/** The header follows the scroll on every page, and starts out showing on each new one. */
	onMount(trackHeader);
	afterNavigate(() => updateHeader(true));
</script>

<svelte:head>
	<link rel="icon" href={favicon} type="image/svg+xml" />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
</svelte:head>

<!-- First in the tab order: past the header and menu, to the page's <main id="content">. -->
<a class="skip-link type-button" href="#content">Skip to content</a>

<HeaderBar />
<Menu {...menu} current={page.url.pathname} />

<!-- Home's hero carries its own wordmark into this corner. -->
{#if page.url.pathname !== '/'}<BrandMark />{/if}

{@render children?.()}

{#if dev}<DevTools />{/if}

<style>
	/* Out of sight until the keyboard reaches it, then over the header, top left. */
	.skip-link {
		position: fixed;
		top: var(--space-16);
		left: var(--space-16);
		z-index: 60;
		padding: var(--space-8) var(--space-12);
		border-radius: var(--space-4);
		background: var(--white);
		color: var(--black);
		text-decoration: none;
	}
	.skip-link:not(:focus-visible) {
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	/* <main> takes focus from the skip link only to move the reading point; no ring round the page. */
	:global(main[tabindex='-1']:focus) {
		outline: none;
	}
</style>
