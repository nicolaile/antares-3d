#!/usr/bin/env node
// Fails if type, colour or spacing is defined outside the design system.
//
// src/lib/styles/typography.css is the single source of type,
// src/lib/styles/colors.css of colour and src/lib/styles/spacing.css of
// spacing. Everywhere else picks a `.type-*` class, a colour token and a
// spacing token; a stray font-size, hex value or 13px margin is a
// custom style, and custom styles are what the system exists to prevent.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const RULES = [
	{
		name: 'Type',
		fix: 'use a .type-* class',
		source: 'src/lib/styles/typography.css',
		extensions: /\.(svelte|css|html|ts|js)$/,
		// Reads the system for the /design-system page; names properties, never sets them.
		exempt: ['src/lib/typography.ts'],
		// `font: inherit` only resets a control to the system; any other `font:`
		// shorthand sets a size.
		banned:
			/(?<![\w-])(font-size|line-height|letter-spacing|font-family|font-weight|text-transform|text-box(?:-trim|-edge)?)\s*:|(?<![\w-])font\s*:(?!\s*inherit\b)|style:(font-size|line-height|letter-spacing|font-family|font-weight)/
	},
	{
		name: 'Colour',
		fix: 'use a colour token from colors.css',
		source: 'src/lib/styles/colors.css',
		// Markup and styles only. The WebGL renderer in src/lib/three works in
		// lighting and post-processing values, not UI colour.
		extensions: /\.(svelte|css|html)$/,
		exempt: [
			// Developer layout overlay, deliberately Figma's red so it can't be
			// mistaken for part of the design.
			'src/lib/components/Grid.svelte'
		],
		banned:
			/(?<![\w{&])#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(|(?<![\w-])(color|background|background-color|border|border-color|outline|outline-color|fill|stroke|accent-color|caret-color|box-shadow)\s*[:=]\s*["']?[^;"'>]*(?<![\w-])(white|black|red|green|blue|gr[ae]y|silver)(?![\w-])/
	},
	{
		name: 'Spacing',
		fix: 'use a --space-* token, or the grid’s',
		source: 'src/lib/styles/spacing.css',
		extensions: /\.(svelte|css|html)$/,
		exempt: [
			// Developer tool panels, hidden behind Shift+H: dense, not part of
			// the design.
			'src/lib/components/Controls.svelte',
			'src/lib/components/EnergyControls.svelte'
		],
		// A margin, padding or gap set in raw lengths or base units. Tokens,
		// 0, auto, percentages and a component's own derived variables are fine.
		banned:
			/(?<![\w-])(margin|padding|gap|row-gap|column-gap)(-[a-z-]+)?\s*:[^;]*(\d(px|r?em|v[wh]|[sdl]v[wh])\b|--size-font)|style:(margin|padding|gap|row-gap|column-gap)[\w-]*=[^>]*(\d(px|r?em)\b|--size-font)/
	}
];


function walk(dir) {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? walk(path) : [path];
	});
}

const files = walk(join(ROOT, 'src')).map((file) => ({
	rel: relative(ROOT, file),
	lines: null
}));

let failed = false;
for (const rule of RULES) {
	const errors = [];
	const skip = new Set([rule.source, ...rule.exempt]);
	for (const file of files) {
		if (skip.has(file.rel) || !rule.extensions.test(file.rel)) continue;
		file.lines ??= readFileSync(join(ROOT, file.rel), 'utf8').split('\n');
		file.lines.forEach((line, i) => {
			const code = line.replace(/\/\*.*?\*\/|<!--.*?-->|\/\/.*$/g, '');
			if (rule.banned.test(code)) errors.push(`${file.rel}:${i + 1}  ${line.trim()}`);
		});
	}
	if (errors.length) {
		failed = true;
		console.error(`${rule.name} defined outside ${rule.source} — ${rule.fix}:\n`);
		for (const e of errors) console.error('  ' + e);
		console.error('');
	} else {
		console.log(`${rule.name.toLowerCase()}: ok — all from the system`);
	}
}
process.exit(failed ? 1 : 0);
