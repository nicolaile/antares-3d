/**
 * How Mark-0 and the power conversion system join, shared by the systems
 * page (SystemScene) and the CAD test bench's Assembled view (CadViewer).
 *
 * Both CAD files put their vessel on x = z = 0, so the power conversion
 * system stays where it is and its primary heat exchanger rises onto the
 * reactor: its body flange (2.28 m) lands on Mark-0's top deck (2.67 m),
 * and the heat pipes run on from the core up into its tube bundle. The
 * outlet elbow on its dome rises with it, and so do the skid's first two
 * pipe pieces, leaving a 0.39 m gap at the top of the down pipe that
 * FILLER bridges. What the stack makes redundant is left out of it:
 * Mark-0's drive motors (their own group, f2_drives) and the exchanger's
 * own stand (`standalone`, for the landing, where the system stands on its
 * own; scripts/auto-tag-cad.mjs). Inferred from the geometry and the
 * product video; not confirmed by an engineer.
 *
 * The two files aren't clocked alike: Mark-0 turns 30° about its axis
 * (MARK0_TURN) for its heat pipes to meet the exchanger's, 25 of its 26
 * then within 2 mm. (Its pipe pattern repeats every 60°, so +30° fits as
 * well; nothing in the CAD says which.) They still differ: the exchanger
 * takes 36 pipes and no centre one, so 11 of its pipes have nothing below
 * and Mark-0's centre pipe nothing above; and the exchanger's lower neck
 * reaches 0.33 m below the deck, into the drums' and reflector's tops.
 * Likely two design revisions, for the client to confirm.
 */

/** Mark-0's turn about its own (vertical) axis so its heat pipes meet the exchanger's, radians. */
export const MARK0_TURN = -Math.PI / 6;

/** How far the exchanger, its heat pipe ends and its outlet rise, metres. */
export const PHX_LIFT = 0.39;
/** The skid's parts that rise with the exchanger: its outlet pipe pieces. */
export const OUTLET_PARTS = new Set(['p06285', 'p06286', 'p06293']);
/** The stand-in pipe closing the gap the lift leaves in the down pipe. */
export const FILLER = { x: 0.56, z: -1.27, radius: 0.11, from: 4.33 };

/** The web models' groups (static/models/cad/web/<model>/<group>.glb). */
export const ASSEMBLY = {
	'mark-0': ['f1_cradle', 'f2_reactivity', 'f3_core', 'f4_heatpipes', 'context'],
	'power-conversion-system': ['f4_heatpipes', 'f5_phx', 'f6_brayton', 'context']
} as const;

/** How far `model` turns about the vertical axis in the stack, radians. */
export function turnOf(model: string) {
	return model === 'mark-0' ? MARK0_TURN : 0;
}

/** How far part `id` of group `group` in `model` rises in the stack. */
export function liftOf(model: string, group: string, id: string | undefined) {
	if (model !== 'power-conversion-system') return 0;
	if (group === 'f5_phx' || group === 'f4_heatpipes') return PHX_LIFT;
	if (group === 'f6_brayton' && id && OUTLET_PARTS.has(id)) return PHX_LIFT;
	return 0;
}
