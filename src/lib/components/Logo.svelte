<!--
	@component
	The Antares mark, as in the wordmark. Takes the text colour, so it's white
	on dark and black on light without separate files. Size it by width; the
	height follows.
	Source: $lib/assets/images/antares-logo.svg.
-->
<script lang="ts">
	let { label = 'Antares' }: { label?: string } = $props();
	const clip = $props.id();
</script>

<svg class="logo" viewBox="0 0 72.68 72.68" role="img" aria-label={label}>
	<g clip-path="url(#{clip})">
		<path d="M31.6785 -1.70821C29.9774 34.0094 34.2418 28.8402 -0.889162 30.8595C26.479 23.9444 25.6696 25.6599 31.6785 -1.70821Z" fill="currentColor" stroke="currentColor" stroke-width="1.35921" />
		<path d="M41.2512 72.6291C42.9523 36.9115 38.6879 42.0807 73.8188 40.0614C46.4507 46.9765 47.2601 45.261 41.2512 72.6291Z" fill="currentColor" stroke="currentColor" stroke-width="1.35921" />
		<path d="M73.6457 30.6771C37.9281 28.9759 43.0973 33.2403 41.078 -1.89063C47.9931 25.4775 46.2776 24.6682 73.6457 30.6771Z" fill="currentColor" stroke="currentColor" stroke-width="1.35921" />
		<path d="M-0.70625 40.2497C35.0114 41.9508 29.8422 37.6865 31.8614 72.8174C24.9464 45.4493 26.6619 46.2586 -0.70625 40.2497Z" fill="currentColor" stroke="currentColor" stroke-width="1.35921" />
	</g>
	<defs>
		<clipPath id={clip}><rect width="72.68" height="72.68" /></clipPath>
	</defs>
</svg>

<style>
	.logo {
		display: block;
		width: 100%;
		height: auto;
	}
</style>
