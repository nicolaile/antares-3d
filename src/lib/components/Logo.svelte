<!--
	@component
	The Antares mark. Takes the text colour, so it's white on dark and black on
	light without separate files. Size it by width; the height follows.
	Source: $lib/assets/antares-logo.svg.
-->
<script lang="ts">
	let { label = 'Antares' }: { label?: string } = $props();
</script>

<svg class="logo" viewBox="0 0 89 77" role="img" aria-label={label}>
	<path
		d="M44.1074 0.0666504L44.6587 12.4794C45.6703 35.2584 57.7132 56.1172 76.9346 68.3829L87.4087 75.0667L76.3833 69.3377C56.1503 58.8243 32.0646 58.8243 11.8315 69.3377L0.806152 75.0667L11.2803 68.3829C30.5017 56.1172 42.5445 35.2584 43.5562 12.4794L44.1074 0.0666504Z"
		fill="currentColor"
		stroke="currentColor"
		stroke-width="3"
	/>
</svg>

<style>
	.logo {
		display: block;
		width: 100%;
		height: auto;
	}
</style>
