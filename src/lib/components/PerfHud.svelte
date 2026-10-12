<!--
	@component
	A live readout of the R1 explorer's 3D, for the optimisation work (with
	?perf): for each model's viewer, the frames it draws a second, the last
	frame's draw calls, triangles and CPU time, and its quality step. Profile
	times the view on stage on the GPU, split into shadow, scene and post;
	Run steps through every feature and saves a run (perf.ts), dev only.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { ModelViewer, ViewProfile } from '$lib/three/ModelViewer';
	import { run, type PerfTarget } from '$lib/three/perf';

	let {
		viewers,
		onStage,
		target
	}: {
		/** The explorer's viewers, by model. */
		viewers: Partial<Record<string, ModelViewer>>;
		/** The model on stage, if a model is. */
		onStage: string | null;
		target: PerfTarget;
	} = $props();

	type Row = { model: string; fps: number; calls: number; tris: number; cpu: number; step: string; size: string };
	let rows: Row[] = $state([]);
	let profile: ViewProfile | null = $state(null);
	let busy = $state('');
	let label = $state('baseline');
	const dev = import.meta.env.DEV;

	const mb = (bytes: number) => `${(bytes / 2 ** 20).toFixed(0)} MB`;
	const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

	onMount(() => {
		const last = new Map<ModelViewer, { drawn: number; t: number }>();
		const id = setInterval(() => {
			const t = performance.now();
			rows = Object.entries(viewers).flatMap(([model, v]) => {
				if (!v) return [];
				const before = last.get(v) ?? { drawn: v.framesDrawn, t };
				last.set(v, { drawn: v.framesDrawn, t });
				const q = v.quality;
				return [
					{
						model,
						fps: t > before.t ? ((v.framesDrawn - before.drawn) * 1000) / (t - before.t) : 0,
						calls: v.lastFrame.calls,
						tris: v.lastFrame.triangles,
						cpu: v.lastFrame.cpu,
						step: `${q.step + 1}/${q.steps} · ${q.ratio}× · ao ${q.ao}`,
						size: `${q.width}×${q.height}`
					}
				];
			});
		}, 1000);
		(window as unknown as Record<string, unknown>).__perf = { run: (l: string) => run(target, l) };
		return () => {
			clearInterval(id);
			delete (window as unknown as Record<string, unknown>).__perf;
		};
	});

	async function measure() {
		const v = onStage ? viewers[onStage] : undefined;
		if (!v || busy) return;
		busy = 'Profiling…';
		profile = await v.profile();
		busy = '';
	}

	async function runAll() {
		if (busy) return;
		busy = 'Running…';
		try {
			await run(target, label, { log: (m) => (busy = m.replace('[perf] ', '')) });
		} finally {
			busy = '';
		}
	}
</script>

<div class="hud">
	{#each rows as r (r.model)}
		<p class:on={r.model === onStage}>
			<b>{r.model}</b>
			{r.fps.toFixed(0)} fps · {r.calls} calls · {(r.tris / 1e6).toFixed(2)}M tris · cpu {r.cpu.toFixed(1)} ms<br />
			step {r.step} · {r.size}
		</p>
	{:else}
		<p>No model loaded yet</p>
	{/each}
	{#if profile}
		<p>
			<b>GPU {profile.full.toFixed(2)} ms</b> · shadow {profile.shadow.toFixed(2)} · scene {profile.scene.toFixed(2)} · post {profile.post.toFixed(2)}<br />
			targets {mb(sum(profile.targets.map((t) => t.bytes)))} · geometry {mb(sum(Object.values(profile.geometry)))}
		</p>
	{/if}
	<div class="actions">
		<button type="button" onclick={measure} disabled={!!busy || !onStage}>Profile</button>
		{#if dev}
			<input bind:value={label} aria-label="Run label" spellcheck="false" />
			<button type="button" onclick={runAll} disabled={!!busy}>Run</button>
		{/if}
	</div>
	{#if busy}<p>{busy}</p>{/if}
</div>

<style>
	.hud {
		position: fixed;
		left: var(--grid-margin);
		bottom: var(--page-margin);
		z-index: 3;
		max-width: calc(100vw - 2 * var(--grid-margin));
		padding: calc(var(--size-font) * 0.6) calc(var(--size-font) * 0.8);
		border-radius: var(--stage-radius);
		background: var(--grey-950);
		color: var(--grey-0);
		font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
		font-variant-numeric: tabular-nums;
	}
	p {
		margin: 0 0 0.5em;
		opacity: 0.6;
	}
	p.on {
		opacity: 1;
	}
	.actions {
		display: flex;
		gap: 0.5em;
	}
	button,
	input {
		font: inherit;
		color: inherit;
		background: transparent;
		border: 1px solid currentColor;
		border-radius: 2px;
		padding: 0.15em 0.6em;
	}
	input {
		width: 9em;
	}
	button:disabled {
		opacity: 0.4;
	}
</style>
