/**
 * The colour system, read straight out of its stylesheet.
 *
 * colors.css is the source of truth; this parses it at build time so the
 * design system page can never drift from what the site actually renders.
 */
import source from '$lib/styles/colors.css?raw';

export type ScaleStep = { token: string; family: 'grey' | 'accent'; step: string; usage: string; hex: string };

export const SCALE: ScaleStep[] = [
	...source.matchAll(/\/\*\*\s*(.+?)\s*\*\/\s*(--(grey|accent)-(\d+)):\s*(#[0-9a-fA-F]{3,8})/g)
].map(([, usage, token, family, step, hex]) => ({
	token,
	family: family as ScaleStep['family'],
	step,
	usage,
	hex: hex.toUpperCase()
}));
