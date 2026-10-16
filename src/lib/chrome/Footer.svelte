<!--
	@component
	The site footer: a statement and aside, then the link columns and legal
	line. Full-bleed, about a screen tall. Content comes from
	`$lib/content/site`, so every page uses `<Footer {...footer} />`.
-->
<script lang="ts">
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import CtaButton from '$lib/components/CtaButton.svelte';
	import type { Link } from '$lib/content/site';

	let {
		statement,
		aside,
		link,
		nav,
		social,
		legal,
		tone = 'white',
		rule = true
	}: {
		statement: string[];
		aside?: string;
		/** A pill under the aside. */
		link?: Link;
		nav: Link[];
		social: Link[];
		legal: { owner: string; links: Link[] };
		/** `dark` for pages dark throughout, `black` for those on Black (Updates, Contact, Press), `grey` for Progress' mid grey. */
		tone?: 'white' | 'dark' | 'black' | 'grey';
		/** The hairline across its top; off where a full-bleed image meets it (Progress). */
		rule?: boolean;
	} = $props();

	const year = new Date().getFullYear();
	const dark = $derived(tone === 'dark' || tone === 'black');
</script>

<footer class="footer {tone}" class:ruled={rule} data-tone={dark ? 'dark' : undefined}>
	<div class="top">
		<Row gap={40}>
			<Cell span={6} tablet={{ span: 8 }}>
				<p class="statement type-h3">
					{#each statement as line, i (i)}{#if i > 0}<br />{/if}{line}{/each}
				</p>
			</Cell>
			{#if aside || link}
				<Cell start={9} span={3} tablet={{ start: 7, span: 6 }}>
					{#if aside}<p class="aside type-body-default">{aside}</p>{/if}
					{#if link}<div class="cta">
							<CtaButton {...link} arrow={false} tone={dark ? 'dark' : 'light'} />
						</div>{/if}
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
			{#each legal.links as link, i (link.label)}<a href={link.href}>{link.label}</a>{i < legal.links.length - 1
					? ', '
					: '.'}{/each}
		</p>
	</div>
</footer>

<style>
	/* Full-bleed, carrying its own margin so its grid lines match the page's. */
	.footer {
		position: relative;
		display: grid;
		grid-template-rows: 1fr 1fr;
		/* Capped so a tall monitor doesn't leave it mostly empty. */
		min-height: min(100svh, calc(var(--size-font) * 43.75));
		box-sizing: border-box;
		padding: var(--space-24) var(--grid-margin);
		background: var(--white);
		color: var(--grey-700);
		/* Swapped by `tone`. */
		--ink: var(--black);
		--rule: var(--grey-200);
	}
	/* Inset to the grid, like the rule above the links. */
	.ruled::before {
		position: absolute;
		top: 0;
		right: var(--grid-margin);
		left: var(--grid-margin);
		border-top: 1px solid var(--rule);
		content: '';
	}
	.grey {
		background: var(--grey-400);
		color: var(--grey-900);
		--ink: var(--black);
		--rule: var(--grey-700);
	}
	.dark,
	.black {
		background: var(--grey-950);
		color: var(--grey-400);
		--ink: var(--white);
		--rule: var(--grey-900);
		--cta-dark-fill: var(--grey-910);
	}
	.black {
		background: var(--black);
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
	}

	.bottom {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: var(--space-120);
		padding-top: var(--space-24);
		border-top: 1px solid var(--rule);
	}

	.links {
		margin: 0;
		padding: 0;
		list-style: none;
		white-space: nowrap;
	}
	.links li + li {
		margin-top: var(--space-4);
	}
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
	.home {
		display: block;
		width: calc(var(--size-font) * 1.875);
		color: var(--ink);
	}

	.legal a {
		margin-left: var(--space-4);
	}
	.legal a + a {
		margin-left: 0;
	}
</style>
