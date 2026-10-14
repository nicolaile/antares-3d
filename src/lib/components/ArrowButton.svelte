<!--
	@component
	An outlined square arrow button for stepping through a carousel
	(OutlineButton). Disabled stays focusable, so focus isn't dropped when the
	arrow reaches the end.
-->
<script lang="ts">
	import OutlineButton from '$lib/components/OutlineButton.svelte';
	import left from '$lib/assets/icons/left-arrow.svg?raw';
	import right from '$lib/assets/icons/right-arrow.svg?raw';
	import chevronLeft from '$lib/assets/icons/chevron-left.svg?raw';
	import chevronRight from '$lib/assets/icons/chevron-right.svg?raw';

	let {
		direction,
		label,
		disabled = false,
		tone = 'light',
		onclick
	}: {
		direction: 'previous' | 'next';
		/** `dark`: a chevron in a dark outline, for dark stages (the reactor explorer). */
		tone?: 'light' | 'dark';
		/** Accessible name, e.g. "Previous openings". */
		label: string;
		/** Announced and faded, but still focusable; clicks do nothing. */
		disabled?: boolean;
		onclick: () => void;
	} = $props();

	const icon = $derived(
		tone === 'dark' ? (direction === 'next' ? chevronRight : chevronLeft) : direction === 'next' ? right : left
	);
</script>

<OutlineButton {label} {tone} {disabled} {onclick}>{@html icon}</OutlineButton>
