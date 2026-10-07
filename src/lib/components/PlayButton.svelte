<!--
	@component
	The label laid over a video's still: "Play" and the running time, on a
	translucent pill. Place it in the corner of whatever holds the still
	(position it from the parent). Without `onclick` it's only the label, the
	player to come.
-->
<script lang="ts">
	let {
		duration,
		label = 'Play',
		onclick = undefined
	}: {
		/** Running time as shown, e.g. `02:23`. */
		duration: string;
		label?: string;
		onclick?: () => void;
	} = $props();

	/** `02:23` read out as "2 minutes 23 seconds". */
	const spoken = $derived.by(() => {
		const [m, s] = duration.split(':').map(Number);
		if (!Number.isFinite(m) || !Number.isFinite(s)) return duration;
		return [m && `${m} minute${m === 1 ? '' : 's'}`, s && `${s} second${s === 1 ? '' : 's'}`].filter(Boolean).join(' ');
	});
</script>

<button type="button" class="play type-annotation" aria-label="{label} video, {spoken}" {onclick}>
	<span>{label}</span>
	<span class="duration type-tabular">{duration}</span>
</button>

<style>
	.play {
		display: inline-flex;
		align-items: center;
		gap: var(--space-8);
		padding: var(--space-4) var(--space-8);
		border: 0;
		border-radius: var(--stage-radius);
		background: var(--scrim);
		backdrop-filter: blur(8px);
		color: var(--grey-0);
		cursor: pointer;
	}
	.duration {
		color: var(--grey-300);
	}
	.play:focus-visible {
		outline: 1px solid var(--grey-0);
		outline-offset: 2px;
	}
</style>
