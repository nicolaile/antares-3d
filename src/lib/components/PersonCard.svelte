<!--
	@component
	One person: their portrait (338×220 at 1440), then their name and, in
	grey under it, their role. The whole card is a button that opens their
	panel.
-->
<script lang="ts">
	import type { Picture as Source } from 'vite-imagetools';
	import Picture from './Picture.svelte';

	let {
		name,
		role,
		image,
		onclick
	}: {
		name: string;
		role: string;
		image: { src: Source; alt: string };
		onclick: () => void;
	} = $props();
</script>

<button class="person" type="button" aria-haspopup="dialog" {onclick}>
	<span class="image">
		<Picture
			{...image}
			ratio="996 / 648"
			surface
			sizes="(max-width: 767px) 50vw, (max-width: 991px) 33vw, 25vw"
		/>
	</span>
	<span class="caption type-body">
		{name}
		<span class="role">{role}</span>
	</span>
</button>

<style>
	.person {
		display: block;
		width: 100%;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}
	.person:focus-visible {
		outline: 1px solid var(--grey-950);
		outline-offset: 2px;
	}

	.image {
		display: block;
		overflow: hidden;
		border-radius: var(--card-radius);
	}
	.caption {
		display: block;
		margin-top: var(--space-8);
	}
	.role {
		display: block;
		color: var(--grey-500);
	}
</style>
