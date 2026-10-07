<!--
	@component
	The site footer, in two equal halves: a statement and aside under a
	hairline, then a rule, two link columns and the legal line pinned to the
	bottom. Full-bleed and at least one screen tall. White by default;
	`tone="dark"` sets it on the dark grey, for pages that are dark
	throughout. Content comes from `$lib/content/site`, so every page gets
	the same footer with a single `<Footer {...footer} />`, the "Join our
	mission" call to action under the aside included.
-->
<script lang="ts">
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import Button from '$lib/components/Button.svelte';
	import type { Link } from '$lib/content/site';

	let {
		statement,
		aside,
		link,
		nav,
		social,
		legal,
		tone = 'white'
	}: {
		statement: string[];
		aside?: string;
		/** Under the aside. */
		link?: Link;
		nav: Link[];
		social: Link[];
		legal: { owner: string; links: Link[] };
		tone?: 'white' | 'dark';
	} = $props();

	const year = new Date().getFullYear();
</script>

<footer class="footer {tone}" data-tone={tone === 'dark' ? 'dark' : undefined}>
	<div class="top">
		<Row gap={40}>
			<Cell span={6} tablet={{ span: 8 }}>
				<p class="statement type-h2">
					{#each statement as line, i (i)}{#if i > 0}<br />{/if}{line}{/each}
				</p>
			</Cell>
			{#if aside || link}
				<Cell start={9} span={3} tablet={{ start: 7, span: 6 }}>
					{#if aside}<p class="aside type-body-large">{aside}</p>{/if}
					{#if link}<div class="cta"><Button {...link} /></div>{/if}
				</Cell>
			{/if}
		</Row>
	</div>

	<div class="bottom">
		<Row gap={40}>
			<Cell span={1} tablet={{ span: 2 }} mobile={{ span: 2 }}>
				<a class="home" href="/" aria-label="Antares home"><Logo /></a>
			</Cell>
			<Cell start={3} span={1} tablet={{ start: 3, span: 2 }} mobile={{ start: 1, span: 6 }}>
				<nav aria-label="Site">
					<ul class="links type-body-default">
						{#each nav as link (link.label)}
							<li><a href={link.href}>{link.label}</a></li>
						{/each}
					</ul>
				</nav>
			</Cell>
			<Cell start={4} span={1} tablet={{ start: 5, span: 2 }} mobile={{ start: 7, span: 6 }}>
				<ul class="links social type-body-default" aria-label="Social">
					{#each social as link (link.label)}
						<li><a href={link.href} rel="noopener">{link.label}</a></li>
					{/each}
				</ul>
			</Cell>
		</Row>
		<p class="legal type-caption">
			© {year}. {legal.owner}
			{#each legal.links as link, i (link.label)}<a href={link.href}>{link.label}</a>{i < legal.links.length - 1 ? ', ' : '.'}{/each}
		</p>
	</div>
</footer>

<style>
	/* Full-bleed: sits outside the page's padded container and carries its
	   own margin, so its grid lines match the page's. The statement and the
	   links each open their half, the same distance under their line. */
	.footer {
		position: relative;
		display: grid;
		grid-template-rows: 1fr 1fr;
		/* A screen tall, but never taller than 700px at 1440 — on a tall
		   monitor the footer would otherwise be mostly empty. */
		min-height: min(100svh, calc(var(--size-font) * 43.75));
		box-sizing: border-box;
		padding: var(--space-24) var(--grid-margin);
		/* The primary lines near-black, the rest the secondary grey. */
		background: var(--grey-0);
		color: var(--grey-700);
		/* The primary ink and the rules, swapped by `tone`. */
		--ink: var(--grey-950);
		--rule: var(--grey-200);
	}
	/* A hairline across the top, inset to the grid like the rule above the
	   links, marks where the footer starts. */
	.footer::before {
		position: absolute;
		top: 0;
		right: var(--grid-margin);
		left: var(--grid-margin);
		border-top: 1px solid var(--rule);
		content: '';
	}
	.dark {
		background: var(--grey-850);
		color: var(--grey-400);
		--ink: var(--grey-0);
		--rule: var(--grey-800);
	}

	.statement,
	.aside,
	.legal {
		margin: 0;
	}
	.statement {
		color: var(--ink);
	}
	.cta {
		margin-top: var(--space-32);
		color: var(--ink);
	}

	.bottom {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: var(--space-120);
		padding-top: var(--space-24);
		border-top: 1px solid var(--rule);
	}

	/* One column each, side by side, so the two lists read as a pair. */
	.links {
		margin: 0;
		padding: 0;
		list-style: none;
		white-space: nowrap;
	}
	.links li + li {
		margin-top: var(--space-4);
	}
	/* A little clear of the site links, so the two lists read apart. */
	.social {
		margin-left: var(--space-24);
	}
	a {
		color: inherit;
		text-decoration: none;
		transition: color 0.2s ease;
	}
	a:hover,
	a:focus-visible {
		color: var(--ink);
	}
	a:focus-visible {
		outline: 1px solid var(--ink);
		outline-offset: 2px;
	}
	/* 40px at 1440, top-aligned with the first link. */
	.home {
		display: block;
		width: var(--space-40);
		color: var(--ink);
	}

	.legal a {
		margin-left: var(--space-4);
	}
	.legal a + a {
		margin-left: 0;
	}
</style>
