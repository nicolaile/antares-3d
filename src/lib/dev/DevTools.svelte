<!--
	@component
	Dev-only helpers, mounted by the root layout in `npm run dev`:
	- G toggles the layout grid.
	- Shift+H shows or hides the tool panels (`[data-tool]`: render and energy
	  controls), remembered across visits.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import Grid from './Grid.svelte';

	const KEY = 'antares:tools';

	onMount(() => {
		try {
			if (localStorage.getItem(KEY) === '1') document.documentElement.setAttribute('data-tools', '');
		} catch {
			// Storage blocked: the tools start hidden.
		}
	});

	function onkeydown(e: KeyboardEvent) {
		if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.key.toLowerCase() !== 'h') return;
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

<Grid visible={false} />
