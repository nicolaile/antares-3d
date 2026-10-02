<!--
	@component
	One open position: a grey card (338×211 at 1440) with the title and its
	department at the top and the location at its foot. The whole card is
	the link. It never shrinks below that shape, but grows if the copy needs it.
-->
<script lang="ts">
	let {
		label,
		department,
		location,
		href
	}: {
		label: string;
		department: string;
		location: string;
		href: string;
	} = $props();
</script>

<a class="card" {href}>
	<p class="head type-small">
		{label}
		<span class="department">{department}</span>
	</p>
	<p class="location type-caption">{location}</p>
</a>

<style>
	.card {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: var(--space-40);
		aspect-ratio: 338 / 211;
		box-sizing: border-box;
		padding: var(--card-padding);
		border-radius: var(--card-radius);
		background: var(--grey-100);
		color: inherit;
		text-decoration: none;
	}
	.card:hover {
		background: var(--grey-200);
	}
	.card:focus-visible {
		outline: 1px solid var(--grey-950);
		outline-offset: 2px;
	}

	.head,
	.location {
		margin: 0;
	}
	.department {
		display: block;
		color: var(--grey-400);
	}
	.location {
		color: var(--grey-700);
	}
</style>
