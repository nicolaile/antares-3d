<!--
	@component
	A muted film on a loop, with a pause button in its bottom-right corner.
	It plays only while on screen, so it isn't decoding frames nobody sees,
	and a pause holds until the visitor plays it again. With reduced motion
	it starts paused, on its first frame. Place it in a positioned box: the
	button sits in that box's corner. With `button={false}` the caller
	places its own PauseButton, bound to the same `paused`.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import PauseButton from '$lib/components/PauseButton.svelte';
	import { prefersReducedMotion } from '$lib/motion/scroll';

	let {
		src,
		poster,
		alt,
		paused = $bindable(false),
		button = true,
		label = 'Pause video',
		preload = 'auto'
	}: {
		src: string;
		/** Shown until the film is ready. */
		poster?: string;
		/** What the film shows. Without it the film is decorative and hidden from screen readers. */
		alt?: string;
		paused?: boolean;
		/** Draws the pause button; false when the caller places its own. */
		button?: boolean;
		label?: string;
		preload?: 'none' | 'metadata' | 'auto';
	} = $props();

	let video: HTMLVideoElement;
	let inView = $state(false);

	onMount(() => {
		if (prefersReducedMotion()) paused = true;
		const seen = new IntersectionObserver(([entry]) => (inView = entry.isIntersecting));
		seen.observe(video);
		return () => seen.disconnect();
	});

	$effect(() => {
		if (inView && !paused) {
			video.play().catch((e: DOMException) => {
				// The browser won't play it (low-power mode, say): show it as paused.
				if (e.name === 'NotAllowedError') paused = true;
			});
		} else {
			video.pause();
		}
	});
</script>

<video
	class="loop-video"
	{src}
	{poster}
	{preload}
	aria-label={alt}
	aria-hidden={alt ? undefined : 'true'}
	muted
	loop
	playsinline
	bind:this={video}
></video>
{#if button}
	<div class="pause">
		<PauseButton bind:paused {label} />
	</div>
{/if}

<style>
	.loop-video {
		display: block;
		width: 100%;
	}
	.pause {
		position: absolute;
		right: var(--space-16);
		bottom: var(--space-16);
	}
</style>
