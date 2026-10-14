<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { onMount } from 'svelte';
	import Button from '$lib/components/Button.svelte';
	import CtaButton from '$lib/components/CtaButton.svelte';
	import ArrowButton from '$lib/components/ArrowButton.svelte';
	import PauseButton from '$lib/components/PauseButton.svelte';
	import PlayButton from '$lib/components/PlayButton.svelte';
	import MenuButton from '$lib/components/MenuButton.svelte';
	import ToggleRing from '$lib/components/ToggleRing.svelte';
	import { BREAKPOINTS, TYPEFACES, TYPE_MODIFIERS, TYPE_STYLES } from '$lib/tokens/typography';
	import { SCALE } from '$lib/tokens/colors';
	import { SPACING } from '$lib/tokens/spacing';

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

	// The button specimens are live: these hold their state.
	let paused = $state(false);
	let menuOpen = $state(false);
	let menuOpenDark = $state(false);
	let ringOpen = $state(false);
	let ringHover = $state(false);
	const noop = () => {};

	const px = (n: number) => `${Math.round(n * 10) / 10}px`;
	const em = (n: number) => `${n > 0 ? '+' : ''}${n}em`;
	const bySize = (a: number, b: number) => b - a;
	const sizes = [...new Set(TYPE_STYLES.map((s) => s.size.desktop))].sort(bySize);
</script>

<Seo title="Design System" noindex />

<div class="page">
	<header class="intro">
		<p class="type-caption eyebrow">Antares — Design System</p>
		<h1 class="type-display">Design System</h1>
		<p class="type-body-large lede">
			{SCALE.length} colours, {TYPE_STYLES.length} type styles, {SPACING.length} spacing steps, {TYPEFACES.length} weights
			of {new Set(TYPEFACES.map((f) => f.name)).size} typeface, no exceptions. Everything on the site is built from what's
			below. This page reads the system's own stylesheets, so it's always current.
		</p>
		<p class="type-caption now">
			<span>Viewport</span>
			<span class="type-tabular">{viewport.width || '—'}px · {viewport.breakpoint}</span>
		</p>
	</header>

	<section>
		<h2 class="type-caption section-title">Colour</h2>
		<ul class="palette">
			{#each SCALE as color (color.token)}
				<li class="color">
					<div class="chip" style:background="var({color.token})"></div>
					<h3 class="type-h5 type-tabular">{color.family === 'slate' ? `Slate ${color.step}` : color.step}</h3>
					<p class="type-caption type-tabular">{color.hex}</p>
					<code class="type-body-large class">{color.token}</code>
					<p class="type-body-large usage">{color.usage}</p>
				</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2 class="type-caption section-title">Spacing</h2>
		<p class="type-body-large usage">
			Horizontal placement is whole grid columns. These cover the rest: gaps between stacked blocks, padding, and space
			between sections. Named by px at 1440.
		</p>
		<ul class="spacing">
			{#each SPACING as s (s.token)}
				<li class="space">
					<code class="type-body-large class">{s.token}</code>
					<span class="bar" style:width="var({s.token})"></span>
					<p class="type-body-large usage">{s.usage}</p>
				</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2 class="type-caption section-title">Typefaces</h2>
		<div class="faces">
			{#each TYPEFACES as face (face.name + face.weight)}
				<article class="face">
					<!-- Shown at the largest and smallest styles the face is used for. -->
					<p class="glyphs {face.usedBy[0]?.className}">Aa</p>
					<p class="alphabet {face.usedBy.at(-1)?.className}">
						ABCDEFGHIJKLMNOPQRSTUVWXYZ<br />abcdefghijklmnopqrstuvwxyz<br />0123456789 &amp;@—.,:;!?
					</p>
					<div class="face-meta">
						<h3 class="type-h5">{face.name} {WEIGHT_NAMES[face.weight] ?? face.weight}</h3>
						<dl class="type-caption specs">
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
			<h2 class="type-caption section-title">Scale</h2>
			<label class="sample-input">
				<span class="type-caption">Sample text</span>
				<input class="type-body-large" bind:value={sample} placeholder={DEFAULT_SAMPLE} />
			</label>
		</div>

		<ol class="scale">
			{#each TYPE_STYLES as style (style.name)}
				<li class="style">
					<div class="style-meta">
						<h3 class="type-body-large">{style.title}</h3>
						<p class="type-body-large usage">{style.usage}</p>
						<code class="type-body-large class">.{style.className}</code>
						<dl class="type-caption specs type-tabular">
							{#each BREAKPOINTS as bp (bp.key)}
								<dt>{bp.label}</dt>
								<dd>{style.size[bp.key]}px</dd>
							{/each}
							{#if style.max}
								<dt>Max</dt>
								<dd>{style.max}px</dd>
							{/if}
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
		<h2 class="type-caption section-title">Modifiers</h2>
		<ul class="modifiers">
			{#each TYPE_MODIFIERS as mod (mod.name)}
				<li class="modifier">
					<code class="type-body-large class">.{mod.className}</code>
					<p class="type-body-large">{mod.title}</p>
					<p class="type-body-large usage">{mod.usage}</p>
					<p class="type-h3 {mod.className}">0123456789</p>
				</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2 class="type-caption section-title">Buttons</h2>
		<p class="type-body-large usage">
			Every button on the site is one of these, from <code>src/lib/components</code>. Pages place them; they never style
			their own. Each specimen below is the real component, so hover and press them.
		</p>
		<ul class="buttons">
			<li class="button-spec">
				<div class="stage"><Button label="Join our mission" onclick={noop} /></div>
				<div class="stage dark"><Button label="Back to Earth" onclick={noop} /></div>
				<div class="button-meta">
					<h3 class="type-body-large">Button</h3>
					<code class="type-body-large class">&lt;Button label href? onclick? /&gt;</code>
					<p class="type-body-large usage">
						The call to action: a right arrow and a label, in the Button style. A link with
						<code>href</code>, a button without. Takes the text colour around it, so it works on light and dark.
					</p>
				</div>
			</li>
			<li class="button-spec">
				<div class="stage wide"><CtaButton label="Careers" onclick={noop} /></div>
				<div class="button-meta">
					<h3 class="type-body-large">CtaButton</h3>
					<code class="type-body-large class">&lt;CtaButton label href? onclick? /&gt;</code>
					<p class="type-body-large usage">
						The filled call to action, from the mobile CTA: the label on a grey pill and a black square with an arrow,
						one control. For a lead action that needs more weight than Button.
					</p>
				</div>
			</li>
			<li class="button-spec">
				<div class="stage">
					<ArrowButton direction="previous" label="Previous" onclick={noop} />
					<ArrowButton direction="next" label="Next" onclick={noop} />
					<ArrowButton direction="next" label="Next" disabled onclick={noop} />
				</div>
				<div class="stage dark">
					<ArrowButton direction="previous" tone="dark" label="Previous" onclick={noop} />
					<ArrowButton direction="next" tone="dark" label="Next" onclick={noop} />
				</div>
				<div class="button-meta">
					<h3 class="type-body-large">ArrowButton</h3>
					<code class="type-body-large class">&lt;ArrowButton direction label tone? disabled? onclick /&gt;</code>
					<p class="type-body-large usage">
						Previous and next for carousels: a hairline square with an arrow, shown at rest and disabled at the end of a
						run. <code>tone="dark"</code> is the same square outlined in Grey 750 with a chevron, for dark stages like the
						reactor explorer.
					</p>
				</div>
			</li>
			<li class="button-spec">
				<div class="stage wide">
					<button
						type="button"
						class="ring-demo"
						aria-expanded={ringOpen}
						aria-label="Toggle"
						onclick={() => (ringOpen = !ringOpen)}
						onpointerenter={() => (ringHover = true)}
						onpointerleave={() => (ringHover = false)}
					>
						<ToggleRing open={ringOpen} active={ringHover} />
					</button>
					<ToggleRing open />
				</div>
				<div class="button-meta">
					<h3 class="type-body-large">ToggleRing</h3>
					<code class="type-body-large class">&lt;ToggleRing open? active? /&gt;</code>
					<p class="type-body-large usage">
						The plus/minus ring for anything that opens and closes, like the accordion rows. Open, the + turns to a −;
						the ring stays light, and <code>active</code> darkens it on hover. A decoration: it sits inside the button that does
						the opening. Shown closed (press it) and open.
					</p>
				</div>
			</li>
			<li class="button-spec">
				<div class="stage">
					<PauseButton bind:paused label="Pause" />
				</div>
				<div class="stage dark">
					<PauseButton bind:paused label="Pause" tone="dark" />
				</div>
				<div class="button-meta">
					<h3 class="type-body-large">PauseButton</h3>
					<code class="type-body-large class">&lt;PauseButton bind:paused label tone? /&gt;</code>
					<p class="type-body-large usage">
						Pause and play for anything that moves on its own: autoplay, loops and videos. The ArrowButton square with a
						line icon; the label is read out, not shown, and <code>aria-pressed</code> carries the state.
					</p>
				</div>
			</li>
			<li class="button-spec">
				<div class="stage dark wide"><PlayButton duration="02:23" onclick={noop} /></div>
				<div class="button-meta">
					<h3 class="type-body-large">PlayButton</h3>
					<code class="type-body-large class">&lt;PlayButton duration label? onclick? /&gt;</code>
					<p class="type-body-large usage">
						Plays a film: a frosted pill with its running time, set over the image it plays.
					</p>
				</div>
			</li>
			<li class="button-spec">
				<div class="stage">
					<MenuButton open={menuOpen} controls="ds-menu" onclick={() => (menuOpen = !menuOpen)} />
				</div>
				<div class="stage dark">
					<MenuButton
						open={menuOpenDark}
						tone="dark"
						controls="ds-menu"
						onclick={() => (menuOpenDark = !menuOpenDark)}
					/>
				</div>
				<div class="button-meta">
					<h3 class="type-body-large">MenuButton</h3>
					<code class="type-body-large class">&lt;MenuButton open tone? controls onclick /&gt;</code>
					<p class="type-body-large usage">
						The site menu's toggle, one per page: four dots that spread on hover and merge when open. Light and dark
						tones follow the page under it. Press to see it open.
					</p>
				</div>
			</li>
		</ul>
	</section>

	<section>
		<h2 class="type-caption section-title">Rules</h2>
		<ol class="rules type-body-large">
			<li><span>Text gets its type from exactly one style class. Modifiers can be added on top.</span></li>
			<li>
				<span>
					Components never set <code>font-size</code>, <code>line-height</code>, <code>letter-spacing</code>,
					<code>font-family</code>, <code>font-weight</code> or <code>text-transform</code>.
				</span>
			</li>
			<li>
				<span>
					Need something the scale doesn't have? Change <code>src/lib/styles/typography.css</code>, for the whole site,
					and it shows up here.
				</span>
			</li>
			<li><span><code>npm run check</code> fails on any type declared outside the system.</span></li>
		</ol>
		<p class="type-caption ratio type-tabular">Sizes · {sizes.join(' · ')}</p>
	</section>
</div>

<style>
	.page {
		display: grid;
		gap: var(--space-96);
		padding: var(--space-48) var(--grid-margin) var(--space-128);
	}

	/* Shared 12-column frame, same as the Grid overlay. */
	.intro,
	.faces,
	.style,
	.section-head,
	.modifiers {
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));
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
		margin-top: var(--space-32);
	}
	.lede {
		grid-column: 1 / span 6;
		margin-top: var(--space-32);
		color: var(--grey-700);
	}
	.now {
		display: flex;
		gap: var(--space-16);
		margin-top: var(--space-32);
		color: var(--grey-700);
	}

	section {
		display: grid;
		gap: var(--space-24);
	}
	.section-title {
		margin: 0;
		padding-bottom: var(--space-16);
		border-bottom: 1px solid var(--grey-200);
		color: var(--black);
	}
	.section-head {
		align-items: end;
		border-bottom: 1px solid var(--grey-200);
		padding-bottom: var(--space-16);
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
		gap: var(--space-16);
		color: var(--grey-700);
	}
	.sample-input input {
		flex: 1;
		min-width: 0;
		padding: var(--space-8);
		border: 0;
		border-radius: var(--stage-radius);
		background: var(--grey-50);
		color: var(--black);
	}
	.sample-input input:focus-visible {
		outline: 1px solid var(--black);
	}

	.face {
		grid-column: span 6;
		display: grid;
		gap: var(--space-24);
		padding: var(--space-24);
		border-radius: var(--stage-radius);
		background: var(--grey-50);
	}
	.glyphs,
	.alphabet {
		margin: 0;
	}
	.alphabet {
		color: var(--grey-700);
	}
	.face-meta h3 {
		margin: 0 0 var(--space-16);
	}

	.specs {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-4) var(--space-24);
		margin: 0;
		color: var(--grey-700);
	}
	.specs dd {
		margin: 0;
		color: var(--black);
	}

	.palette {
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));
		gap: var(--space-32) var(--grid-gutter);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	/* Columns sized by the grid alone (minmax(0, 1fr) above), never by a
	   long word inside, and each card's rows packed to the top, so every
	   swatch is the same square and the text lines up across a row. */
	.color {
		grid-column: span 2;
		display: grid;
		align-content: start;
		gap: var(--space-8);
		justify-items: start;
	}
	.color h3,
	.color p {
		margin: 0;
	}
	/* Hairline so White and Grey 50 still read as swatches on the page. */
	.chip {
		justify-self: stretch;
		aspect-ratio: 1;
		margin-bottom: var(--space-8);
		border: 1px solid var(--grey-200);
		border-radius: var(--stage-radius);
	}

	.spacing {
		display: grid;
		gap: var(--space-16);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.space {
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));
		column-gap: var(--grid-gutter);
		align-items: center;
	}
	.space .class {
		grid-column: 1 / span 2;
		justify-self: start;
	}
	.space .bar {
		grid-column: 3 / span 3;
		height: calc(var(--size-font) * 0.75);
		background: var(--black);
	}
	.space .usage {
		grid-column: 6 / -1;
		margin: 0;
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
		row-gap: var(--space-16);
		padding: var(--space-32) 0;
		border-bottom: 1px solid var(--grey-200);
	}
	.style-meta {
		grid-column: 1 / span 3;
		display: grid;
		gap: var(--space-8);
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
		margin: var(--space-8) 0;
		padding: var(--space-4) var(--space-8);
		border-radius: var(--stage-radius);
		background: var(--grey-50);
		color: var(--black);
	}
	.specimen {
		grid-column: 4 / -1;
		margin: 0;
		overflow-wrap: anywhere;
	}

	.modifier {
		grid-column: span 6;
		display: grid;
		gap: var(--space-8);
		justify-items: start;
	}
	.modifier p {
		margin: 0;
	}

	.buttons {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.button-spec {
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));
		column-gap: var(--grid-gutter);
		row-gap: var(--space-16);
		align-items: start;
		padding: var(--space-32) 0;
		border-bottom: 1px solid var(--grey-200);
	}
	/* Each specimen on a tile, light or dark, in the first six columns. */
	.stage {
		grid-column: span 3;
		display: flex;
		gap: var(--space-16);
		align-items: center;
		justify-content: center;
		min-height: calc(var(--size-font) * 8);
		padding: var(--space-24);
		border-radius: var(--stage-radius);
		background: var(--grey-50);
		color: var(--black);
	}
	.stage.dark {
		background: var(--grey-950);
		color: var(--white);
	}
	.stage.wide {
		grid-column: span 6;
	}
	/* Stands in for the row header the ring normally sits in. */
	.ring-demo {
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}
	.button-meta {
		grid-column: 7 / -1;
		grid-row: 1;
		display: grid;
		gap: var(--space-8);
		justify-items: start;
	}
	.button-meta h3 {
		margin: 0;
	}
	.usage code {
		padding: 0 var(--space-4);
		border-radius: var(--stage-radius);
		background: var(--grey-50);
	}

	.rules {
		display: grid;
		gap: var(--space-16);
		max-width: 40em;
		counter-reset: rule;
	}
	.rules li {
		counter-increment: rule;
		display: grid;
		grid-template-columns: calc(var(--size-font) * 2.5) 1fr;
	}
	/* The text in one cell, so its inline code flows with the words
	   instead of each run becoming a grid item of its own. */
	.rules li::before {
		content: counter(rule, decimal-leading-zero);
		color: var(--grey-400);
	}
	.rules code {
		padding: 0 var(--space-4);
		border-radius: var(--stage-radius);
		background: var(--grey-50);
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
		.stage,
		.stage.wide,
		/* Stands in for the row header the ring normally sits in. */
	.ring-demo {
			padding: 0;
			border: 0;
			background: none;
			cursor: pointer;
		}
		.button-meta {
			grid-column: 1 / -1;
			grid-row: auto;
		}
		.sample-input {
			margin-top: var(--space-16);
		}
		.face + .face,
		.modifier + .modifier {
			margin-top: var(--grid-gutter);
		}
	}
</style>
