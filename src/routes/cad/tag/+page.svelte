<script lang="ts">
	import { onMount } from 'svelte';
	import { CAD_GROUPS, TAGGABLE, type CadTagsFile } from '$lib/three/cadGroups';
	// Types only: three.js loads on demand, as its own chunk.
	import type { PartTagger, TaggerSnapshot, ViewMode } from '$lib/three/PartTagger';
	import type { SectionAxis } from '$lib/three/CadViewer';

	/**
	 * Sorts the bodies of a CAD model into the homepage's feature groups.
	 * Dev only: tags save through the dev server into scripts/cad-tags/,
	 * where apply-cad-tags.mjs builds the grouped web model from them.
	 * Not linked from the menu.
	 */

	let host: HTMLDivElement;
	let tagger: PartTagger | null = $state(null);
	let model = $state(TAGGABLE[0].id);
	let snap: TaggerSnapshot | null = $state(null);
	let loading = $state(true);
	let progress = $state(0);
	let error = $state('');
	let warning = $state('');
	let save: 'saved' | 'unsaved' | 'saving' | 'error' = $state('saved');

	let mode: ViewMode = $state('groups');
	let axis: SectionAxis = $state('x');
	let section = $state(1);

	const fmt = new Intl.NumberFormat('en');
	const rows = [
		{ index: 0, label: 'Untagged (context)', key: '0', color: '' },
		...CAD_GROUPS.map((g, n) => ({ index: n + 1, label: g.label, key: g.key, color: g.color }))
	];

	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	async function persist() {
		clearTimeout(saveTimer);
		if (!tagger || save === 'saved') return;
		const entry = TAGGABLE.find((m) => m.id === model)!;
		save = 'saving';
		try {
			const res = await fetch(`/__cad-tags/${model}`, {
				method: 'PUT',
				body: JSON.stringify(tagger.toFile(model, entry.source))
			});
			if (!res.ok) throw new Error(await res.text());
			// A tag made while the request was in flight leaves it unsaved.
			if (save === 'saving') save = 'saved';
		} catch {
			save = 'error';
		}
	}

	function changed() {
		save = 'unsaved';
		clearTimeout(saveTimer);
		saveTimer = setTimeout(persist, 1000);
	}

	async function open(id: string) {
		if (!tagger) return;
		await persist();
		model = id;
		loading = true;
		error = '';
		warning = '';
		progress = 0;
		try {
			await tagger.load(`/models/cad/${id}.parts.glb`, (f) => (progress = f));
		} catch (e) {
			if ((e as Error).message === 'superseded') return;
			error = `Not converted yet. Run: npm run convert:step -- "src/lib/cad files/${TAGGABLE.find((m) => m.id === id)!.source}" static/models/cad/${id}.parts.glb 0.0008 --parts`;
			loading = false;
			return;
		}
		const res = await fetch(`/__cad-tags/${id}`);
		if (res.ok) {
			const file = (await res.json()) as CadTagsFile;
			const missing = tagger.fromFile(file);
			const source = TAGGABLE.find((m) => m.id === id)!.source;
			if (file.source !== source) warning = `These tags were made on ${file.source}, not ${source}.`;
			else if (missing) warning = `${fmt.format(missing)} saved part ids don't exist in this conversion.`;
		}
		save = 'saved';
		tagger.setMode(mode);
		loading = false;
	}

	$effect(() => tagger?.setMode(mode));
	$effect(() => tagger?.setSection(axis, section));

	function onkeydown(e: KeyboardEvent) {
		if (!tagger) return;
		const el = e.target as HTMLElement | null;
		if (el && (el.tagName === 'SELECT' || (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'text'))) return;
		const cmd = e.metaKey || e.ctrlKey;

		if (cmd && e.key.toLowerCase() === 'z') {
			e.preventDefault();
			if (e.shiftKey) tagger.redo();
			else tagger.undo();
			return;
		}
		if (cmd && e.key.toLowerCase() === 's') {
			e.preventDefault();
			persist();
			return;
		}
		// Plain keys only. Shift+H belongs to the layout's tool toggle.
		if (cmd || e.altKey || e.shiftKey) return;

		const group = rows.find((r) => r.key === e.key);
		if (group) return tagger.assign(group.index);
		switch (e.key.toLowerCase()) {
			case 's':
				return tagger.selectSimilar();
			case 'h':
				return tagger.hideSelected();
			case 'u':
				return tagger.unhideAll();
			case 'i':
				return tagger.toggleIsolate();
			case 'f':
				return tagger.frameSelection();
			case 'v':
				mode = mode === 'groups' ? 'original' : 'groups';
				return;
			case 'escape':
				return tagger.clearSelection();
		}
	}

	function onbeforeunload(e: BeforeUnloadEvent) {
		if (save !== 'saved') e.preventDefault();
	}

	onMount(() => {
		let destroyed = false;
		import('$lib/three/PartTagger').then(({ PartTagger }) => {
			if (destroyed) return;
			const t = new PartTagger(host);
			t.onChange = () => (snap = t.snapshot());
			t.onTagsChange = changed;
			// Scriptable from the console, like __lenis in scroll.ts.
			if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__tagger = t;
			tagger = t;
			open(model);
		});
		return () => {
			destroyed = true;
			clearTimeout(saveTimer);
			tagger?.destroy();
		};
	});
</script>

<svelte:window {onkeydown} {onbeforeunload} />

<svelte:head>
	<title>CAD tagging — Antares</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main>
	<div class="stage" bind:this={host}></div>

	<aside class="panel">
		<header class="row spread">
			<select class="type-body-default" value={model} onchange={(e) => {
					e.currentTarget.blur();
					open(e.currentTarget.value);
				}} aria-label="Model">
				{#each TAGGABLE as m (m.id)}
					<option value={m.id}>{m.name}</option>
				{/each}
			</select>
			<span class="type-body-default status" class:alert={save === 'error'}>
				{{ saved: 'Saved', unsaved: 'Unsaved', saving: 'Saving…', error: 'Couldn’t save' }[save]}
			</span>
		</header>

		{#if loading}
			<p class="type-body-default muted">Loading {Math.round(progress * 100)}%</p>
		{:else if error}
			<p class="type-body-default alert">{error}</p>
		{/if}
		{#if warning}
			<p class="type-body-default alert">{warning}</p>
		{/if}

		{#if snap && !loading && !error}
			<section>
				<p class="type-caption muted">Groups · {fmt.format(snap.parts)} parts</p>
				<ul class="groups">
					{#each rows as r (r.index)}
						<li class="row">
							<span class="swatch" class:empty={!r.color} style:background={r.color || null}></span>
							<button
								class="type-body-default group"
								title="Select every part in this group (Shift adds)"
								onclick={(e) => tagger?.selectGroup(r.index, e.shiftKey)}
							>
								<kbd class="type-tabular">{r.key}</kbd>
								<span class="name">{r.label}</span>
								<span class="type-tabular muted">{fmt.format(snap.counts[r.index])}</span>
							</button>
							<button
								class="type-body-default icon"
								class:off={!tagger?.groupVisible[r.index]}
								title="Show or hide this group"
								aria-label="Toggle {r.label}"
								onclick={() => tagger?.setGroupVisible(r.index, !tagger.groupVisible[r.index])}
								>{tagger?.groupVisible[r.index] ? 'On' : 'Off'}</button
							>
						</li>
					{/each}
				</ul>
			</section>

			<section>
				<p class="type-caption muted">Selection</p>
				{#if snap.single}
					<dl class="type-tabular stats">
						<div><dt>Part</dt><dd>{snap.single.id}</dd></div>
						<div><dt>Group</dt><dd>{rows[snap.single.group].label}</dd></div>
						<div><dt>Triangles</dt><dd>{fmt.format(snap.single.triangles)}</dd></div>
						<div><dt>Size (m)</dt><dd>{snap.single.size.map((v) => v.toFixed(3)).join(' × ')}</dd></div>
					</dl>
				{:else}
					<p class="type-body-default">{snap.selected ? `${fmt.format(snap.selected)} parts` : 'Nothing selected'}</p>
				{/if}
				<div class="row wrap">
					<button class="type-body-default" disabled={!snap.selected} onclick={() => tagger?.selectSimilar()}>Similar <kbd>S</kbd></button>
					<button class="type-body-default" disabled={!snap.selected} onclick={() => tagger?.hideSelected()}>Hide <kbd>H</kbd></button>
					<button class="type-body-default" class:active={snap.isolated} disabled={!snap.selected && !snap.isolated} onclick={() => tagger?.toggleIsolate()}>Isolate <kbd>I</kbd></button>
					<button class="type-body-default" onclick={() => tagger?.frameSelection()}>Frame <kbd>F</kbd></button>
					<button class="type-body-default" disabled={!snap.hidden && !snap.isolated} onclick={() => tagger?.unhideAll()}>
						Show all <kbd>U</kbd>{snap.hidden ? ` (${fmt.format(snap.hidden)})` : ''}
					</button>
				</div>
				<div class="row wrap">
					<button class="type-body-default" disabled={!snap.canUndo} onclick={() => tagger?.undo()}>Undo <kbd>⌘Z</kbd></button>
					<button class="type-body-default" disabled={!snap.canRedo} onclick={() => tagger?.redo()}>Redo <kbd>⇧⌘Z</kbd></button>
				</div>
			</section>

			<section>
				<p class="type-caption muted">View</p>
				<div class="row">
					<button class="type-body-default" class:active={mode === 'groups'} onclick={() => (mode = 'groups')}>Groups</button>
					<button class="type-body-default" class:active={mode === 'original'} onclick={() => (mode = 'original')}>CAD colours <kbd>V</kbd></button>
				</div>
				<div class="row">
					<span class="type-body-default">Section</span>
					{#each ['x', 'y', 'z'] as const as a (a)}
						<button class="type-body-default" class:active={axis === a} onclick={() => (axis = a)}>{a.toUpperCase()}</button>
					{/each}
				</div>
				<input type="range" min="0" max="1" step="0.001" bind:value={section} aria-label="Section position" />
			</section>

			<details class="type-body-default help">
				<summary>How to tag</summary>
				<ul>
					<li><b>Click</b> a part to select it. <b>Shift-click</b> or <b>⌘-click</b> adds or removes one.</li>
					<li><b>Shift-drag</b> boxes in what you can see. Add <b>Alt</b> to include parts hidden behind.</li>
					<li><b>S</b> adds every part shaped like the selection, e.g. all heat pipes from one.</li>
					<li><b>1–7</b> tag the selection, <b>8</b> marks it for removal, <b>0</b> untags it.</li>
					<li>Cut in with the section, or hide (<b>H</b>) what's in the way.</li>
					<li>Untagged parts stay in the web model as context. Tags save automatically.</li>
				</ul>
			</details>
		{/if}
	</aside>
</main>

<style>
	main {
		position: fixed;
		inset: 0;
		background: var(--grey-100);
	}

	main {
		--panel-width: min(22rem, calc(100% - 2 * var(--space-24)));
	}

	/* Ends where the panel starts, so framing centres the model in what's visible. */
	.stage {
		position: absolute;
		inset: 0 calc(var(--panel-width) + 2 * var(--space-24)) 0 0;
	}

	.stage :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}

	.stage :global(.marquee) {
		position: absolute;
		border: 1px dashed var(--grey-950);
		pointer-events: none;
	}

	.panel {
		position: absolute;
		top: var(--space-64);
		right: var(--space-24);
		bottom: var(--space-24);
		display: flex;
		flex-direction: column;
		gap: var(--space-16);
		width: var(--panel-width);
		padding: var(--space-16);
		overflow-y: auto;
		background: var(--grey-0);
		color: var(--grey-950);
		border-radius: var(--space-8);
	}

	section {
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
	}

	p {
		margin: 0;
	}

	.muted {
		color: var(--grey-500);
	}

	.alert {
		color: var(--accent-500);
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-8);
	}

	.spread {
		justify-content: space-between;
	}

	.wrap {
		flex-wrap: wrap;
	}

	.groups {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.swatch {
		flex: none;
		width: var(--space-16);
		height: var(--space-16);
		border-radius: var(--space-4);
	}

	.swatch.empty {
		border: 1px solid var(--grey-400);
	}

	button,
	select {
		font: inherit;
		padding: var(--space-4) var(--space-8);
		border: 1px solid var(--grey-200);
		border-radius: var(--space-4);
		background: var(--grey-0);
		color: inherit;
		cursor: pointer;
	}

	button:disabled {
		cursor: default;
		color: var(--grey-400);
	}

	button.active {
		background: var(--grey-950);
		border-color: var(--grey-950);
		color: var(--grey-0);
	}

	.group {
		display: flex;
		flex: 1;
		align-items: center;
		gap: var(--space-8);
		text-align: left;
	}

	.group .name {
		flex: 1;
	}

	.icon {
		flex: none;
		width: 3.25em;
	}

	.icon.off {
		color: var(--grey-400);
	}

	kbd {
		font: inherit;
		color: var(--grey-500);
	}

	button.active kbd {
		color: var(--grey-300);
	}

	input[type='range'] {
		width: 100%;
		accent-color: var(--accent-500);
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

	.help ul {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		margin: 0;
		padding: var(--space-8) 0 0 var(--space-16);
	}

	.help summary {
		cursor: pointer;
	}
</style>
