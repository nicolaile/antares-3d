<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import CtaButton from '$lib/components/CtaButton.svelte';
	import PageIntro from '$lib/modules/PageIntro.svelte';
	import DownloadCard from '$lib/components/cards/DownloadCard.svelte';
	import Footer from '$lib/chrome/Footer.svelte';
	import Row from '$lib/layout/Row.svelte';
	import Cell from '$lib/layout/Cell.svelte';
	import { press } from '$lib/content/press';
	import { footer } from '$lib/content/site';

	const { title, intro, email, note, form, pressKit } = press;

	/*
	 * TODO(launch): post to a form endpoint. Until there is one, sending opens
	 * the visitor's mail app with the message addressed to the press team.
	 */
	function onsubmit(e: SubmitEvent) {
		e.preventDefault();
		const data = new FormData(e.currentTarget as HTMLFormElement);
		const name = String(data.get('name'));
		const subject = `Press inquiry from ${name}`;
		const body = `${data.get('message')}\n\n${name}\n${data.get('email')}`;
		location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
	}
</script>

<Seo title="Press" description={intro} />

<main id="content" tabindex="-1" class="press" data-tone="dark">
	<PageIntro {title} tone="dark" />

	<div class="inquiries">
		<Row gap={40}>
			<Cell span={3} tablet={{ span: 6 }}>
				<p class="note type-body-default">
					{note[0]}
					<a href="mailto:{email}">{email}</a>
					{note[1]}
				</p>
			</Cell>

			<Cell start={7} span={6} tablet={{ start: 1, span: 12 }}>
				<form {onsubmit}>
					<label>
						<span class="visually-hidden">{form.name}</span>
						<input class="type-body-default" name="name" autocomplete="name" placeholder={form.name} required />
					</label>
					<label>
						<span class="visually-hidden">{form.email}</span>
						<input
							class="type-body-default"
							type="email"
							name="email"
							autocomplete="email"
							placeholder={form.email}
							required
						/>
					</label>
					<label>
						<span class="visually-hidden">{form.message}</span>
						<textarea class="type-body-default" name="message" placeholder={form.message} required></textarea>
					</label>
					<div class="submit"><CtaButton label={form.submit} type="submit" tone="white" arrow={false} /></div>
				</form>
			</Cell>
		</Row>
	</div>

	<div class="kit"><DownloadCard {...pressKit} tone="dark" prompt="icon" /></div>
</main>

<Footer {...footer} tone="black" />

<style>
	/* The whole page is dark, html included, so overscroll doesn't flash white. */
	:global(html:has(main.press)) {
		background: var(--black);
	}

	.press {
		display: grid;
		padding: var(--space-120) var(--grid-margin) var(--space-160);
		background: var(--black);
		color: var(--white);
	}

	.inquiries {
		margin-top: var(--space-120);
	}
	/* Short of its three columns, so it breaks as in the design. */
	.note {
		max-width: calc(var(--size-font) * 17);
		margin: 0;
		color: var(--grey-400);
	}
	.note a {
		color: inherit;
		text-decoration: none;
	}
	.note a:hover {
		color: var(--white);
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 0.15em;
	}
	.note a:focus-visible {
		outline: 1px solid var(--white);
		outline-offset: 2px;
	}

	form {
		display: grid;
		gap: var(--space-16);
	}
	label {
		display: block;
	}
	input,
	textarea {
		display: block;
		width: 100%;
		box-sizing: border-box;
		margin: 0;
		padding: var(--space-16);
		border: 1px solid transparent;
		border-radius: var(--card-radius);
		background: var(--grey-940);
		color: var(--white);
		outline: none;
	}
	input {
		height: calc(var(--size-font) * 3.5);
	}
	textarea {
		height: calc(var(--size-font) * 17.5);
		resize: vertical;
	}
	input::placeholder,
	textarea::placeholder {
		color: var(--grey-400);
		opacity: 1;
	}
	input:hover,
	textarea:hover {
		border-color: var(--grey-900);
	}
	input:focus-visible,
	textarea:focus-visible {
		border-color: var(--grey-700);
	}
	.submit {
		justify-self: end;
		margin-top: var(--space-16);
	}

	.kit {
		margin-top: var(--space-120);
	}
</style>
