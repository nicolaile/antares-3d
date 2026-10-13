<!--
	@component
	Pauses and resumes something that moves on its own: a loop, an
	animation. The name stays put and `aria-pressed` carries the state, so a
	screen reader hears "Pause video, pressed" rather than a name that
	swaps under it. Shows a play icon while paused.
-->
<script lang="ts">
	import IconButton from '$lib/components/IconButton.svelte';

	let {
		paused = $bindable(false),
		label
	}: {
		paused?: boolean;
		/** What it pauses, as an action: "Pause video". */
		label: string;
	} = $props();
</script>

<IconButton {label} pressed={paused} onclick={() => (paused = !paused)}>
	<svg viewBox="0 0 12 12" aria-hidden="true">
		{#if paused}
			<path d="M3 1.5v9l7.5-4.5z" fill="currentColor" />
		{:else}
			<rect x="3" y="2" width="2" height="8" fill="currentColor" />
			<rect x="7" y="2" width="2" height="8" fill="currentColor" />
		{/if}
	</svg>
</IconButton>
