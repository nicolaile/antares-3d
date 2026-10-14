/**
 * How Mark-0 and the power conversion system join, shared by the systems
 * page (SystemScene) and the CAD test bench's Assembled view (CadViewer).
 *
 * Both files centre their vessel on x = z = 0. The primary heat exchanger
 * rises PHX_LIFT so its body flange (2.28 m) lands on Mark-0's top deck
 * (2.67 m) and the heat pipes run on from the core into its tube bundle; its
 * outlet pipes rise with it and FILLER bridges the gap left in the down pipe.
 * Mark-0's drive motors (f2_drives) and the exchanger's stand (`standalone`)
 * are left out.
 *
 * Mark-0 turns −30° (MARK0_TURN; +30° fits too, its pipe pattern repeats every
 * 60°) so 25 of its 26 heat pipes meet the exchanger's within 2 mm. The rest
 * differ (36 exchanger pipes, no centre one; its lower neck sinks 0.33 m into
 * the drums), likely two design revisions.
 * TODO(launch): the stack is inferred from geometry; confirm with Antares.
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
