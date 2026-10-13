/**
 * The colour system, parsed from colors.css (the source of truth) at build
 * time so the design system page can't drift from what the site renders.
 */
import source from '$lib/styles/colors.css?raw';

export type ScaleStep = { token: string; family: 'grey' | 'slate' | 'accent'; step: string; usage: string; hex: string };

/** Named swatches outside the numbered scale, and how the page labels them. */
const NAMED: Record<string, { family: ScaleStep['family']; step: string }> = {
	white: { family: 'grey', step: 'White' },
	black: { family: 'grey', step: 'Black' },
	orange: { family: 'accent', step: 'Orange' }
};

export const SCALE: ScaleStep[] = [
	...source.matchAll(/\/\*\*\s*(.+?)\s*\*\/\s*(--([a-z]+)(?:-(\d+))?):\s*(#[0-9a-fA-F]{3,8})/g)
].map(([, usage, token, name, step, hex]) => ({
	token,
	...(step ? { family: name as ScaleStep['family'], step } : NAMED[name]),
	usage,
	hex: hex.toUpperCase()
}));
