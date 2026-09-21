<script lang="ts">
	// Layout guide matching the Figma column grid: 12 stretch columns,
	// 28px margin, 28px gutter, red at 10%. Press G to toggle.
	let { visible = true }: { visible?: boolean } = $props();

	// `visible` sets the default; the G key overrides it from then on.
	let override: boolean | null = $state(null);
	const shown = $derived(override ?? visible);

	function onKeydown(e: KeyboardEvent) {
		const el = e.target as HTMLElement | null;
		if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
		if (e.key === 'g' || e.key === 'G') override = !shown;
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if shown}
	<div class="grid" aria-hidden="true">
		{#each Array.from({ length: 12 }) as _, i (i)}
			<span></span>
		{/each}
	</div>
{/if}

<style>
	.grid {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: grid;
		/* "Stretch": columns share the leftover space equally. */
		grid-template-columns: repeat(var(--grid-columns), 1fr);
		gap: var(--grid-gutter);
		padding-inline: var(--grid-margin);
		pointer-events: none;
	}
	.grid span {
		background: rgb(255 0 0 / 0.1);
	}
</style>
