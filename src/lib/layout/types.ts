/** Spacing tokens from styles/spacing.css, by their px value at 1440. */
export type Space = 4 | 8 | 12 | 20 | 40 | 60 | 120 | 160;

/** A grid column number, 1–12. */
export type Column = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** Where a cell sits at one breakpoint: its first column and how many it spans. */
export type Placement = { start?: Column; span?: Column };

export type Align = 'start' | 'center' | 'end' | 'stretch';

export const space = (s: Space | undefined) => (s === undefined ? undefined : `var(--space-${s})`);
