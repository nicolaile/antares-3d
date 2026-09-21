<script lang="ts">
	import type { ModelViewer, RenderParams } from '$lib/three/ModelViewer';
	import type { GradientStop } from '$lib/three/GradientMapPass';
	import { onThemeChange } from '$lib/theme';

	let { viewer = null }: { viewer?: ModelViewer | null } = $props();

	type Row = {
		key: keyof RenderParams;
		label: string;
		/** toggle writes 0/1; color writes a `#rrggbb` string. */
		kind?: 'range' | 'toggle' | 'color';
		min?: number;
		max?: number;
		step?: number;
	};
	const GROUPS: { title: string; rows: Row[] }[] = [
		{
			title: 'Material',
			rows: [
				{ key: 'color', label: 'Colour', kind: 'color' },
				{ key: 'roughness', label: 'Roughness', min: 0, max: 1, step: 0.01 },
				{ key: 'metalness', label: 'Metalness', min: 0, max: 1, step: 0.01 },
				{ key: 'clearcoat', label: 'Clearcoat', min: 0, max: 1, step: 0.01 },
				{ key: 'coatRoughness', label: 'Coat rough', min: 0, max: 1, step: 0.01 },
				{ key: 'materialEnv', label: 'Reflection', min: 0, max: 3, step: 0.05 }
			]
		},
		{
			title: 'Light',
			rows: [
				{ key: 'key', label: 'Key', min: 0, max: 14, step: 0.1 },
				{ key: 'rim', label: 'Rim', min: 0, max: 5, step: 0.1 },
				{ key: 'ambient', label: 'Ambient', min: 0, max: 2, step: 0.05 },
				{ key: 'environment', label: 'Environment', min: 0, max: 2, step: 0.05 },
				{ key: 'exposure', label: 'Exposure', min: 0.2, max: 2, step: 0.01 }
			]
		},
		{
			title: 'Gradient map',
			rows: [
				{ key: 'gradient', label: 'Enabled', kind: 'toggle' },
				{ key: 'gradientAmount', label: 'Amount', min: 0, max: 1, step: 0.01 },
				{ key: 'gradientScatter', label: 'Scatter', min: 0, max: 1, step: 0.01 },
				{ key: 'gradientFrequency', label: 'Frequency', min: 1, max: 10, step: 1 },
				{ key: 'gradientOffset', label: 'Offset', min: -1, max: 1, step: 0.01 },
				{ key: 'gradientTrack', label: 'Follow pointer', kind: 'toggle' }
			]
		},
		{
			// Separate from the gradient map: a lit backdrop behind the model and
			// a single-softbox shadow on it, each with its own direction.
			title: 'Studio',
			rows: [
				{ key: 'studio', label: 'Enabled', kind: 'toggle' },
				{ key: 'sweepLight', label: 'Backdrop lit', kind: 'color' },
				{ key: 'sweepDark', label: 'Backdrop dark', kind: 'color' },
				{ key: 'sweepAngle', label: 'Backdrop angle', min: 0, max: 360, step: 1 },
				{ key: 'sweepMid', label: 'Horizon', min: 0, max: 1, step: 0.01 },
				{ key: 'sweepSpread', label: 'Spread', min: 0.02, max: 1, step: 0.01 },
				{ key: 'sweepCurve', label: 'Curve', min: 0.3, max: 4, step: 0.05 },
				{ key: 'sweepLift', label: 'Lift', min: 0, max: 1, step: 0.01 },
				{ key: 'sweepFalloff', label: 'Object falloff', min: 0, max: 1, step: 0.01 },
				{ key: 'shadeAzimuth', label: 'Light angle', min: 0, max: 360, step: 1 },
				{ key: 'shadeElevation', label: 'Light tilt', min: 0, max: 90, step: 1 },
				{ key: 'shadeCoverage', label: 'Shadow size', min: -1, max: 1, step: 0.01 },
				{ key: 'shadeSoftness', label: 'Shadow soft', min: 0.01, max: 1, step: 0.01 },
				{ key: 'shadeDepth', label: 'Shadow depth', min: 0, max: 1, step: 0.01 },
				{ key: 'studioBounce', label: 'Bounce', min: 0, max: 1, step: 0.01 },
				{ key: 'studioKey', label: 'Key follows', kind: 'toggle' },
				{ key: 'studioGrain', label: 'Grain', min: 0, max: 0.3, step: 0.005 },
				{ key: 'studioGrainSize', label: 'Grain size', min: 1, max: 6, step: 0.5 },
				{ key: 'studioGrainSpeed', label: 'Grain speed', min: 0, max: 24, step: 1 }
			]
		},
		{
			title: 'Post',
			rows: [
				{ key: 'bloom', label: 'Bloom', min: 0, max: 1, step: 0.01 },
				{ key: 'bloomThreshold', label: 'Threshold', min: 0.7, max: 1, step: 0.005 },
				{ key: 'ao', label: 'Occlusion', min: 0, max: 2, step: 0.05 },
				{ key: 'grain', label: 'Grain', min: 0, max: 0.12, step: 0.005 },
				{ key: 'shadow', label: 'Shadow', min: 0, max: 1, step: 0.01 }
			]
		}
	];

	let isOpen = $state(false);
	/**
	 * Theme is a display preference, not a render parameter, so it lives here
	 * rather than in RenderParams — and Reset deliberately leaves it alone.
	 * The inline script in app.html has already resolved it before first paint.
	 */
	let dark = $state(false);

	$effect(() => {
		dark = document.documentElement.dataset.theme === 'dark';
	});

	// The theme also moves environment and exposure (see Scene.svelte), so the
	// sliders and the Reset baseline have to follow. rAF, not the observer
	// callback directly: it guarantees this runs after Scene's handler has
	// applied the new values, whichever subscribed first.
	$effect(() => {
		if (!viewer) return;
		return onThemeChange(() => {
			requestAnimationFrame(() => {
				if (!viewer) return;
				initial = viewer.readParams();
				params = { ...initial };
			});
		});
	});

	function setTheme(next: boolean) {
		dark = next;
		const theme = next ? 'dark' : 'light';
		document.documentElement.dataset.theme = theme;
		try {
			localStorage.setItem('theme', theme);
		} catch {
			/* private mode — the toggle still works for this session */
		}
	}
	let params = $state<RenderParams | null>(null);
	let available = $state<Set<keyof RenderParams> | null>(null);
	let stops = $state<GradientStop[] | null>(null);
	let initialStops: GradientStop[] = [];

	const MIN_STOPS = 2;
	const MAX_STOPS = 8;

	const toRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
	const toHex = (rgb: number[]) =>
		'#' + rgb.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
	const mixHex = (a: string, b: string, t: number) => {
		const A = toRgb(a);
		const B = toRgb(b);
		return toHex(A.map((x, i) => x + (B[i] - x) * t));
	};
	/** Values at load, so Reset restores the composed look rather than defaults. */
	let initial: RenderParams | null = null;

	$effect(() => {
		if (viewer && !params) {
			available = viewer.availableParams();
			initial = viewer.readParams();
			params = { ...initial };
			if (viewer.hasGradient) {
				initialStops = viewer.readGradientStops();
				stops = initialStops.map((s) => ({ ...s }));
			}
		}
	});

	function set(key: keyof RenderParams, value: number | string) {
		if (!viewer || !params) return;
		viewer.setParam(key, value);
		// Re-read rather than patch: the studio toggle moves material and light
		// values too, and those sliders have to follow.
		params = viewer.readParams();
	}

	function reset() {
		if (!viewer || !initial) return;
		// Studio first: switching it off restores the values it displaced, and
		// the remaining entries then overwrite those with the true baseline.
		viewer.setParam('studio', initial.studio);
		for (const [k, v] of Object.entries(initial)) viewer.setParam(k as keyof RenderParams, v);
		params = viewer.readParams();
		if (viewer.hasGradient) {
			stops = initialStops.map((s) => ({ ...s }));
			viewer.setGradientStops(stops);
		}
	}

	function pushStops() {
		if (!viewer || !stops) return;
		viewer.setGradientStops(stops.map((s) => ({ ...s })));
	}

	/**
	 * Insert into the widest gap, with the colour interpolated from its
	 * neighbours — so adding a stop changes nothing until you move it.
	 */
	function addStop() {
		if (!stops || stops.length >= MAX_STOPS) return;
		const sorted = [...stops].sort((a, b) => a.position - b.position);
		let at = 0;
		let widest = -1;
		for (let i = 0; i < sorted.length - 1; i++) {
			const gap = sorted[i + 1].position - sorted[i].position;
			if (gap > widest) {
				widest = gap;
				at = i;
			}
		}
		const a = sorted[at];
		const b = sorted[at + 1];
		sorted.splice(at + 1, 0, {
			position: (a.position + b.position) / 2,
			color: mixHex(a.color as string, b.color as string, 0.5)
		});
		stops = sorted;
		pushStops();
	}

	function removeStop(i: number) {
		if (!stops || stops.length <= MIN_STOPS) return;
		stops = stops.filter((_, n) => n !== i);
		pushStops();
	}

	/** Match the slider's own precision so the readout doesn't jitter. */
	const fmt = (v: number, step: number) =>
		v.toFixed(step >= 1 ? 0 : step < 0.01 ? 3 : step < 0.1 ? 2 : 1);
</script>

{#if params}
	<div class="controls" class:open={isOpen}>
		{#if isOpen}
			<div class="panel">
				<p class="group mono">Display</p>
				<label class="row">
					<span class="mono">Dark mode</span>
					<input
						class="check"
						type="checkbox"
						checked={dark}
						onchange={(e) => setTheme(e.currentTarget.checked)}
					/>
					<span class="val mono">{dark ? 'On' : 'Off'}</span>
				</label>

				{#each GROUPS as group (group.title)}
					{@const rows = group.rows.filter((r) => available?.has(r.key) ?? true)}
					<p class="group mono">{group.title}</p>
					{#if group.title === 'Gradient map' && stops}
						<p class="sub mono">Stops</p>
						{#each stops as stop, i (i)}
							<div class="stop">
								<input
									class="swatch"
									type="color"
									value={stop.color as string}
									aria-label="Stop {i + 1} colour"
									oninput={(e) => {
										stop.color = e.currentTarget.value;
										pushStops();
									}}
								/>
								<input
									type="range"
									min="0"
									max="1"
									step="0.01"
									value={stop.position}
									aria-label="Stop {i + 1} position"
									oninput={(e) => {
										stop.position = +e.currentTarget.value;
										pushStops();
									}}
								/>
								<button
									class="rm mono"
									disabled={stops.length <= MIN_STOPS}
									aria-label="Remove stop {i + 1}"
									onclick={() => removeStop(i)}>&times;</button
								>
							</div>
						{/each}
						<button class="add mono" disabled={stops.length >= MAX_STOPS} onclick={addStop}>
							Add stop ({stops.length}/{MAX_STOPS})
						</button>
					{/if}
					{#each rows as row (row.key)}
						<label class="row">
							<span class="mono">{row.label}</span>
							{#if row.kind === 'color'}
								<input
									class="swatch"
									type="color"
									value={params[row.key] as string}
									oninput={(e) => set(row.key, e.currentTarget.value)}
								/>
								<span class="val mono">{params[row.key]}</span>
							{:else if row.kind === 'toggle'}
								<input
									class="check"
									type="checkbox"
									checked={(params[row.key] as number) > 0.5}
									onchange={(e) => set(row.key, e.currentTarget.checked ? 1 : 0)}
								/>
								<span class="val mono">{(params[row.key] as number) > 0.5 ? 'On' : 'Off'}</span>
							{:else}
								<input
									type="range"
									min={row.min}
									max={row.max}
									step={row.step}
									value={params[row.key]}
									oninput={(e) => set(row.key, +e.currentTarget.value)}
								/>
								<span class="val mono">{fmt(params[row.key] as number, row.step ?? 0.01)}</span>
							{/if}
						</label>
					{/each}
				{/each}
				<button class="reset mono" onclick={reset}>Reset</button>
			</div>
		{/if}

		<button
			class="toggle"
			aria-expanded={isOpen}
			aria-label={isOpen ? 'Hide render controls' : 'Show render controls'}
			onclick={() => (isOpen = !isOpen)}
		>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
				<circle cx="16" cy="8" r="2.4" />
				<circle cx="10" cy="16" r="2.4" />
			</svg>
		</button>
	</div>
{/if}

<style>
	.controls {
		position: fixed;
		right: var(--grid-margin);
		bottom: var(--grid-margin);
		z-index: 3;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--bar-gap);
	}

	.toggle {
		width: var(--toggle-size);
		height: var(--toggle-size);
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: var(--stage-radius);
		background: var(--surface);
		color: var(--ink);
		cursor: pointer;
		transition: background 0.25s ease;
	}
	.toggle:hover {
		background: var(--surface-hover);
	}
	.controls.open .toggle {
		background: var(--ink);
		color: var(--on-ink);
	}
	.toggle:focus-visible {
		outline: 2px solid var(--ink);
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
		max-height: 62svh;
		overflow-y: auto;
		padding: calc(var(--size-font) * 0.9);
		border-radius: var(--stage-radius);
		background: var(--surface);
	}

	.group {
		margin: calc(var(--size-font) * 1.1) 0 calc(var(--size-font) * 0.5);
		color: var(--ink);
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
		color: var(--ink-spec);
	}
	.val {
		text-align: right;
		font-variant-numeric: tabular-nums;
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
		background: var(--track);
	}
	.row input[type='range']::-moz-range-track {
		height: 1px;
		background: var(--track);
	}
	.row input[type='range']::-webkit-slider-thumb {
		appearance: none;
		width: calc(var(--size-font) * 0.45);
		height: calc(var(--size-font) * 0.75);
		margin-top: calc(var(--size-font) * -0.37);
		border: 0;
		border-radius: 1px;
		background: var(--ink);
	}
	.row input[type='range']::-moz-range-thumb {
		width: calc(var(--size-font) * 0.45);
		height: calc(var(--size-font) * 0.75);
		border: 0;
		border-radius: 1px;
		background: var(--ink);
	}

	.sub {
		margin: calc(var(--size-font) * 0.7) 0 calc(var(--size-font) * 0.35);
		color: var(--ink-spec);
	}
	/* Same three-column rhythm as .row, with a remove button on the end. */
	.stop {
		display: grid;
		grid-template-columns: calc(var(--size-font) * 2.4) 1fr calc(var(--size-font) * 1.1);
		align-items: center;
		gap: calc(var(--size-font) * 0.4);
		padding: calc(var(--size-font) * 0.12) 0;
	}
	.rm,
	.add {
		border: 0;
		border-radius: 1px;
		background: none;
		color: var(--ink-spec);
		cursor: pointer;
	}
	.rm {
		padding: 0;
		line-height: 1;
		font-size: calc(var(--size-font) * 0.9);
	}
	.rm:hover:not(:disabled),
	.add:hover:not(:disabled) {
		color: var(--ink);
	}
	.rm:disabled,
	.add:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.add {
		width: 100%;
		margin-top: calc(var(--size-font) * 0.35);
		padding: calc(var(--size-font) * 0.35) 0;
		background: var(--surface-hover);
	}

	/* Square checkbox, same geometry as the slider handle. */
	.check {
		width: calc(var(--size-font) * 0.75);
		height: calc(var(--size-font) * 0.75);
		margin: 0;
		justify-self: start;
		accent-color: var(--ink);
		cursor: pointer;
	}

	.swatch {
		width: 100%;
		height: calc(var(--size-font) * 0.9);
		padding: 0;
		border: 1px solid var(--track);
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

	.reset {
		width: 100%;
		margin-top: calc(var(--size-font) * 1.1);
		padding: calc(var(--size-font) * 0.45) 0;
		border: 0;
		border-radius: 1px;
		background: var(--ink);
		color: var(--on-ink);
		cursor: pointer;
	}
</style>
