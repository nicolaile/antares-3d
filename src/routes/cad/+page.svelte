<script lang="ts">
	import { onMount } from 'svelte';
	import { gsap } from '$lib/scroll';
	import { points } from '$lib/content/systems';
	import { cadLabels } from '$lib/three/cadLabels';
	// Types only: three.js loads on demand, as its own chunk.
	import type { CadStats, CadViewer, SectionAxis } from '$lib/three/CadViewer';

	/**
	 * Test bench for the STEP conversions in static/models/cad. Not linked
	 * from the menu. Each model is converted with scripts/step-to-glb.sh.
	 */
	const MODELS = [
		{ id: 'space-nuclear', name: 'Space Nuclear' },
		{ id: 'power-conversion-system', name: 'Power Conversion System' },
		{ id: 'mark-0', name: 'Mark-0' },
		// Not a file of its own: Mark-0 under the power conversion system, joined (see CadViewer.loadAssembly).
		{ id: 'assembled', name: 'Assembled' }
	];

	let host: HTMLDivElement;
	let viewer: CadViewer | null = $state(null);
	let current = $state(MODELS[0].id);
	let stats: CadStats | null = $state(null);
	let progress = $state(0);
	let loading = $state(true);
	let error = $state('');

	let clay = $state(false);
	/**
	 * The stage's background and the model's colour, from the pickers; null
	 * keeps the default (the page's grey, the CAD's own colours). The pickers
	 * start on the design system's values, read from its tokens.
	 */
	let background: string | null = $state(null);
	let paint: string | null = $state(null);
	let backgroundPick = $state('');
	let paintPick = $state('');
	/**
	 * The systems page's numbered points (01–07) pinned to their parts, for
	 * the models that have them; each follows its part as the view turns and
	 * hides when something comes in front of it. A test of the idea.
	 */
	let showLabels = $state(true);
	const labels = $derived(cadLabels(current));
	let labelEls: HTMLElement[] = $state([]);
	/** The panel, hidden with H or its own button for a clean view. */
	let controls = $state(true);
	let panel: HTMLElement;
	let hint: HTMLElement;
	let wireframe = $state(false);
	/** The model as a turnable line drawing, on a near-orthographic lens (CadViewer.setLines). */
	let lines = $state(false);
	let lineWeight = $state(0.5);
	/** The design system's ink and paper, for the drawing when the pickers are on their defaults. */
	let tokens = $state({ ink: '', paper: '' });
	let axis: SectionAxis = $state('x');
	let section = $state(1);

	const fmt = new Intl.NumberFormat('en');

	async function open(id: string) {
		if (!viewer) return;
		current = id;
		loading = true;
		error = '';
		progress = 0;
		stats = null;
		try {
			const onProgress = (f: number) => (progress = f);
			stats = id === 'assembled' ? await viewer.loadAssembly(onProgress) : await viewer.load(`/models/cad/${id}.glb`, onProgress);
			viewer.setClay(clay);
			viewer.setColor(paint);
			viewer.setWireframe(wireframe);
		} catch (e) {
			if ((e as Error).message === 'superseded') return;
			error = 'Not converted yet';
		}
		loading = false;
	}

	$effect(() => viewer?.setAnchors(labels.map((l) => l.at)));
	$effect(() => viewer?.setClay(clay));
	$effect(() => viewer?.setColor(paint));

	// Hiding slides the panel away; a hint says how to bring it back, then goes.
	$effect(() => {
		if (!panel || !hint) return;
		const shown = controls;
		gsap.to(panel, { autoAlpha: shown ? 1 : 0, y: shown ? 0 : 16, duration: 0.35, ease: 'power2.out', overwrite: true });
		gsap.killTweensOf(hint);
		if (shown) gsap.to(hint, { autoAlpha: 0, duration: 0.2, ease: 'power2.out' });
		else
			gsap
				.timeline()
				.to(hint, { autoAlpha: 1, duration: 0.3, ease: 'power2.out' })
				.to(hint, { autoAlpha: 0, duration: 0.6, ease: 'power2.in' }, '+=1.8');
	});

	function onkeydown(e: KeyboardEvent) {
		// Plain H: Shift+H is the site's own tools toggle.
		if (e.key.toLowerCase() !== 'h' || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
		const el = e.target as HTMLElement | null;
		if (el && (/^(TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
		controls = !controls;
	}
	$effect(() => viewer?.setWireframe(wireframe));
	$effect(() => viewer?.setLines(lines));
	$effect(() =>
		viewer?.setLineStyle({ ink: paint ?? tokens.ink, paper: background ?? tokens.paper, weight: lineWeight })
	);
	$effect(() => viewer?.setSection(axis, section));

	/**
	 * Pins each label to its part, and fades it out once hidden. Run by the
	 * viewer straight after it moves the camera, so the labels move in step
	 * with the model rather than a frame behind it.
	 */
	function placeLabels() {
		if (!viewer || loading || !showLabels) return;
		labelEls.forEach((el, i) => {
			const label = labels[i];
			if (!el || !label) return;
			const p = viewer!.project(label.at);
			el.style.visibility = p ? '' : 'hidden';
			if (p) el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
			const seen = viewer!.anchorVisible(i) ? '1' : '0';
			if (el.dataset.seen !== seen) {
				el.dataset.seen = seen;
				// Hides at once; fades back in.
				if (seen === '1') gsap.to(el, { opacity: 1, duration: 0.3, ease: 'power2.out', overwrite: true });
				else gsap.set(el, { opacity: 0, overwrite: true });
			}
		});
	}

	onMount(() => {
		const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
		backgroundPick = token('--grey-100');
		paintPick = token('--grey-400');
		tokens = { ink: token('--grey-950'), paper: backgroundPick };
		let destroyed = false;
		import('$lib/three/CadViewer').then(({ CadViewer }) => {
			if (destroyed) return;
			viewer = new CadViewer(host);
			viewer.onFrame = placeLabels;
			// Scriptable from the console, like __system on /systems.
			if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__cad = viewer;
			open(current);
		});
		return () => {
			destroyed = true;
			viewer?.destroy();
		};
	});
</script>

<svelte:head>
	<title>CAD test — Antares</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<svelte:window {onkeydown} />

<main style:background>
	<div class="stage" bind:this={host}></div>

	{#if showLabels && !loading}
		<div class="labels" aria-hidden="true">
			{#each labels as label, i (label.point + ':' + i)}
				<div class="label" bind:this={labelEls[i]}>
					<span class="dot"></span>
					<span class="type-caption name">
						<span class="type-tabular">{String(label.point).padStart(2, '0')}</span>
						{points[label.point - 1].title}
					</span>
				</div>
			{/each}
		</div>
	{/if}

	<p class="type-body hint" bind:this={hint} aria-live="polite">Press H to show the controls</p>

	<aside class="panel" bind:this={panel} aria-hidden={!controls} inert={!controls}>
		<p class="type-caption heading">CAD test</p>

		<div class="models">
			{#each MODELS as m (m.id)}
				<button class="type-body" class:active={current === m.id} onclick={() => open(m.id)}>{m.name}</button>
			{/each}
		</div>

		<dl class="type-tabular stats">
			{#if loading}
				<div><dt>Loading</dt><dd>{Math.round(progress * 100)}%</dd></div>
			{:else if error}
				<div><dt>Status</dt><dd>{error}</dd></div>
			{:else if stats}
				<div><dt>Meshes</dt><dd>{fmt.format(stats.parts)}</dd></div>
				<div><dt>Triangles</dt><dd>{fmt.format(Math.round(stats.triangles))}</dd></div>
				<div><dt>Colours</dt><dd>{stats.materials}</dd></div>
				<div><dt>Size (m)</dt><dd>{stats.size.map((v) => v.toFixed(2)).join(' × ')}</dd></div>
			{/if}
		</dl>

		<div class="row">
			<label class="type-body"><input type="checkbox" bind:checked={clay} /> Clay</label>
			<label class="type-body"><input type="checkbox" bind:checked={wireframe} /> Wireframe</label>
			<label class="type-body"><input type="checkbox" bind:checked={showLabels} /> Labels</label>
			<label class="type-body"><input type="checkbox" bind:checked={lines} /> Line drawing</label>
		</div>
		{#if lines}
			<label class="type-body weight">
				Line weight
				<input type="range" min="0.25" max="3" step="0.25" bind:value={lineWeight} aria-label="Line weight" />
			</label>
		{/if}

		<div class="row">
			<span class="type-body">Section</span>
			{#each ['x', 'y', 'z'] as const as a (a)}
				<button class="type-body" class:active={axis === a} onclick={() => (axis = a)}>{a.toUpperCase()}</button>
			{/each}
		</div>
		<input type="range" min="0" max="1" step="0.001" bind:value={section} aria-label="Section position" />

		<div class="row">
			<label class="type-body colour">
				Background
				<input type="color" bind:value={backgroundPick} oninput={() => (background = backgroundPick)} />
			</label>
			<button class="type-body" disabled={background === null} onclick={() => (background = null)}>Reset</button>
		</div>
		<div class="row">
			<label class="type-body colour">
				Model
				<input type="color" bind:value={paintPick} oninput={() => (paint = paintPick)} />
			</label>
			<button class="type-body" disabled={paint === null} onclick={() => (paint = null)}>Reset</button>
		</div>

		<div class="row">
			<button class="type-body" onclick={() => viewer?.frameModel()}>Reset view</button>
			<button class="type-body" onclick={() => (controls = false)}>Hide controls (H)</button>
		</div>
	</aside>
</main>

<style>
	main {
		position: fixed;
		inset: 0;
		background: var(--grey-100);
	}

	.stage {
		position: absolute;
		inset: 0;
	}

	.stage :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}

	.panel {
		position: absolute;
		left: var(--space-24);
		bottom: var(--space-24);
		display: flex;
		flex-direction: column;
		gap: var(--space-16);
		width: min(20rem, calc(100% - 2 * var(--space-24)));
		padding: var(--space-16);
		background: var(--grey-0);
		color: var(--grey-950);
		border-radius: var(--space-8);
	}

	.heading {
		margin: 0;
		color: var(--grey-500);
	}

	.models,
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-8);
	}

	button {
		font: inherit;
		padding: var(--space-4) var(--space-8);
		border: 1px solid var(--grey-200);
		border-radius: var(--space-4);
		background: var(--grey-0);
		color: inherit;
		cursor: pointer;
	}

	button.active {
		background: var(--grey-950);
		border-color: var(--grey-950);
		color: var(--grey-0);
	}

	label {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		cursor: pointer;
	}

	input[type='range'] {
		width: 100%;
		accent-color: var(--accent-500);
	}

	.weight {
		gap: var(--space-16);
		white-space: nowrap;
	}

	.colour {
		flex: 1;
		justify-content: space-between;
	}

	input[type='color'] {
		width: var(--space-40);
		height: var(--space-24);
		padding: 0;
		border: 1px solid var(--grey-200);
		border-radius: var(--space-4);
		background: none;
		cursor: pointer;
	}

	button:disabled {
		color: var(--grey-400);
		cursor: default;
	}

	/* The 01–07 labels: a dot on the part, the point's number and name beside it. */
	.labels {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.label {
		position: absolute;
		top: 0;
		left: 0;
		will-change: transform;
	}

	.dot {
		position: absolute;
		width: var(--space-8);
		height: var(--space-8);
		border-radius: 50%;
		background: var(--accent-500);
		box-shadow: 0 0 0 var(--space-4) var(--grey-0);
		transform: translate(-50%, -50%);
	}

	.name {
		position: absolute;
		left: var(--space-16);
		top: 0;
		display: flex;
		gap: var(--space-4);
		padding: var(--space-4) var(--space-8);
		border-radius: var(--space-4);
		background: var(--grey-950);
		color: var(--grey-0);
		white-space: nowrap;
		transform: translateY(-50%);
	}

	/* Shown for a moment when the panel hides. */
	.hint {
		position: absolute;
		left: var(--space-24);
		bottom: var(--space-24);
		margin: 0;
		padding: var(--space-8) var(--space-16);
		border-radius: var(--space-8);
		background: var(--grey-950);
		color: var(--grey-0);
		visibility: hidden;
		opacity: 0;
		pointer-events: none;
	}

	.stats {
		display: grid;
		gap: var(--space-4);
		margin: 0;
	}

	.stats div {
		display: flex;
		justify-content: space-between;
		gap: var(--space-16);
	}

	.stats dt {
		color: var(--grey-500);
	}

	.stats dd {
		margin: 0;
	}
</style>
