<!--
	@component
	One year on a roadmap: the year in the first column, then a title and a
	paragraph on the next four. Place in a `subgrid` cell; it uses that
	cell's columns.
-->
<script lang="ts">
	let { year, title, text }: { year: string; title: string; text: string } = $props();
</script>

<article class="entry">
	<p class="year type-sub-headline type-tabular">{year}</p>
	<div class="copy">
		<h2 class="title type-sub-headline">{title}</h2>
		<p class="text type-body-default">{text}</p>
	</div>
</article>

<style>
	.entry {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		align-content: start;
	}
	.year {
		grid-column: 1;
		margin: 0;
	}
	.copy {
		grid-column: 2 / span 4;
	}
	.title,
	.text {
		margin: 0;
	}
	.text {
		margin-top: var(--space-16);
		color: var(--grey-750);
	}

	@media screen and (max-width: 991px) {
		.copy {
			grid-column: 2 / span 6;
		}
	}
	/* One phone column is too narrow for a year. */
	@media screen and (max-width: 767px) {
		.year {
			grid-column: 1 / span 3;
		}
		.copy {
			grid-column: 4 / -1;
		}
	}
</style>
