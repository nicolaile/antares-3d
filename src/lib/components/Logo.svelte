<!--
	@component
	The Antares mark, as in the wordmark. Takes the text colour, so it's white
	on dark and black on light without separate files. Size it by width; the
	height follows.
	Source: $lib/assets/images/antares-logo.svg.
-->
<script lang="ts">
	let { label = 'Antares' }: { label?: string } = $props();
</script>

<svg class="logo" viewBox="0 0 37 22" role="img" aria-label={label}>
	<path
		d="M21.8445 5.29422C21.8359 5.24226 21.9027 5.21357 21.9345 5.25548L24.436 8.54301C24.4542 8.56704 24.4475 8.60166 24.4215 8.61706C23.7874 8.99316 23.1883 9.33687 22.6229 9.64973C22.5924 9.66665 22.5544 9.64813 22.5487 9.61364L21.8445 5.29422Z"
		fill="currentColor"
	/>
	<path
		d="M24.5809 21.8172C24.5562 21.8172 24.5351 21.7993 24.531 21.7748L23.6784 16.5449C23.6754 16.5261 23.6831 16.5072 23.6985 16.496C25.0713 15.4964 26.4456 14.3761 27.8578 13.1304C27.8798 13.1109 27.9137 13.1142 27.9316 13.1376L34.4739 21.7361C34.4992 21.7693 34.4755 21.8172 34.4336 21.8172H24.5809Z"
		fill="currentColor"
	/>
	<path
		d="M0.0523273 21.8176C0.00887334 21.8177 -0.0164708 21.7665 0.0121817 21.7339L19.058 0.0181738C19.0981 -0.0276449 19.1716 0.0213933 19.1415 0.0743574C13.3939 10.1712 6.45272 23.8999 36.9089 1.98354C36.9589 1.94753 37.0296 2.00883 36.9868 2.05318C22.9465 16.6113 17.0732 21.7947 0.0523273 21.8176Z"
		fill="currentColor"
	/>
</svg>

<style>
	.logo {
		display: block;
		width: 100%;
		height: auto;
	}
</style>
