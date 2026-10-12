/**
 * The model's look, as dialled in through the render controls panel.
 *
 * Applied after the model loads and after the studio toggle, which swaps in
 * its own lighting preset — so these are the values you actually see, and
 * the controls panel's Reset returns to them. To change the look, tune it in
 * the panel (dev, or `?controls`), then copy the readouts here.
 *
 * Lives in a .ts file because the colours are render values, not UI colour:
 * the colour system's check covers markup and styles, not the renderer.
 */
import type { RenderParams } from './ModelViewer';

export const LOOK: Partial<RenderParams> = {
	// First: switching studio on applies its own lighting preset, and every
	// value below has to land on top of that. Object order is apply order.
	studio: 1,

	// Material: a light satin coating, mostly matte, as the black studio
	// renders' parts read (renders/mark-0-black), so the key's light falls
	// off across a surface into black instead of a metal mirroring its
	// surroundings evenly.
	color: '#dedede',
	roughness: 0.45,
	metalness: 0.15,
	clearcoat: 0.3,
	coatRoughness: 0.35,
	materialEnv: 1.2,

	// Each part its own finish, as in the studio renders (the landing's
	// models, scripts/bake-surface.mjs), at 30%: the housings stay near
	// white, as in the renders, with a little roughness detail over them.
	finish: 0.3,
	finishFloor: 0.6,
	polymer: 1,
	detail: 0.35,
	detailTile: 1.2,

	// Light: the black studio renders' rig (render.py 'studio-black', round
	// the camera): a soft box far round at camera-right as the directional
	// key (its shadows; `shadeAzimuth`/`shadeElevation` below aim it), two
	// strips behind at camera-left tracing that silhouette, a faint wash from
	// above, on black (ModelViewer's SOFTBOXES).
	softbox: 1,
	key: 12,
	rim: 0,
	ambient: 0,
	environment: 1,
	exposure: 1.13,

	// Gradient map: off, kept tuned for when it's switched on.
	gradient: 0,
	gradientAmount: 1,
	gradientScatter: 0,
	gradientFrequency: 2,
	gradientOffset: 1,
	gradientTrack: 0,

	// Studio: on. The backdrop matches the R1 explorer's panel (grey-825,
	// #1a1a1a), so the model stands on the panel itself.
	sweepLight: '#1a1a1a',
	sweepDark: '#1a1a1a',
	sweepAngle: 0,
	sweepMid: 0.49,
	sweepSpread: 1,
	sweepCurve: 1.4,
	sweepLift: 0,
	sweepFalloff: 0.55,
	// The key's direction in view terms (round the view, towards the camera):
	// the rig's key, 80° round at camera-right and 30° up.
	shadeAzimuth: 30,
	shadeElevation: 9,
	shadeCoverage: 0.54,
	shadeSoftness: 0.72,
	shadeDepth: 0.26,
	studioBounce: 0,
	studioKey: 1,
	// No grain: on the dark stage it reads as noise over the whole panel.
	studioGrain: 0,
	studioGrainSize: 1,
	studioGrainSpeed: 0,

	// Occlusion: the bake's (within each group, ray-traced), most of it on
	// the light from the surroundings and a little on the key's; the
	// screen-space pass, at 0.6 now, for contact between groups.
	bakedAO: 1,
	bakedDirect: 0.15,
	ao: 0.6,

	// The renders' finish in post: machined edges catching the light and
	// creases holding shadow (screen space, from the occlusion's normals),
	// then their print grade (contrast, split tone, saturation).
	edges: 1,
	cavity: 0.5,
	grade: 1
};
