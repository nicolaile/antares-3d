/**
 * The spacing scale, read straight out of its stylesheet, for the design
 * system page.
 */
import source from '$lib/styles/spacing.css?raw';

export type SpaceToken = { token: string; px: number; usage: string };

export const SPACING: SpaceToken[] = [
	...source.matchAll(/\/\*\*\s*(.+?)\s*\*\/\s*(--space-(\d+)):/g)
].map(([, usage, token, px]) => ({ token, px: Number(px), usage }));
