<!--
	@component
	A label run into a line of body text: "LABEL  Supporting copy…". Used for
	section asides and figure notes.
-->
<script lang="ts">
	let { label, text }: { label?: string; text: string } = $props();
</script>

<p class="caption type-body">
	{#if label}<span class="label type-label-large">{label}</span>{/if}{text}
</p>

<style>
	.caption {
		margin: 0;
		color: var(--grey-700);
	}
	.label {
		margin-right: var(--space-20);
		color: var(--grey-950);
	}
</style>
