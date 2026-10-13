<!--
	@component
	A muted looping video with a pause button. Plays only while on screen and
	starts paused with reduced motion. Place it in a positioned box: the
	button pins to that box's bottom-right corner.
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
		poster?: string;
		/** Without it the video is decorative and hidden from screen readers. */
		alt?: string;
		paused?: boolean;
		/** False when the caller places its own PauseButton, bound to the same `paused`. */
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
				// Autoplay refused (low-power mode, say): show it as paused.
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
