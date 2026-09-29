<!--
	@component
	Tuning panel for the energy diagram: the flow, the glow, the stage and
	the line weight. Same look as the model's render controls; the diagram
	places it in its own corner.
-->
<script lang="ts">
	import {
		DEFAULT_LINE_WEIGHT,
		DEFAULT_PARAMS,
		DEFAULT_TONES,
		TIERS,
		cloneTones,
		type EnergyParams,
		type LineTone,
		type Tier
	} from '$lib/energy/energy';

	let {
		params = $bindable(),
		lineWeight = $bindable(),
		tones = $bindable(),
		ink = '',
		dark = $bindable(false)
	}: {
		params: EnergyParams;
		/** Multiplier on every line tier's weight. */
		lineWeight: number;
		/** Colour and opacity per line tier. */
		tones: Record<Tier, LineTone>;
		/** The ink the tiers follow when they have no colour of their own. */
		ink?: string;
		/** Dark stage for the diagram. */
		dark?: boolean;
	} = $props();

	type Row = { key: keyof EnergyParams; label: string; min: number; max: number; step: number };
	const GROUPS: { title: string; rows: Row[] }[] = [
		{
			title: 'Flow',
			rows: [
				{ key: 'speed', label: 'Speed', min: 0, max: 1600, step: 10 },
				{ key: 'pulses', label: 'Pulses', min: 1, max: 8, step: 1 },
				{ key: 'tail', label: 'Tail', min: 80, max: 2000, step: 10 },
				{ key: 'flicker', label: 'Turbulence', min: 0, max: 1, step: 0.01 },
				{ key: 'sparks', label: 'Sparks', min: 0, max: 1, step: 0.01 },
				{ key: 'temperature', label: 'Temperature', min: 0, max: 1, step: 0.01 }
			]
		},
		{
			title: 'Glow',
			rows: [
				{ key: 'core', label: 'Core width', min: 2, max: 24, step: 0.5 },
				{ key: 'fill', label: 'Pipe fill', min: 0, max: 1, step: 0.01 },
				{ key: 'wallLight', label: 'Wall light', min: 0, max: 1, step: 0.01 },
				{ key: 'glow', label: 'Halo radius', min: 4, max: 66, step: 1 },
				{ key: 'glowAmount', label: 'Halo amount', min: 0, max: 1, step: 0.01 },
				{ key: 'ambient', label: 'Idle warmth', min: 0, max: 0.6, step: 0.01 }
			]
		}
	];

	let isOpen = $state(false);
	let copied = $state(false);

	function reset() {
		params = { ...DEFAULT_PARAMS };
		lineWeight = DEFAULT_LINE_WEIGHT;
		tones = cloneTones(DEFAULT_TONES);
	}

	/** The current look as code, ready to paste in as the new defaults. */
	async function copy() {
		const look = { ...$state.snapshot(params), lineWeight, tones: $state.snapshot(tones), dark };
		await navigator.clipboard.writeText(JSON.stringify(look, null, '\t'));
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	/** Match the slider's own precision so the readout doesn't jitter. */
	const fmt = (v: number, step: number) => v.toFixed(step >= 1 ? 0 : step < 0.1 ? 2 : 1);
</script>

<div class="controls" class:open={isOpen}>
	{#if isOpen}
		<!-- data-lenis-prevent: the page's smooth scroll would otherwise take the wheel. -->
		<div class="panel" data-lenis-prevent>
			{#each GROUPS as group (group.title)}
				<p class="group type-label">{group.title}</p>
				{#each group.rows as row (row.key)}
					<label class="row">
						<span class="type-label">{row.label}</span>
						<input type="range" min={row.min} max={row.max} step={row.step} bind:value={params[row.key]} />
						<span class="val type-label type-tabular">{fmt(params[row.key], row.step)}</span>
					</label>
				{/each}
			{/each}
			<p class="group type-label">Stage</p>
			<label class="row">
				<span class="type-label">Dark</span>
				<input class="check" type="checkbox" bind:checked={dark} />
				<span class="val type-label type-tabular">{dark ? 'On' : 'Off'}</span>
			</label>
			<label class="row">
				<span class="type-label">Line weight</span>
				<input type="range" min="0.4" max="2.5" step="0.05" bind:value={lineWeight} />
				<span class="val type-label type-tabular">{fmt(lineWeight, 0.05)}</span>
			</label>
			<p class="group type-label">Lines</p>
			{#each TIERS as tier (tier.key)}
				{@const tone = tones[tier.key]}
				<div class="row">
					<span class="type-label">{tier.label}</span>
					<input
						type="range"
						min="0"
						max="1"
						step="0.01"
						aria-label="{tier.label} opacity"
						bind:value={tone.opacity}
					/>
					<input
						class="swatch"
						type="color"
						aria-label="{tier.label} colour"
						value={tone.color ?? ink}
						oninput={(e) => (tone.color = e.currentTarget.value)}
					/>
				</div>
			{/each}
			<button class="action type-label ink" onclick={() => TIERS.forEach((t) => (tones[t.key].color = null))}>
				Follow ink
			</button>
			<div class="actions">
				<button class="action type-label" onclick={copy}>{copied ? 'Copied' : 'Copy values'}</button>
				<button class="action type-label" onclick={reset}>Reset</button>
			</div>
		</div>
	{/if}

	<button
		class="toggle"
		aria-expanded={isOpen}
		aria-label={isOpen ? 'Hide energy controls' : 'Show energy controls'}
		onclick={() => (isOpen = !isOpen)}
	>
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
			<circle cx="16" cy="8" r="2.4" />
			<circle cx="10" cy="16" r="2.4" />
		</svg>
	</button>
</div>

<style>
	.controls {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--space-8);
	}

	.toggle {
		width: var(--toggle-size);
		height: var(--toggle-size);
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: var(--stage-radius);
		background: var(--grey-200);
		color: var(--grey-950);
		cursor: pointer;
		transition: background 0.25s ease;
	}
	.toggle:hover {
		background: var(--grey-300);
	}
	.controls.open .toggle {
		background: var(--grey-950);
		color: var(--grey-0);
	}
	.toggle:focus-visible {
		outline: 2px solid var(--grey-950);
		outline-offset: 2px;
	}
	.toggle svg {
		width: calc(var(--size-font) * 1);
		height: calc(var(--size-font) * 1);
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
	}

	.panel {
		width: calc(var(--size-font) * 15);
		/* Never taller than the diagram it sits in (less the toggle and insets),
		   which clips it. */
		max-height: min(62svh, calc(100cqh - var(--toggle-size) - var(--space-20) * 2 - var(--space-8)));
		box-sizing: border-box;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: calc(var(--size-font) * 0.9);
		border-radius: var(--stage-radius);
		background: var(--grey-0);
	}

	.group {
		margin: calc(var(--size-font) * 1.1) 0 calc(var(--size-font) * 0.5);
		color: var(--grey-950);
	}
	.group:first-child {
		margin-top: 0;
	}

	.row {
		display: grid;
		grid-template-columns: 1fr calc(var(--size-font) * 5) calc(var(--size-font) * 2.2);
		align-items: center;
		gap: calc(var(--size-font) * 0.4);
		padding: calc(var(--size-font) * 0.12) 0;
		color: var(--grey-700);
	}
	.val {
		text-align: right;
	}

	.swatch {
		justify-self: end;
		width: 100%;
		height: calc(var(--size-font) * 0.9);
		padding: 0;
		border: 1px solid var(--grey-200);
		border-radius: 1px;
		background: none;
		cursor: pointer;
	}
	.swatch::-webkit-color-swatch-wrapper {
		padding: 0;
	}
	.swatch::-webkit-color-swatch {
		border: 0;
	}
	.ink {
		width: 100%;
		margin-top: calc(var(--size-font) * 0.4);
	}

	.check {
		width: calc(var(--size-font) * 0.75);
		height: calc(var(--size-font) * 0.75);
		margin: 0;
		justify-self: start;
		accent-color: var(--grey-950);
		cursor: pointer;
	}

	/* Hairline track with a small square handle, to match the UI's geometry. */
	.row input[type='range'] {
		width: 100%;
		height: calc(var(--size-font) * 0.75);
		margin: 0;
		appearance: none;
		background: transparent;
		cursor: pointer;
	}
	.row input[type='range']::-webkit-slider-runnable-track {
		height: 1px;
		background: var(--grey-400);
	}
	.row input[type='range']::-moz-range-track {
		height: 1px;
		background: var(--grey-400);
	}
	.row input[type='range']::-webkit-slider-thumb {
		appearance: none;
		width: calc(var(--size-font) * 0.45);
		height: calc(var(--size-font) * 0.75);
		margin-top: calc(var(--size-font) * -0.37);
		border: 0;
		border-radius: 1px;
		background: var(--grey-950);
	}
	.row input[type='range']::-moz-range-thumb {
		width: calc(var(--size-font) * 0.45);
		height: calc(var(--size-font) * 0.75);
		border: 0;
		border-radius: 1px;
		background: var(--grey-950);
	}

	.actions {
		display: flex;
		gap: var(--space-8);
		margin-top: calc(var(--size-font) * 1.1);
	}
	.action {
		flex: 1;
		padding: calc(var(--size-font) * 0.4) 0;
		border: 1px solid var(--grey-200);
		border-radius: var(--stage-radius);
		background: none;
		color: var(--grey-950);
		cursor: pointer;
	}
	.action:hover {
		background: var(--grey-100);
	}
</style>
