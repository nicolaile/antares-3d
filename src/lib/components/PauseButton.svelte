<!--
	@component
	Pauses and resumes something that moves on its own, in the ArrowButton
	style (OutlineButton). The name stays put and `aria-pressed` carries the
	state, so a screen reader hears "Pause video, pressed" rather than a name
	that swaps under it.
-->
<script lang="ts">
	import OutlineButton from '$lib/components/OutlineButton.svelte';

	let {
		paused = $bindable(false),
		label,
		tone = 'light'
	}: {
		paused?: boolean;
		/** What it pauses, as an action: "Pause video". */
		label: string;
		/** `dark` for dark stages and imagery. */
		tone?: 'light' | 'dark';
	} = $props();
</script>

<OutlineButton {label} {tone} pressed={paused} onclick={() => (paused = !paused)}>
	<!-- Line icons on the arrows' 16px grid: play while paused, pause while playing. -->
	<svg viewBox="0 0 16 16" fill="none">
		{#if paused}
			<path d="M5.5 2.75v10.5L13 8z" stroke-linejoin="round" />
		{:else}
			<path d="M5.75 2.5v11M10.25 2.5v11" />
		{/if}
	</svg>
</OutlineButton>
