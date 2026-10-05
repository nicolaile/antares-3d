/**
 * The systems page (/systems): the R1's seven systems, in the order the
 * heat travels, from the vessel inwards to the core and back out to the
 * grid. Each point's camera shot and effects live in
 * $lib/three/systemChoreography.ts, matched by index.
 */
export const intro = {
	label: 'The R1 system',
	title: 'From the core to the grid',
	text: 'Follow the heat through all seven systems.'
};

/**
 * `notes` are the labels pinned to the model while a point is on screen.
 * Each `at` names an anchor in $lib/three/systemChoreography.ts. They say
 * only what the copy above says, or what the CAD shows (the 12 drums).
 */
export const points = [
	{
		title: 'Integrated Shielding & Transport Cradle',
		text: 'Cradle simplifies deployment with minimal gear.',
		notes: [
			{ at: 'shield', text: 'Integrated shielding' },
			{ at: 'cradle', text: 'Transport cradle' }
		]
	},
	{
		title: 'Reactivity Controls',
		text: 'Graphite and boron carbide control drums with independent actuator motors, inspired by historical space reactor designs.',
		notes: [
			{ at: 'motors', text: 'Independent actuator motors' },
			{ at: 'drum', text: '12 control drums' },
			{ at: 'absorber', text: 'Graphite and boron carbide' }
		]
	},
	{
		title: 'Core',
		text: 'TRISO coated particle fuel in prismatic graphite core.',
		notes: [
			{ at: 'blocks', text: 'Prismatic graphite' },
			{ at: 'fuel', text: 'TRISO fuel' }
		]
	},
	{
		title: 'Sodium Heat Pipes',
		text: 'Sodium heat pipes enable redundant, high-temperature, entirely passive heat transfer.',
		notes: [
			{ at: 'pipes', text: 'Sodium heat pipes' },
			{ at: 'source', text: 'Entirely passive' }
		]
	},
	{
		title: 'Primary Heat Exchanger',
		text: 'Fin and tube heat exchanger.',
		notes: [{ at: 'dome', text: 'Fin and tube heat exchanger' }]
	},
	{
		title: 'Nitrogen Brayton Cycle',
		text: 'Simple recuperated N2 closed Brayton cycle enables efficient power conversion at < 300 psi. Low maintenance, low corrosion, leak resistant, and high reliability.',
		notes: [
			{ at: 'compressor', text: 'Compressor' },
			{ at: 'turbine', text: 'Turbine' },
			{ at: 'alternator', text: 'Alternator' }
		]
	},
	{
		title: 'Power Management & Distribution',
		text: 'Electricity is conditioned through a power management and distribution node which can flexibly deliver power and connect to local microgrids.',
		// The whole system: no part of the CAD is the distribution node itself.
		notes: []
	}
];
