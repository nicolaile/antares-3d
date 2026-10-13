/**
 * The model's look, as dialled in through the render controls panel.
 *
 * Applied after the model loads and after the studio toggle, which swaps in
 * its own lighting preset — so these are the values you actually see, and
 * the controls panel's Reset returns to them. To change the look, tune it in
 * the panel (`npm run dev`), press Copy values and paste the result here.
 *
 * Lives in a .ts file because the colours are render values, not UI colour:
 * the colour system's check covers markup and styles, not the renderer.
 */
import type { RenderParams } from './ModelViewer';

export const LOOK: Partial<RenderParams> = {
	// First: the studio toggle applies its own lighting preset, and every
	// value below has to land on top of that. Object order is apply order.
	studio: 0,

	// Material: a light grey, mostly dielectric, with no clearcoat or
	// environment reflection.
	color: '#a1a1a1',
	roughness: 0.35,
	metalness: 0.13,
	clearcoat: 0,
	coatRoughness: 0,
	materialEnv: 0,

	// Light
	key: 11.1,
	rim: 2.1,
	ambient: 0,
	environment: 1.1,
	exposure: 0.77,

	// Gradient map: off, kept tuned for when it's switched on.
	gradient: 0,
	gradientAmount: 0.46,
	gradientScatter: 0,
	gradientFrequency: 5,
	gradientOffset: -0.07,
	gradientTrack: 1,

	// Studio: off, kept tuned for when it's switched on. The backdrop matches
	// the R1 explorer's panel (grey-950, #161718).
	sweepLight: '#161718',
	sweepDark: '#161718',
	sweepAngle: 0,
	sweepMid: 0.49,
	sweepSpread: 1,
	sweepCurve: 1.4,
	sweepLift: 0,
	sweepFalloff: 0.54,
	shadeAzimuth: 35,
	shadeElevation: 39,
	shadeCoverage: 0.54,
	shadeSoftness: 0.72,
	shadeDepth: 0.26,
	studioBounce: 0,
	studioKey: 1,
	studioGrain: 0,
	studioGrainSize: 1,
	studioGrainSpeed: 0,

	// Post
	ao: 0.65,
	edges: 0,
	cavity: 0,
	grade: 0.2,
	sharpen: 0.65,

	// Not in the panel
	tone: 'aces',
	softbox: 1,
	bloom: 0,
	bloomThreshold: 1,
	grain: 0,
	shadow: 0,
	// Occlusion baked by the private model pipeline (scripts/lab/bake-surface.mjs),
	// mostly on the environment light and a little on the key's.
	bakedAO: 1,
	bakedDirect: 0.15,
	bakedView: 0,
	// Each part its own baked finish, mapped onto this look at 60%, with a little roughness detail.
	finish: 0.6,
	finishFloor: 0.6,
	polymer: 1,
	detail: 0.35,
	detailTile: 1.2,
	wrap: 0,
	surfaceGrain: 0
};
