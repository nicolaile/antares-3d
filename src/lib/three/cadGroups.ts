/**
 * The groups the tagging tool (/cad/tag) sorts CAD parts into: one per
 * feature on the homepage, plus `standalone` for what only shows while a
 * model stands on its own (the exchanger's stand, which the stacked
 * system leaves out), and `remove` for what the web model drops
 * (fasteners, hidden internals). Untagged parts stay in as context.
 *
 * The ids are the contract with the build: apply-cad-tags.mjs nests each
 * group's parts under a node of the same name, and the site animates those
 * nodes. Rename one and both sides, plus the saved tags, must follow.
 * Colours are tool-only, chosen to separate on a light grey stage.
 */
export interface CadGroup {
	id: string;
	label: string;
	/** Keyboard shortcut that assigns the selection to this group. */
	key: string;
	color: string;
}

export const CAD_GROUPS: CadGroup[] = [
	{ id: 'f1_cradle', label: 'Shielding & Cradle', key: '1', color: '#4c78a8' },
	{ id: 'f2_reactivity', label: 'Reactivity Controls', key: '2', color: '#f58518' },
	{ id: 'f2_drives', label: 'Drum drives', key: '9', color: '#b07a2a' },
	{ id: 'f3_core', label: 'Core', key: '3', color: '#e45756' },
	{ id: 'f4_heatpipes', label: 'Sodium Heat Pipes', key: '4', color: '#2bb3a6' },
	{ id: 'f5_phx', label: 'Primary Heat Exchanger', key: '5', color: '#54a24b' },
	{ id: 'f6_brayton', label: 'Nitrogen Brayton Cycle', key: '6', color: '#9d5fd0' },
	{ id: 'f7_pmad', label: 'Power Management', key: '7', color: '#e6b800' },
	{ id: 'standalone', label: 'Standing alone only', key: 'a', color: '#8c6d31' },
	{ id: 'remove', label: 'Remove from web model', key: '8', color: '#3b3b3b' }
];

/** Tool-only highlight for the current selection; distinct from every group. */
export const SELECTION_COLOR = '#ff2bd6';

/** What scripts/cad-tags/<model>.json holds. */
export interface CadTagsFile {
	model: string;
	/** The STEP file the part ids were numbered from; tags only apply to that file. */
	source: string;
	/** Group id → sorted part ids (p00001, …). */
	groups: Record<string, string[]>;
}

/** The models that can be tagged. Each needs static/models/cad/<id>.parts.glb (see scripts/step-to-glb.sh --parts). */
export const TAGGABLE = [
	{ id: 'mark-0', name: 'Mark-0', source: 'Mark-0.stp' },
	{ id: 'power-conversion-system', name: 'Power Conversion System', source: 'Power Conversion System.stp' }
];
