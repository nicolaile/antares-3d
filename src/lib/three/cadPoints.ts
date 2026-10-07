/**
 * The systems page's numbered points (01–07, $lib/content/systems.ts),
 * pinned to their parts in the CAD test bench (/cad), per model view.
 * Positions are in each STEP file's own frame, Y-up metres, about 1 cm
 * proud of a surface of the part that faces out, so a label shows only
 * while that surface does (internal ones, the core, the heat pipes, once a
 * section cut opens them; see CadViewer's anchor test, whose slack is 3 cm). The Assembled view
 * places them as assembly.ts stacks the files: Mark-0 turned, the
 * exchanger lifted.
 *
 * 07, power management, has no part of its own in either file, so no label.
 *
 * Plain data, free of three.js, so a page can read it without loading the
 * renderer (the landing's R1 section); cadLabels.ts makes vectors of it.
 */
export interface CadLabel {
	point: number;
	model: 'mark-0' | 'power-conversion-system';
	at: [number, number, number];
	/** The web model group the part is in. */
	group: string;
	/** Rises with the exchanger in the stack. */
	lifts?: boolean;
	/** Where it goes in the Assembled view instead (that frame), or false for not there. */
	assembled?: [number, number, number] | false;
}

export const CAD_POINTS: CadLabel[] = [
	// The shield vessel's side.
	{ point: 1, group: 'f1_cradle', model: 'mark-0', at: [0.78, 2.0, 0.78] },
	// The top of a drum drive motor on the deck. The Assembled view leaves
	// the drives out (they stand where the exchanger docks): the top of a
	// drum, open to view from above between the exchanger and the deck ring.
	{ point: 2, group: 'f2_drives', model: 'mark-0', at: [0.87, 3.3, 0.3], assembled: [0.615, 2.53, 0.615] },
	// The internal ones sit just behind the vessel's centre line (x < 0),
	// on the half a section through the middle (X, the default) keeps.
	// The core's top face, inside the vessel.
	{ point: 3, group: 'f3_core', model: 'mark-0', at: [-0.05, 2.53, 0.25] },
	// The top of a heat pipe's fitting on the deck; in the exchanger, a pipe's upper end inside its shell.
	{ point: 4, group: 'f4_heatpipes', model: 'mark-0', at: [-0.1645, 2.79, 0.095] },
	{ point: 4, group: 'f4_heatpipes', model: 'power-conversion-system', at: [-0.1085, 3.0, 0.188], assembled: false },
	// The exchanger's shell (r 0.64 m), just under the dome.
	{ point: 5, group: 'f5_phx', model: 'power-conversion-system', at: [0.46, 3.7, 0.46], lifts: true },
	// The skid's horizontal vessel: first taken for the recuperator, by its
	// insides (a shaft, a stack of discs) more likely the turbo-alternator's
	// housing; to confirm. Its group is the landing's carve (`f6_turbo`).
	{ point: 6, group: 'f6_turbo', model: 'power-conversion-system', at: [0.43, 1.475, -3.815] }
];
