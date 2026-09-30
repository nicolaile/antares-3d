<script lang="ts">
	import '../app.css';
	import '$lib/styles/colors.css';
	import '$lib/styles/spacing.css';
	import '$lib/styles/typography.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import Menu from '$lib/modules/Menu.svelte';
	import { menu } from '$lib/content/site';
	let { children } = $props();

	/** Remembered across visits, so the tools stay how you left them. */
	const KEY = 'antares:tools';

	/**
	 * Shift+H shows or hides every tool button (pause, render and energy
	 * controls) at once. Hidden by default. The state lives on <html> as
	 * `data-tools`, which app.css reads; app.html restores it before paint.
	 */
	function onkeydown(e: KeyboardEvent) {
		if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== 'h') return;
		const el = e.target as HTMLElement | null;
		if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
		const on = document.documentElement.toggleAttribute('data-tools');
		try {
			localStorage.setItem(KEY, on ? '1' : '0');
		} catch {
			// Storage blocked: the toggle still works for this visit.
		}
	}
</script>

<svelte:window {onkeydown} />

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Menu {...menu} current={page.url.pathname} />

{@render children?.()}
