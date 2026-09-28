<script lang="ts">
	import { onMount } from 'svelte';
	import Grid from '$lib/components/Grid.svelte';
	import { BREAKPOINTS, TYPEFACES, TYPE_MODIFIERS, TYPE_STYLES } from '$lib/typography';
	import { SCALE } from '$lib/colors';

	const WEIGHT_NAMES: Record<string, string> = { '400': 'Regular', '500': 'Medium' };

	const DEFAULT_SAMPLE = 'Layered steel and borated composite, built into the vessel wall.';
	let sample = $state(DEFAULT_SAMPLE);

	// What each style actually renders at right now, measured off the samples,
	// so the page reports the live system rather than restating the source.
	let samples: Record<string, HTMLElement> = $state({});
	let live: Record<string, { size: number; leading: number }> = $state({});
	let viewport = $state({ width: 0, breakpoint: 'Desktop' });

	function measure() {
		const width = window.innerWidth;
		viewport = {
			width,
			breakpoint: width <= 767 ? 'Mobile' : width <= 991 ? 'Tablet' : 'Desktop'
		};
		const next: typeof live = {};
		for (const [name, el] of Object.entries(samples)) {
			const cs = getComputedStyle(el);
			next[name] = { size: parseFloat(cs.fontSize), leading: parseFloat(cs.lineHeight) };
		}
		live = next;
	}

	onMount(() => {
		// Fonts change nothing about computed sizes, but wait so first paint is final.
		document.fonts.ready.then(measure);
		window.addEventListener('resize', measure);
		return () => window.removeEventListener('resize', measure);
	});

	const px = (n: number) => `${Math.round(n * 10) / 10}px`;
	const em = (n: number) => `${n > 0 ? '+' : ''}${n}em`;
	const bySize = (a: number, b: number) => b - a;
	const sizes = [...new Set(TYPE_STYLES.map((s) => s.size.desktop))].sort(bySize);
</script>

<svelte:head>
	<title>Design System — Antares</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<Grid visible={false} />

<div class="page">
	<header class="intro">
		<p class="type-label eyebrow">Antares — Design System</p>
		<h1 class="type-display-1">Design System</h1>
		<p class="type-body-large lede">
			{SCALE.length} colours, {TYPE_STYLES.length} type styles, {TYPEFACES.length} weights of {new Set(TYPEFACES.map((f) => f.name)).size} typeface, no exceptions.
			Everything on the site is built from what's below. This page reads the system's own stylesheets, so it's
			always current.
		</p>
		<p class="type-label now">
			<span>Viewport</span>
			<span class="type-tabular">{viewport.width || '—'}px · {viewport.breakpoint}</span>
		</p>
	</header>

	<section>
		<h2 class="type-label section-title">Colour</h2>
		<ul class="palette">
			{#each SCALE as color (color.token)}
				<li class="color">
					<div class="chip" style:background="var({color.token})"></div>
					<h3 class="type-heading-3 type-tabular">{color.step}</h3>
					<p class="type-label type-tabular">{color.hex}</p>
					<code class="type-body class">{color.token}</code>
					<p class="type-body usage">{color.usage}</p>
				</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2 class="type-label section-title">Typefaces</h2>
		<div class="faces">
			{#each TYPEFACES as face (face.name + face.weight)}
				<article class="face">
					<!-- Shown at the largest and smallest styles the face is used for. -->
					<p class="glyphs {face.usedBy[0]?.className}">Aa</p>
					<p class="alphabet {face.usedBy.at(-1)?.className}">
						ABCDEFGHIJKLMNOPQRSTUVWXYZ<br />abcdefghijklmnopqrstuvwxyz<br />0123456789 &amp;@—.,:;!?
					</p>
					<div class="face-meta">
						<h3 class="type-heading-3">{face.name} {WEIGHT_NAMES[face.weight] ?? face.weight}</h3>
						<dl class="type-label specs">
							<dt>Token</dt>
							<dd>{face.token}</dd>
							<dt>Weight</dt>
							<dd>{face.weight}</dd>
							<dt>Styles</dt>
							<dd>{face.usedBy.map((s) => s.title).join(', ') || '—'}</dd>
						</dl>
					</div>
				</article>
			{/each}
		</div>
	</section>

	<section>
		<div class="section-head">
			<h2 class="type-label section-title">Scale</h2>
			<label class="sample-input">
				<span class="type-label">Sample text</span>
				<input class="type-body" bind:value={sample} placeholder={DEFAULT_SAMPLE} />
			</label>
		</div>

		<ol class="scale">
			{#each TYPE_STYLES as style (style.name)}
				<li class="style">
					<div class="style-meta">
						<h3 class="type-body">{style.title}</h3>
						<p class="type-body usage">{style.usage}</p>
						<code class="type-body class">.{style.className}</code>
						<dl class="type-label specs type-tabular">
							{#each BREAKPOINTS as bp (bp.key)}
								<dt>{bp.label}</dt>
								<dd>{style.size[bp.key]}px</dd>
							{/each}
							<dt>Leading</dt>
							<dd>{style.leading}</dd>
							<dt>Tracking</dt>
							<dd>{em(style.tracking)}</dd>
							<dt>Now</dt>
							<dd>
								{#if live[style.name]}
									{px(live[style.name].size)} / {px(live[style.name].leading)}
								{:else}
									—
								{/if}
							</dd>
						</dl>
					</div>
					<p class="{style.className} specimen" bind:this={samples[style.name]}>
						{sample || DEFAULT_SAMPLE}
					</p>
				</li>
			{/each}
		</ol>
	</section>

	<section>
		<h2 class="type-label section-title">Modifiers</h2>
		<ul class="modifiers">
			{#each TYPE_MODIFIERS as mod (mod.name)}
				<li class="modifier">
					<code class="type-body class">.{mod.className}</code>
					<p class="type-body">{mod.title}</p>
					<p class="type-body usage">{mod.usage}</p>
					<p class="type-heading-2 {mod.className}">0123456789</p>
				</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2 class="type-label section-title">Rules</h2>
		<ol class="rules type-body-large">
			<li>Text gets its type from exactly one style class. Modifiers can be added on top.</li>
			<li>
				Components never set <code>font-size</code>, <code>line-height</code>, <code>letter-spacing</code>,
				<code>font-family</code>, <code>font-weight</code> or <code>text-transform</code>.
			</li>
			<li>
				Need something the scale doesn't have? Change <code>src/lib/styles/typography.css</code>, for the
				whole site, and it shows up here.
			</li>
			<li><code>npm run check</code> fails on any type declared outside the system.</li>
		</ol>
		<p class="type-label ratio type-tabular">Sizes · {sizes.join(' · ')}</p>
	</section>
</div>

<style>
	.page {
		display: grid;
		gap: calc(var(--size-font) * 6);
		padding: calc(var(--grid-margin) * 3) var(--grid-margin) calc(var(--size-font) * 8);
	}

	/* Shared 12-column frame, same as the Grid overlay. */
	.intro,
	.faces,
	.style,
	.section-head,
	.modifiers {
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), 1fr);
		column-gap: var(--grid-gutter);
	}

	.intro > * {
		grid-column: 1 / -1;
		margin: 0;
	}
	.eyebrow {
		color: var(--grey-700);
	}
	.intro h1 {
		margin-top: calc(var(--size-font) * 2);
	}
	.lede {
		grid-column: 1 / span 6;
		margin-top: calc(var(--size-font) * 2);
		color: var(--grey-700);
	}
	.now {
		display: flex;
		gap: calc(var(--size-font) * 1);
		margin-top: calc(var(--size-font) * 2);
		color: var(--grey-700);
	}

	section {
		display: grid;
		gap: calc(var(--size-font) * 1.5);
	}
	.section-title {
		margin: 0;
		padding-bottom: calc(var(--size-font) * 0.75);
		border-bottom: 1px solid var(--grey-200);
		color: var(--grey-950);
	}
	.section-head {
		align-items: end;
		border-bottom: 1px solid var(--grey-200);
		padding-bottom: calc(var(--size-font) * 0.75);
	}
	.section-head .section-title {
		grid-column: 1 / span 6;
		border: 0;
		padding: 0;
	}

	.sample-input {
		grid-column: 7 / -1;
		display: flex;
		align-items: center;
		gap: calc(var(--size-font) * 1);
		color: var(--grey-700);
	}
	.sample-input input {
		flex: 1;
		min-width: 0;
		padding: calc(var(--size-font) * 0.4) calc(var(--size-font) * 0.6);
		border: 0;
		border-radius: var(--stage-radius);
		background: var(--grey-100);
		color: var(--grey-950);
	}
	.sample-input input:focus-visible {
		outline: 1px solid var(--grey-950);
	}

	.face {
		grid-column: span 6;
		display: grid;
		gap: calc(var(--size-font) * 1.5);
		padding: calc(var(--size-font) * 1.5);
		border-radius: var(--stage-radius);
		background: var(--grey-100);
	}
	.glyphs,
	.alphabet {
		margin: 0;
	}
	.alphabet {
		color: var(--grey-700);
	}
	.face-meta h3 {
		margin: 0 0 calc(var(--size-font) * 1);
	}

	.specs {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: calc(var(--size-font) * 0.35) calc(var(--size-font) * 1.5);
		margin: 0;
		color: var(--grey-700);
	}
	.specs dd {
		margin: 0;
		color: var(--grey-950);
	}

	.palette {
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), 1fr);
		gap: calc(var(--size-font) * 2) var(--grid-gutter);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.color {
		grid-column: span 2;
		display: grid;
		gap: calc(var(--size-font) * 0.5);
		justify-items: start;
	}
	.color h3,
	.color p {
		margin: 0;
	}
	/* Hairline so White and Fog still read as swatches on the page. */
	.chip {
		justify-self: stretch;
		aspect-ratio: 1;
		margin-bottom: calc(var(--size-font) * 0.5);
		border: 1px solid var(--grey-200);
		border-radius: var(--stage-radius);
	}

	.scale,
	.modifiers,
	.rules {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.style {
		align-items: start;
		row-gap: calc(var(--size-font) * 1);
		padding: calc(var(--size-font) * 2) 0;
		border-bottom: 1px solid var(--grey-200);
	}
	.style-meta {
		grid-column: 1 / span 3;
		display: grid;
		gap: calc(var(--size-font) * 0.5);
		justify-items: start;
	}
	.style-meta h3 {
		margin: 0;
	}
	.usage {
		margin: 0;
		color: var(--grey-700);
	}
	.class {
		margin: calc(var(--size-font) * 0.5) 0;
		padding: calc(var(--size-font) * 0.3) calc(var(--size-font) * 0.45);
		border-radius: var(--stage-radius);
		background: var(--grey-100);
		color: var(--grey-950);
	}
	.specimen {
		grid-column: 4 / -1;
		margin: 0;
		overflow-wrap: anywhere;
	}

	.modifier {
		grid-column: span 6;
		display: grid;
		gap: calc(var(--size-font) * 0.5);
		justify-items: start;
	}
	.modifier p {
		margin: 0;
	}

	.rules {
		display: grid;
		gap: calc(var(--size-font) * 1);
		max-width: 40em;
		counter-reset: rule;
	}
	.rules li {
		counter-increment: rule;
		display: grid;
		grid-template-columns: calc(var(--size-font) * 2.5) 1fr;
	}
	.rules li::before {
		content: counter(rule, decimal-leading-zero);
		color: var(--grey-400);
	}
	.rules code {
		padding: 0 calc(var(--size-font) * 0.25);
		border-radius: var(--stage-radius);
		background: var(--grey-100);
	}
	.ratio {
		margin: 0;
		color: var(--grey-700);
	}

	@media screen and (max-width: 991px) {
		.color {
			grid-column: span 4;
		}
		.style-meta {
			grid-column: 1 / span 4;
		}
		.specimen {
			grid-column: 5 / -1;
		}
		.lede {
			grid-column: 1 / span 9;
		}
	}
	@media screen and (max-width: 767px) {
		.face,
		.modifier,
		.style-meta,
		.specimen,
		.lede,
		.section-head .section-title,
		.sample-input {
			grid-column: 1 / -1;
		}
		.color {
			grid-column: span 6;
		}
		.sample-input {
			margin-top: calc(var(--size-font) * 1);
		}
		.face + .face,
		.modifier + .modifier {
			margin-top: var(--grid-gutter);
		}
	}
</style>
