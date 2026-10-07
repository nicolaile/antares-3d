<!--
	@component
	One person: their portrait (338×220 at 1440), then their name and, in
	grey under it, their role. The whole card is a button that opens their
	panel.

	On hover the photo zooms in slightly inside its frame, which holds its
	size. Mouse and trackpad only, and not with reduced motion.
-->
<script lang="ts">
	import type { Picture as Source } from 'vite-imagetools';
	import Picture from './Picture.svelte';
	import { gsap, prefersReducedMotion } from '$lib/scroll';

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

	/** The photo's zoom on hover. */
	const ZOOM = 1.03;
	/** Long and gentle, with no snap at the start. */
	const EASE = { duration: 0.9, ease: 'power3.out', overwrite: true };

	let photo: HTMLElement;
	let fine = false;

	$effect(() => {
		fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
	});

	function over(on: boolean) {
		if (!fine || prefersReducedMotion()) return;
		gsap.to(photo, { scale: on ? ZOOM : 1, ...EASE });
	}
</script>

<button class="person" type="button" aria-haspopup="dialog" {onclick}>
	<span
		class="image"
		role="presentation"
		onpointerenter={() => over(true)}
		onpointerleave={() => over(false)}
	>
		<span class="mask">
			<span class="photo" bind:this={photo}>
				<Picture
					{...image}
					ratio="996 / 648"
					surface
					sizes="(max-width: 767px) 50vw, (max-width: 991px) 33vw, 25vw"
				/>
			</span>
		</span>
	</span>
	<span class="caption type-body-large">
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

	.image,
	.photo {
		display: block;
	}
	.mask {
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
