/**
 * The typography system, read straight out of its stylesheet.
 *
 * typography.css is the source of truth; this parses it at build time so the
 * design system page can never drift from what the site actually renders.
 * Add, rename or resize a style there and the page follows.
 */
import source from '$lib/styles/typography.css?raw';

/** Design widths of the Osmo breakpoints, where 1 unit = 16px. */
export const BREAKPOINTS = [
	{ key: 'desktop', label: 'Desktop', width: 1440, query: null },
	{ key: 'tablet', label: 'Tablet', width: 834, query: '991px' },
	{ key: 'mobile', label: 'Mobile', width: 390, query: '767px' }
] as const;

export type Breakpoint = (typeof BREAKPOINTS)[number]['key'];

export type TypeStyle = {
	/** Class suffix: `h1` for `.type-h1`. */
	name: string;
	className: string;
	title: string;
	usage: string;
	/** Size in px at each breakpoint's design width. */
	size: Record<Breakpoint, number>;
	/** Hard ceiling in px, however far the scale runs. */
	max?: number;
	leading: number;
	/** In em. */
	tracking: number;
	/** The --font-* token it sets. */
	family: string;
	weight: string;
	uppercase: boolean;
};

export type TypeModifier = { name: string; className: string; title: string; usage: string };

/** Splits the file into the base rules and each breakpoint's overrides. */
function segments() {
	const out: Record<Breakpoint, string> = { desktop: '', tablet: '', mobile: '' };
	const parts = source.split(/@media[^{]*max-width:\s*(\d+px)[^{]*\{/);
	out.desktop = parts[0];
	for (let i = 1; i < parts.length; i += 2) {
		const bp = BREAKPOINTS.find((b) => b.query === parts[i]);
		if (bp) out[bp.key] += parts[i + 1];
	}
	return out;
}

function token(css: string, name: string) {
	const m = css.match(new RegExp(`--type-${name}:\\s*([^;]+);`));
	return m?.[1].trim();
}

/** `calc(var(--size-font) * 1.5)` → 1.5 units. */
function units(value: string | undefined) {
	const m = value?.match(/\*\s*([\d.]+)\s*\)/);
	return m ? Number(m[1]) : undefined;
}

function parse() {
	const seg = segments();
	const styles: TypeStyle[] = [];
	const modifiers: TypeModifier[] = [];

	const rule = /\/\*\*\s*(.+?)\s*—\s*(.+?)\s*\*\/\s*\.type-([\w-]+)\s*\{([^}]*)\}/g;
	for (const [, title, rawUsage, name, body] of source.matchAll(rule)) {
		const usage = rawUsage[0].toUpperCase() + rawUsage.slice(1);
		const className = `type-${name}`;
		const base = units(token(seg.desktop, `${name}-size`));
		if (base === undefined) {
			modifiers.push({ name, className, title, usage });
			continue;
		}
		// Each breakpoint inherits the one above unless it overrides.
		const tablet = units(token(seg.tablet, `${name}-size`)) ?? base;
		const mobile = units(token(seg.mobile, `${name}-size`)) ?? tablet;
		styles.push({
			name,
			className,
			title,
			usage,
			size: { desktop: base * 16, tablet: tablet * 16, mobile: mobile * 16 },
			max: Number(token(seg.desktop, `${name}-size`)?.match(/,\s*([\d.]+)px\s*\)$/)?.[1]) || undefined,
			leading: Number(token(seg.desktop, `${name}-leading`)),
			tracking: parseFloat(token(seg.desktop, `${name}-tracking`) ?? '0'),
			family: body.match(/var\((--font-[\w-]+)\)/)?.[1] ?? '',
			weight: body.match(/font-weight:\s*(\d+)/)?.[1] ?? '400',
			uppercase: /text-transform:\s*uppercase/.test(body)
		});
	}
	return { styles, modifiers };
}

export const { styles: TYPE_STYLES, modifiers: TYPE_MODIFIERS } = parse();

export type Typeface = { name: string; weight: string; token: string; usedBy: TypeStyle[] };

/** Every @font-face, joined to the --font-* token that leads with it. */
export const TYPEFACES: Typeface[] = [...source.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => {
	const name = body.match(/font-family:\s*'([^']+)'/)?.[1] ?? '';
	const token = source.match(new RegExp(`(--font-[\\w-]+):\\s*'${name}'`))?.[1] ?? '';
	const weight = body.match(/font-weight:\s*(\d+)/)?.[1] ?? '400';
	return {
		name,
		weight,
		token,
		usedBy: TYPE_STYLES.filter((s) => s.family === token && s.weight === weight)
	};
});
