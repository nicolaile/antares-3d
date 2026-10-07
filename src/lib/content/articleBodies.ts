/**
 * Article bodies, keyed by slug: the live copy from
 * antaresindustries.com/updates, one entry per story in updates.ts.
 *
 * Inline markup (links, bold, italics) is kept as HTML in `html` fields;
 * links off-site open in a new tab. Photos are saved locally; the YouTube
 * films embed, and the White House film plays from Framer's CDN, being too
 * large to keep in the repo.
 */
import type { Block } from './articles';
// The figure runs six columns (692px at 1440).
import f1Trackside from '$lib/assets/images/article/f1-electronics-01.jpg?w=1384;1038;692&enhanced';
import janusWelding from '$lib/assets/images/article/janus-01.jpg?w=1384;1038;692&enhanced';
import neutronsPit from '$lib/assets/images/article/neutrons-to-electrons-01.jpg?w=1384;1038;692&enhanced';
import neutronsEdu from '$lib/assets/images/article/neutrons-to-electrons-02.png?w=1384;1038;692&enhanced';
import neutronsFacility from '$lib/assets/images/article/neutrons-to-electrons-03.jpg?w=1384;1038;692&enhanced';
import neutronsVessel from '$lib/assets/images/article/neutrons-to-electrons-04.jpg?w=1384;1038;692&enhanced';

const images = {
	f1Trackside: {
		src: f1Trackside,
		alt: 'Luiz Oliveira at the Mercedes pit wall in team kit and headset, a grandstand behind'
	},
	janusWelding: {
		src: janusWelding,
		alt: 'A technician in a welding mask welds a flanged pipe assembly on the shop floor'
	},
	neutronsPit: {
		src: neutronsPit,
		alt: 'The Antares team looking down into the reactor test pit at Idaho National Laboratory'
	},
	neutronsEdu: {
		src: neutronsEdu,
		alt: 'The electrically heated demonstration unit glowing red during testing'
	},
	neutronsFacility: {
		src: neutronsFacility,
		alt: 'The reactor test facility floor, with the team gathered around the open pit'
	},
	neutronsVessel: {
		src: neutronsVessel,
		alt: 'Engineers in hard hats in front of the open end of a reactor vessel'
	}
};

export const bodies: Record<string, Block[]> = {
	'antares-and-centrus-sign-multi-year-haleu-supply-contract': [
		{
			type: 'paragraph',
			html: 'Centrus Energy (NYSE: LEU) and Antares Nuclear today announced the signing of a definitive multi-year contract for Centrus to supply Antares with High-Assay Low-Enriched Uranium (HALEU), with deliveries commencing before the end of the decade. It ensures a reliable, domestic source of HALEU to support Antares advanced reactor projects, including for space and national security missions. The new contract includes prepayments from Antares to support the expanded HALEU capacity.'
		},
		{
			type: 'quote',
			html: [
				'“This contract is another sign that demand for HALEU is real and it is accelerating, and Centrus is in prime position to meet this need,” said Amir Vexler, President and CEO of Centrus. “Binding orders from Antares and others are supporting our expansion to commercial-scale production – an expansion that is now well underway. We look forward to supporting Antares’ continued growth and success.”',
				'"Fuel supply is one of the practical questions every advanced reactor developer has to answer,” said Jordan Bramble, CEO and Co-Founder of Antares. “This contract gives Antares a reliable, U.S.-origin source of HALEU for the reactors we\'re deploying for a wide variety of defense and space customers."'
			]
		},
		{
			type: 'paragraph',
			html: 'Antares is developing compact microreactors for critical missions on Earth and in space. The company was recently selected for the U.S. Army\'s Janus Program at Fort Bragg, North Carolina; the Air Force\'s Advanced Nuclear Power for Installations program at Joint Base San Antonio, Texas; and a Space Force Strategic Breakthrough award to demonstrate a space reactor.'
		},
		{
			type: 'paragraph',
			html: 'Centrus is pioneering U.S. HALEU production at its American Centrifuge Plant in Piketon, Ohio, the only licensed HALEU production facility in the western world. Last year, Centrus launched a multi-billion-dollar expansion including large-scale production of HALEU as well as Low-Enriched Uranium (LEU).'
		},
		{
			type: 'paragraph',
			html: 'The agreement reflects the unique role that both companies can play in meeting U.S. national security requirements. Because Centrus\'s enrichment technology and manufacturing supply chain are U.S.-origin, the arrangement can provide Antares with fuel that could be used for a variety of national security applications. Centrus’ AC100 centrifuge design is the only deployment-ready enrichment technology capable of “unobligated” enrichment, meaning that it can be used for U.S. national security missions.'
		}
	],
	'antares-selected-for-161m-strategic-breakthrough-award-to-demonstrate-space-reactor': [
		{ type: 'lead', text: 'Effort will carry a nuclear-powered spacecraft toward flight qualification' },
		{
			type: 'paragraph',
			html: 'Antares today announced it has been selected by the Office of the Assistant Secretary of the Air Force for Space Acquisition and Integration for a Strategic Breakthrough award to advance nuclear power for space. It marks the largest current Department of War award in space nuclear power.'
		},
		{
			type: 'quote',
			html: [
				'“Space has been core to the Antares thesis since the company was founded,” said Jordan Bramble, CEO and co-founder of Antares. “This partnership with the Space Force turns that long-held vision into a codified space mission. Fission will unlock strategic capabilities that are impossible today.”'
			]
		},
		{
			type: 'paragraph',
			html: 'Through this program, Antares will perform a nuclear ground demonstration of the R1-S and integrate with a spacecraft for flight certification forward of launch. The company will also power an operational ground-to-space asset with Mark-1, its electricity-producing reactor, scheduled for testing in 2027.'
		},
		{
			type: 'paragraph',
			html: 'Space nuclear has been core to Antares from day one. It removes propulsion constraints for the Space Force, allowing spacecraft to maneuver without regret and carry out dynamic operations that were once impossible. Most importantly, it brings high, always-on power to support heavier compute loads, directed energy systems, and the future of electromagnetic warfare.'
		},
		{
			type: 'paragraph',
			html: 'On June 4, 2026, Antares\' Mark-0 microreactor achieved initial criticality at Idaho National Laboratory under Department of Energy authorization, making Antares the first private company to bring an advanced reactor to criticality under the DOE Reactor Pilot Program. The company\'s Mark-1 reactor is scheduled to operate for more than six months in 2027, integrated with its nitrogen closed Brayton cycle power conversion system.'
		},
		{
			type: 'paragraph',
			html: 'The award supports goals set in <a href="https://www.whitehouse.gov/presidential-actions/2025/12/ensuring-american-space-superiority/" target="_blank" rel="noopener">Executive Order 14369</a>, "Ensuring American Space Superiority," and the National Initiative for American Space Nuclear Power established by <a href="https://www.whitehouse.gov/wp-content/uploads/2026/04/NSTM-3-2026_04_14-corrected.pdf" target="_blank" rel="noopener">NSTM-3</a>, which direct the launch of nuclear reactors in space as early as 2028 and on the lunar surface by 2030.'
		}
	],
	'antares-puts-race-proven-power-electronics-inside-nuclear-reactor': [
		{
			type: 'paragraph',
			html: 'In 2019, Luiz Oliveira ran the hybrid power unit on Valtteri Bottas’s Mercedes through a Formula 1 championship season. Today he runs power conversion for a nuclear reactor.'
		},
		{
			type: 'paragraph',
			html: 'The overlap is no coincidence. It turned a Formula 1 approach into the operating model for Antares’ power-conversion hardware.'
		},
		{
			type: 'paragraph',
			html: 'The company today announced a partnership with Motion Applied, the UK-based Tier One technology provider, to supply race-proven power electronics for its microreactor power-conversion system. Motion Applied brings decades of high-performance electronics and electrification experience from motorsport and other demanding sectors into the program, giving Antares access to mature, production-grade technology rather than starting from a blank sheet. The hardware has been developed under the extreme duty cycles of high-performance motorsport, manufactured at volumes the nuclear industry has never approached, and qualified against reliability standards forged on production runs measured in the millions.'
		},
		{
			type: 'paragraph',
			html: 'For Motion Applied, the partnership represents a further extension of technology originally developed for the highest levels of motorsport into critical infrastructure. Its power electronics are designed for environments similar to those of microreactors and expected to operate safely and consistently in demanding field conditions.'
		},
		{ type: 'heading', text: 'Bespoke has limitations' },
		{
			type: 'paragraph',
			html: 'For fifty years, the nuclear industry built one of everything. Custom forgings, custom vessels, custom instrumentation, fabricated once for a site that would likely never see a second unit. The engineering was extraordinary. The cost structure was not survivable. “Bespoke” was never a property of nuclear physics, but a property of low volume.'
		},
		{
			type: 'quote',
			html: [
				'“The nuclear industry has never lacked for brilliance. Its instinct has traditionally been to design the hard thing itself," said Dr. Rian Bahran, Chief Nuclear Officer at Antares. "But vertical integration is a tool, not a binding principle. Automotive has put decades and enormous capital into power electronics R&amp;D, at a scale nuclear has never had the market to support. This partnership recognizes the brilliance of the automotive industry. We are harnessing a proven solution faster and at a fraction of the cost. Our reactor makes about as much electricity as one high-performance car, and that means a century of engineering is available to us.”'
			]
		},
		{ type: 'heading', text: 'The advantage of being small' },
		{
			type: 'paragraph',
			html: 'An Antares reactor’s electrical output sits in the same range as a high-performance car’s drivetrain. At that size, power-conversion requirements fall inside a supply chain that already ships millions of units a year, qualified to automotive functional-safety and zero-defect standards. A gigawatt plant cannot do this. The advantage exists precisely because Antares builds small.'
		},
		{
			type: 'paragraph',
			html: 'Oliveira arrived at Antares after a decade in motorsport: trackside race engineering with Honda Performance Development in IndyCar, Formula 1 power units at Mercedes-AMG High-Performance Powertrains, and then hypercar powertrain development at Czinger Vehicles in Torrance, where he led the development of the 950kW hybrid powertrain and the vehicle validation program. At Antares, he leads the technical development of the power-conversion program and supports its supply chain.'
		},
		{
			type: 'figure',
			image: images.f1Trackside,
			ratio: '2048 / 1536'
		},
		{
			type: 'quote',
			html: [
				'“In racing you find out on Sunday whether your part works, in front of everyone, and then you do it again the next week,” Oliveira said. “That pressure produced components with a reliability record nuclear has never had the volume to match. Nobody buys a car and wonders whether the engine will last. That confidence came from building tens of millions of them.”'
			]
		},
		{
			type: 'paragraph',
			html: 'The idea did not originate inside the company’s own assumptions. It arrived during Oliveira’s job interview.'
		},
		{
			type: 'paragraph',
			html: 'Antares’ technical panel asks candidates to present a proposed architecture. Oliveira used his slot to argue that the power-conversion system should draw on Formula 1 componentry rather than bespoke nuclear design.'
		},
		{
			type: 'quote',
			html: [
				'“It sounded like a contradiction,” he said. “You’re interviewing at a company that builds its own hardware, and your pitch is that it shouldn’t. What I’ve learned since is that the panel wasn’t testing whether I’d agree with them. A year on, the approach has legs, and we’ve brought in more engineers from automotive to carry it.”'
			]
		},
		{
			type: 'paragraph',
			html: 'That willingness to measure an idea by its merit, wherever it comes from, is how the company operates.'
		},
		{
			type: 'quote',
			html: [
				'“This partnership shows how technology developed for the highest levels of motorsport can be transferred into critical infrastructure,” said Samir Maha, CEO at Motion Applied. “Our power electronics are built to perform in environments where efficiency, durability and reliability are non-negotiable. Working with Antares allows us to apply that capability to a new generation of compact power systems, where proven technology can help accelerate deployment and reduce technical risk.”'
			]
		},
		{ type: 'heading', text: 'Vertical integration as a tool' },
		{
			type: 'paragraph',
			html: 'Antares remains vertically integrated where it matters. In Torrance, the company machines, assembles, and tests reactor hardware across 322,000 square feet. Plenty of parts remain bespoke and always will: nuclear-grade graphite, certain forgings, specialty instrumentation. Those only get cheaper as the order book grows. Everything else is judged by a single question: does building it make the reactor better, or does it merely make it Antares’?'
		},
		{
			type: 'paragraph',
			html: 'The approach positions Motion Applied as more than a component supplier. It places the company’s proven electrification and control capability at the center of Antares’ power-conversion strategy, demonstrating how high-performance engineering can move beyond the racetrack and into sectors where reliability, repeatability and speed of deployment matter just as much.'
		},
		{
			type: 'quote',
			html: [
				'We’re a lean company with a hard problem, and the only way to solve it is to be ruthless about what we work on,” said Jordan Bramble, CEO of Antares. “We said we’d have electricity in 2027, and reactors installed in 2028. Cut the bespoke parts, buy the proven ones, and you’re manufacturing a reactor instead of commissioning one. That’s what it takes to build a fleet rather than a first.”'
			]
		}
	],
	'antares-selected-for-nuclear-energy-launch-pad': [
		{
			type: 'paragraph',
			html: 'Antares has been selected for the Nuclear Energy Launch Pad Program, a U.S. Department of Energy (DOE) initiative led by the Office of Nuclear Energy and the National Reactor Innovation Center (NRIC) to move advanced nuclear technologies from concept to commercial deployment.'
		},
		{
			type: 'paragraph',
			html: 'The selection strengthens Antares\' growing footprint in Texas, where the company was previously selected to <a href="https://antaresindustries.com/updates/anpi-jbsa" target="_blank" rel="noopener">deliver microreactors to Joint Base San Antonio</a> under the Department of the Air Force\'s Advanced Nuclear Power for Installations initiative.'
		},
		{
			type: 'quote',
			html: [
				'"The Reactor Pilot Program accelerated Antares and deepened our partnership with DOE and NRIC," said Jordan Bramble, CEO and Co-Founder of Antares. "Launch Pad is the natural continuation of that collaboration and a next step toward delivering reliable power for the missions that matter most."'
			]
		},
		{
			type: 'paragraph',
			html: 'Launch Pad provides streamlined pathways for developers to demonstrate advanced nuclear technology and accelerate commercial deployment. The initiative leverages DOE\'s authority and expertise to offer flexible technical and regulatory frameworks that fast-track the path from concept to deployment.'
		},
		{
			type: 'paragraph',
			html: 'Through the Launch Pad USA pathway, Antares can pursue DOE authorization to operate nuclear reactors and fuel cycle facilities beyond the National Laboratories, with access to specialized nuclear expertise at Idaho National Laboratory and other National Labs, assistance navigating DOE authorization, a flexible contracting framework, and the ability to leverage unique regional and project-specific advantages.'
		},
		{
			type: 'paragraph',
			html: 'For Antares, Launch Pad helps bridge from demonstration to deployment. The company builds compact fission reactors for critical missions on Earth and in space, designed for factory production and rapid deployment. In June 2026, the company\'s Mark-0 became the first advanced reactor to reach criticality in the United States in more than forty years, and the first under DOE\'s Reactor Pilot Program, a milestone Launch Pad now carries forward toward deployment.'
		}
	],
	'antares-announces-multi-year-triso-fuel-supply-agreement-with-standard-nuclear': [
		{
			type: 'paragraph',
			html: '<strong>TORRANCE, Calif. — August 27, 2026</strong> — Antares announced today the execution of a binding multi-year fuel supply agreement (FSA) with Standard Nuclear (NYSE: STDN).'
		},
		{
			type: 'paragraph',
			html: 'Under the FSA, Standard Nuclear will deliver up to eight MTUs of TRISO fuel to Antares through 2035. Antares will use the fuel to power its microreactors, which are engineered to provide safe, reliable, and resilient energy for fielded systems operating in the most demanding environments on Earth and in space, enabling critical mission capabilities for the Department of War and commercial customers where traditional power sources simply cannot.'
		},
		{
			type: 'quote',
			html: [
				'“Antares exists to deliver nuclear power exactly where and when it is needed most, whether supporting stateside military installations, enabling persistent space operations, or powering mission-critical infrastructure far from the grid,” said Jordan Bramble, CEO and Co-founder of Antares. “Securing a long-term, industrial-scale supply of TRISO fuel from Standard Nuclear is a foundational step in moving our microreactors from demonstration to deployments. This partnership gives us the fuel certainty required to meet the strategic energy demands of our customers with the reliability and performance those missions require.”'
			]
		},
		{
			type: 'paragraph',
			html: 'The agreement builds on development work the companies have conducted together since 2025, including fuel specification, manufacturability, and production-path alignment. This locks in a secure, domestic supply of high-performance TRISO fuel for years to come. In doing so, it strengthens the U.S. advanced nuclear supply chain essential to national security and strategic energy independence.'
		},
		{
			type: 'quote',
			html: [
				'“Antares is building reactors for some of the most demanding environments on earth and in space, and Standard Nuclear is proud to support Antares for their strategic energy applications,” said Kurt Terrani, CEO of Standard Nuclear. “We are working to scale our TRISO production capacity across identical facilities and continue to adhere to our customers’ needs. Now, as our customers move from demonstration toward commercial deployment, we are building the supply chain that advanced reactors need to meet their commercial needs and our nation’s energy and national security.”'
			]
		}
	],
	'antares-awarded-army-janus-agreement-at-fort-bragg': [
		{
			type: 'paragraph',
			html: '<strong>WASHINGTON, D.C. — August 26, 2026</strong> — <strong>Antares announced today that it has been awarded an Other Transactions Authority agreement under the U.S. Army\'s Janus Program.</strong> The U.S. Army and Defense Innovation Unit selected Antares to own, construct, and operate nuclear microreactor power at Fort Bragg, North Carolina, in support of the Army\'s energy resilience mission.'
		},
		{
			type: 'paragraph',
			html: 'The Army, the Defense Innovation Unit, and a panel of nuclear experts drawn from the Department of Energy, the national laboratories, and across the Services selected Antares after rigorous technical due diligence. Evaluated against the field of competing designs, Antares\' TRISO-fueled, factory-produced microreactor emerged as one of the most mature and deployment-ready solutions.'
		},
		{
			type: 'paragraph',
			html: 'Antares achieved first criticality of its Mark-0 reactor at Idaho National Laboratory on June 4, 2026. Its Mark-0 was the <a href="https://www.energy.gov/articles/department-energy-celebrates-first-advanced-reactor-criticality" target="_blank" rel="noopener">first</a> reactor to reach that milestone under the Department of Energy\'s Reactor Pilot Program. Janus extends that momentum from demonstration toward deployment, advancing the Army\'s goal of operating an Army-regulated reactor on an Army installation by September 2028 under Executive Order 14299.'
		},
		{
			type: 'quote',
			html: [
				'“We\'re grateful and proud to partner with the U.S. Army and the Defense Innovation Unit on the Janus Program," said <strong>Jordan Bramble, CEO and Co-founder of Antares.</strong> "Energy scarcity is constraining America\'s most critical defense systems. Through Janus, Antares will deliver clean, firm, resilient power for the warfighter.”'
			]
		},
		{
			type: 'figure',
			image: images.janusWelding,
			ratio: '2048 / 1365',
			caption: 'Nate Jandra, lead technician, welds a component for Antares\' power conversion system in Torrance, California, August 25, 2026.'
		},
		{
			type: 'paragraph',
			html: 'Janus uses a milestone-based payment structure under which vendors are funded only after meeting defined technical goals, an approach that rewards execution and accelerates the delivery of resilient power to the field. Antares\' selection reflects the maturity of its TRISO-fueled, factory-produced microreactor and the operational heritage already being established through its test campaigns at Idaho National Laboratory.'
		},
		{
			type: 'quote',
			html: [
				'"The Janus Program is about transitioning from designs and experiments to reliable commercial hardware which secures our energy independence," said <strong>Dr. Jeff Waksman, Principal Deputy Assistant Secretary of the Army for Installations, Energy and Environment</strong>. "The Janus Program vendors were selected through a deeply rigorous evaluation on technical, financial, and organizational capabilities conducted by an All-Star panel of dozens of experts from across the nation. We look forward to working alongside each team as they proceed toward successfully completing the rigorous technical milestones we\'ve agreed upon.”',
				'“Between our <strong>contracts to deploy dozens of reactors</strong> under Janus for the Army, ANPI for the Air Force, and space nuclear for the Space Force, we now have a <strong>contract value on the order of $1B that is growing rapidly</strong>,” Bramble added.'
			]
		},
		{
			type: 'paragraph',
			html: 'Microreactors offer a uniquely resilient power source for defense-critical infrastructure, running for years without refueling and operating independent of the commercial grid or vulnerable liquid-fuel supply chains. As warfighting increasingly depends on assets based at installations across the United States — command and control, missile defense, and strategic deterrence among them — reliable, onsite power has become a mission imperative.'
		}
	],
	'dr-rian-bahran-joins-antares-as-chief-nuclear-officer': [
		{
			type: 'paragraph',
			html: 'Dr. Rian Bahran, who oversaw the federal portfolio for advanced reactor research, demonstration, and deployment at the Department of Energy, has joined Antares as Chief Nuclear Officer. Bahran joins as Antares moves from a demonstrated reactor to fielded systems, following the June 4 initial criticality of its Mark-0 reactor and the close of a $470 million Series C.'
		},
		{
			type: 'paragraph',
			html: 'Most recently, Bahran served as Deputy Assistant Secretary for Nuclear Reactors at the U.S. Department of Energy, where he oversaw the Department\'s portfolio for the research, development, demonstration, and deployment of advanced reactors, as well as technologies supporting the existing commercial fleet.'
		},
		{
			type: 'paragraph',
			html: 'A career member of the Senior Executive Service, he began his career at Los Alamos National Laboratory, where he spent over a decade as an experimentalist and program manager. He subsequently served across multiple administrations as a senior advisor to the Under Secretary of Defense for Policy, receiving the Secretary of Defense Medal for Exceptional Public Service, and as assistant director for nuclear technology and strategy in the White House Office of Science and Technology Policy.'
		},
		{
			type: 'paragraph',
			html: 'Bahran holds a Ph.D. in nuclear science and engineering from Rensselaer Polytechnic Institute, where his doctoral research was funded by U.S. Naval Reactors in support of the Knolls Atomic Power Laboratory Advanced Reactor Program, and a dual B.S. in nuclear engineering and engineering physics from RPI.'
		},
		{
			type: 'paragraph',
			html: 'At Antares, Bahran will lead nuclear operations, licensing, government affairs, and policy, and drive the company\'s expansion into new markets.'
		},
		{
			type: 'quote',
			html: [
				'"Rian has spent his career at every layer of this problem: the experiment, the policy, and the program," said Jordan Bramble, CEO of Antares. "There are very few people who have done all three. As we move from criticality to commercialization, his expertise is exactly what this team needs."'
			]
		},
		{
			type: 'paragraph',
			html: 'Antares\' microreactors are designed to operate safely and autonomously for years without refueling, delivering uninterrupted power to defense installations and other customers operating beyond reliable grid access.'
		},
		{
			type: 'quote',
			html: [
				'"Antares was first to criticality, and now comes the harder race to commercialization,” said Bahran. “There is no team I would rather run it with, one that puts its head down and delivers. As Chief Nuclear Officer, I’ll help get these reactors built, licensed, and fielded where the country and our allies need them most.”'
			]
		},
		{
			type: 'paragraph',
			html: 'The appointment follows a series of milestones for Antares, including the first privately developed non-light-water reactor to achieve criticality in the United States in more than four decades, selection by the U.S. Air Force under the Advanced Nuclear Power for Installations initiative, and a $470 million Series C co-led by Paradigm and Caffeinated Capital. The company is building toward its Mark-1 electricity-producing reactor in 2027 and initial deployments to defense customers in 2028.'
		}
	],
	'antares-raises-470m-series-c-to-deploy-nuclear-microreactors-for-critical-missions': [
		{
			type: 'paragraph',
			html: 'Antares has raised $470 million in Series C funding, co-led by Paradigm and Caffeinated Capital, with participation from Point72 Ventures, Shine Capital, Industrious Ventures, and others. The round accelerates Antares\' path from a demonstrated reactor to fielded power systems for defense and space, with initial deployments to U.S. military installations beginning by 2028.'
		},
		{
			type: 'quote',
			html: [
				'"Jordan and the Antares team just achieved the first private advanced reactor criticality in decades with a factory built microreactor,” said Alana Palmedo, managing partner, Paradigm. “Now they transition to a new era: The scaled deployment of microreactors that can operate reliably, safely, and economically for years on U.S. military bases. Paradigm is thrilled to back this team as they help to restore energy dominance in the U.S."'
			]
		},
		{
			type: 'paragraph',
			html: 'The capital, which includes $370 million in equity and $100 million in debt, comes weeks after Antares took its Mark-0 reactor critical at Idaho National Laboratory. It was the first privately developed non-light-water reactor to achieve criticality in the United States in more than four decades. Antares met the milestone on schedule, validating reactor physics, reactivity control, and instrumentation in a full-scale core using TRISO fuel.'
		},
		{
			type: 'quote',
			html: [
				'“Instead of relying on hype, Antares stands apart in the advanced nuclear space by delivering concrete results, such as winning the race to criticality and securing major customers like the U.S. Air Force,” said Varun Gupta, Partner, Caffeinated. “These results are not a product of luck; they are the product of outstanding decisions Jordan and the Antares team have consistently made, including their reactor design, choice of fuel, and focus on the Department of War as a first customer—decisions that ensure both reactor safety and the speed and resiliency of their supply chain.”'
			]
		},
		{
			type: 'paragraph',
			html: 'The company\'s microreactors are designed to run safely and autonomously for years without refueling, delivering uninterrupted power to the customers who depend on it most. That focus — engineering for sustained operation, not a one-time demonstration — shapes every decision the company makes.'
		},
		{
			type: 'quote',
			html: [
				'"On June 4th, we won the race to criticality, and now we’ve shifted to the race to commercialization," said Jordan Bramble, CEO and co-founder of Antares. "The military has been a partner to us every step of the way. We’ve secured firm contracts to build reactors. To do that, we’re announcing $470M of equity and debt to invest one-to-one with the taxpayer in bringing this technology to commercial scale. Our deep customer relationships and committed orderbook allow us to focus our engineering roadmap on one simple thing from here on out - reactors that operate reliably and safely for 6+ years deployed to military installations as soon as 2028. This focus will guide us to the first microreactor producing useful electricity in a truly commercially viable design.”'
			]
		},
		{
			type: 'paragraph',
			html: 'The Series C funds the path from a demonstrated reactor to fielded systems – the Mark-1 electricity-producing reactor in 2027, and initial deployments to defense customers in 2028, including the U.S. Air Force under the Advanced Nuclear Power for Installations initiative. Antares produces microreactors purpose-designed for those missions, addressing a widening national vulnerability: many U.S. military installations depend on a commercial grid under growing strain from rising demand, extreme weather, and adversary targeting. Antares is building to meet the deadline set out by Executive Order 14299, which directs the Department of War to begin operating a reactor at a domestic military installation by September 30, 2028.'
		}
	],
	'antares-ceo-joins-the-president-at-the-white-house-to-mark-the-doe-reactor-pilot-program': [
		{
			type: 'paragraph',
			html: 'Our CEO, Jordan Bramble, was honored to join the President at the White House today to commemorate the DOE Reactor Pilot Program.'
		},
		{
			type: 'paragraph',
			html: 'The executive orders were an unlock for advanced nuclear innovation. Antares was first through the door.'
		},
		{
			type: 'paragraph',
			html: 'On June 4, Mark-0 achieved initial criticality at Idaho National Laboratory — the first privately developed non-light-water reactor to reach criticality in the United States in over four decades.'
		},
		{ type: 'video', src: 'https://framerusercontent.com/images/2jwPwgQE5cZntqO4fhENJ8E6qC0.mp4' },
		{
			type: 'paragraph',
			html: 'Speaking at the event, Bramble credited the policy shift that made it possible:'
		},
		{
			type: 'quote',
			html: [
				'"Mr. President, thank you so much for your leadership. It was really your executive orders that catalyzed this nuclear renaissance. When they first came out, people scoffed. They said it couldn\'t be done. And now there are not only three, but four companies here that really met the moment.',
				'At Antares, we look forward to being a resilient energy source for Golden Dome, to power high-powered assets in space, and eventually undersea autonomy.',
				'This is a strategic technology for our nation. And what we look forward to doing is putting reactors on our military installations before 2028."'
			]
		},
		{
			type: 'paragraph',
			html: 'The Reactor Pilot Program was designed to move advanced reactors from paper to hardware on a timeline that matches the urgency of the mission. Mark-0 is what that acceleration looks like in practice: a factory-produced fission microreactor, built for the places where power is hardest to get and matters most.'
		},
		{
			type: 'paragraph',
			html: 'Criticality was the proof. Deployment is the point.'
		},
		{
			type: 'paragraph',
			html: 'We look forward to powering our nation\'s critical missions.'
		}
	],
	'antares-signs-long-term-haleu-supply-agreement-with-general-matter': [
		{
			type: 'paragraph',
			html: 'Antares Nuclear has signed a multi-year enrichment services agreement with General Matter to supply High-Assay Low-Enriched Uranium (HALEU) for Antares microreactors. The agreement strengthens a critical and capacity-constrained link in the U.S. advanced nuclear fuel supply chain.'
		},
		{
			type: 'paragraph',
			html: 'The agreement covers several metric tons of HALEU, with deliveries expected to begin this decade from General Matter’s planned enrichment facility in Paducah, Kentucky. Domestically enriched uranium will support Antares microreactor deployments for critical defense and commercial applications, as previously announced.'
		},
		{
			type: 'quote',
			html: [
				'“General Matter is building new American enrichment capacity, and we’re proud to partner with them,” said Jordan Bramble, CEO and Co-founder of Antares. “This HALEU agreement strengthens our ability to secure the fuel needed to power critical missions for our customers.”'
			]
		},
		{
			type: 'paragraph',
			html: 'The agreement further strengthens Antares’ domestic fuel supply chain. General Matter joins Antares’ growing portfolio of fuel partners, advancing Antares’ strategy to build a resilient and diversified fuel supply network for its microreactor deployments.'
		}
	],
	'antares-achieves-criticality-of-mark-0-reactor': [
		{ type: 'lead', text: 'Landmark DOE--INL--Antares collaboration ushers in new era for American Nuclear power' },
		{
			type: 'paragraph',
			html: 'IDAHO FALLS, Idaho--Antares today announced that its Mark-0 microreactor achieved initial criticality at Idaho National Laboratory (INL) under U.S. Department of Energy (DOE) authorization — making Antares the first private company to bring an advanced reactor to criticality under the DOE Reactor Pilot Program. The demonstration was conducted in partnership with DOE, INL, and BWX Technologies, Inc. (BWXT), with integration and observation support from the U.S. Army.'
		},
		{
			type: 'paragraph',
			html: '“Today’s achievement is a historic moment for American nuclear energy,” said <strong>U.S. Energy Secretary Chris Wright</strong>. “By bringing the first American non-light water privately developed reactor to criticality in more than four decades, Antares has shown what is possible when American innovation is unleashed. The Trump administration is proud to support the rebirth of America’s nuclear industry and ensuring Americans have access to affordable, reliable and secure energy for generations to come.”'
		},
		{
			type: 'paragraph',
			html: 'The demonstration meets an ambitious objective set by the President and DOE to reform how the federal government tests advanced reactors, and it establishes a replicable licensing pathway that DOE and industry can use to accelerate future reactor demonstrations on commercial timelines.'
		},
		{
			type: 'paragraph',
			html: '"Hitting our commitments is everything to us. Nuclear in America has been defined for too long by delays, by companies that said they would and then didn\'t," said Jordan Bramble, CEO of Antares. "We said criticality in 2026, electricity production in 2027, and power to the warfighter in 2028. Today is the first of those commitments delivered on the schedule we set. The President and DOE set an ambitious timeline for reactor testing, and we met that challenge. I want to thank our partners at the Department of Energy, Idaho National Lab, BWXT, and the U.S. Army. This is what happens when industry and government work together to accomplish big things."'
		},
		{
			type: 'paragraph',
			html: 'This reactor validates key reactor physics parameters for Antares\' reactors and contributes verification and validation data back to the Department of War\'s Project Pele. The Mark-0 was authorized by DOE under the Reactor Pilot Program, with the U.S. Army integrated throughout as a future end user. This model of interagency coordination directly supports the Army\'s microreactor deployment timeline.'
		},
		{
			type: 'paragraph',
			html: 'Mark-0 benefited from using the same nuclear fuel as the Project Pele program, an initiative to design, build, and demonstrate a prototype of a transportable micro nuclear reactor for military use. The TRISO (TRi-structural ISOtropic) fuel was fabricated by Virginia-based BWXT.'
		},
		{
			type: 'paragraph',
			html: '“BWXT is proud to work with Antares and deliver the fuel necessary for this important milestone at the Idaho National Lab. Antares is moving quickly to progress from concept to criticality, and we are happy to supply this team with the TRISO needed to do so,” said Joe Miller, BWXT’s president for Government Operations. “The fuel specification and manufacturing expertise we matured through the Strategic Capabilities Office’s Project Pele directly underpin this milestone, and the data from this demonstration will emphasize the strategic importance of the nuclear industry enabled by the strong leadership of the DOE and the Trump Administration.”'
		},
		{
			type: 'paragraph',
			html: 'The demonstration and the licensing pathway it establishes represent a key step toward deploying electricity-producing microreactors for U.S. military installations by September 30, 2028.'
		},
		{
			type: 'paragraph',
			html: '“The DOE Reactor Pilot Program is a critical step necessary to deliver on President Trump’s executive orders,” said Dr. Jeff Waksman, Principal Deputy Assistant Secretary of the Army for Installation, Energy and Environment. “Antares is the first company in that program to achieve criticality. Next, we need to see a reactor generate electricity at full power. Then the Army will take the baton and deliver a full electricity-generating nuclear reactor to a military installation.”'
		},
		{
			type: 'paragraph',
			html: '"We went from concept to a critical reactor, safely, in less than 12 months. That doesn\'t happen by accident. The team treated the schedule as non-negotiable," Bramble added. "It also doesn\'t happen without decades of DOE investment in the AGR-2 TRISO specification and the Project Pele fuel supply chain at BWXT. Our partners at Idaho National Laboratory and DOE-ID provided the design, regulatory, and facilities support that enabled this schedule. This is a victory for Antares, for our partners, and for an American nuclear industry that is accelerating again."'
		},
		{
			type: 'paragraph',
			html: 'Beyond meeting the objectives of Executive Order 14301, the demonstration produced the testing data, model validation, and control system performance that will advance Antares\' commercial reactor toward full-power electricity production. Engineers gained direct insight into the physics of the Mark-0 core, the behavior of its control drums, and the maturity of its supply chain. These lessons will have compounding benefits across every reactor Antares builds.'
		},
		{
			type: 'paragraph',
			html: '"This is a high-safety, high-information test that closes the loop between design prediction and physical realization. It\'s also a forcing function," Bramble said. "It forced us to build an organization that can design, license, build, and test reactors on a schedule, and it forced DOE\'s licensing pathway to run at the pace the country needs. For the American nuclear renaissance to succeed, we need efficient, iterative reactor testing, not a decade per design. Criticality is the first step. Electricity from this same facility, using the same TRISO fuel, is expected in roughly a year. Power for military installations follows in two."'
		},
		{
			type: 'paragraph',
			html: 'Antares\' criticality opens the next chapter of American nuclear power and was delivered in time for America\'s 250th birthday.'
		},
		{ type: 'heading', text: 'About Antares' },
		{
			type: 'paragraph',
			html: 'Antares is a nuclear fission energy company developing compact microreactors for defense and space applications, delivering safe, reliable power where traditional energy sources cannot. Founded in 2023 and backed by over $140 million in funding, Antares achieved initial criticality of its Mark-0 microreactor in 2026 under the DOE Reactor Pilot Program, and is on track to produce electricity from an advanced reactor in 2027, with initial production deployments to U.S. military installations beginning in 2028. Antares operates facilities in Torrance, California; Idaho Falls, Idaho; and Aiken, South Carolina.'
		},
		{ type: 'heading', text: 'Contacts' },
		{
			type: 'paragraph',
			html: '<strong>Media </strong><br><a href="mailto:kayla.haas@antaresindustries.com">kayla.haas@antaresindustries.com</a>'
		}
	],
	'antares-signs-long-term-haleu-supply-agreement-with-urenco': [
		{
			type: 'paragraph',
			html: '<strong>TORRANCE, California</strong> — Antares has signed a long-term enrichment services agreement with Urenco to supply High-Assay Low-Enriched Uranium (HALEU) for its factory-produced microreactors. The deal secures one of the most constrained inputs for advanced reactor commercialization and reinforces a reliable Western fuel supply chain for next-generation nuclear energy.'
		},
		{
			type: 'paragraph',
			html: '“We are pleased to execute with Antares the world’s first multi-year contract for the supply of HALEU, which marks an important milestone in the maturation of this new market,” said Magnus Mori, Head of Advanced Fuels for Urenco. “With our UK HALEU facility set to come online in 2031, we look forward to a long-term supply relationship supporting the deployment of Antares’ reactor technology.”'
		},
		{
			type: 'paragraph',
			html: 'Under the agreement, Urenco will provide enrichment services for HALEU to support Antares\' planned microreactor deployments in North America and allied markets. The fuel will be produced at Urenco\'s HALEU enrichment facility in the United Kingdom, which is on schedule to be one of the first Western licensed facilities.'
		},
		{
			type: 'paragraph',
			html: '"Microreactors fueled with HALEU will be more performant and more economical," said Jordan Bramble, CEO of Antares. "This partnership ensures that when we scale beyond material allocated by the federal government, we will have commercial supply ready to meet our needs."'
		},
		{
			type: 'paragraph',
			html: 'Reliable access to HALEU is widely recognized as one of the most important enablers for advanced reactors. With this partnership, Antares is one step closer to delivering microreactors designed for a wide spectrum of commercial applications.'
		},
		{ type: 'heading', text: 'About Antares' },
		{
			type: 'paragraph',
			html: 'Antares is a nuclear fission energy company developing compact microreactors for energy applications on Earth and in space, delivering safe, reliable power where traditional energy sources cannot. Founded in 2023 and backed by over $140 million in funding, Antares is on track to conduct a reactor demonstration in 2026, to test its first electricity-producing reactor in 2027, with initial production deployments beginning in 2028. Antares operates facilities in Torrance, California; Idaho Falls, Idaho; and Aiken, South Carolina.'
		}
	],
	'antares-selected-for-proposed-deployment-of-nuclear-microreactor-at-joint-base-san-antonio-under-department-of-the-air-force-anpi-initiative': [
		{
			type: 'paragraph',
			html: '<strong>SAN ANTONIO, Texas</strong> — The Department of the Air Force, in conjunction with the Defense Innovation Unit, <a href="https://www.af.mil/News/Article-Display/Article/4465439/daf-announces-next-steps-in-advanced-nuclear-power-for-installations-initiative/" target="_blank" rel="noopener">has selected Antares</a> for the proposed deployment of a prototype nuclear microreactor at Joint Base San Antonio under the Advanced Nuclear Power for Installations (ANPI) initiative.'
		},
		{
			type: 'quote',
			html: [
				'"We\'re grateful and proud to partner with Joint Base San Antonio, the Department of the Air Force, and the Defense Innovation Unit," said Jordan Bramble, CEO and founder of Antares. "We built this company to deliver resilient power for missions like this."'
			]
		},
		{
			type: 'paragraph',
			html: 'The utility infrastructure, land availability, and critical mission requirements at Joint Base San Antonio led to its selection as a potential location to site Antares reactors. Under the initiative, Antares anticipates siting, licensing, constructing, operating, and decommissioning its R1 microreactors, with systems targeted for deployment by 2028 or earlier.'
		},
		{
			type: 'paragraph',
			html: 'The R1 is a sodium heat pipe-cooled microreactor using robust tri-structural isotropic (TRISO) fuel. Antares plants serve installations by providing electricity, years of safe operation between refueling, and require no connection to the commercial power grid or specialized infrastructure to deploy.'
		},
		{
			type: 'paragraph',
			html: 'This effort ensures the execution of critical missions without interruption, thereby strengthening national security.'
		},
		{
			type: 'quote',
			html: [
				'“Energy resilience is imperative to sustaining operations. If selected as a site under this initiative, Joint Base San Antonio’s resilience would take a tangible step forward to ensure reliable support for its many important missions,” said Brig. Gen. Randy Oakland, JBSA and 502d Air Base Wing commander.'
			]
		},
		{
			type: 'paragraph',
			html: 'Antares is currently in the final phase of the Department of Energy\'s Reactor Pilot Program to build a reactor that achieves criticality – a stable, self-sustaining nuclear fission reaction – before July 4, 2026. Fuel fabrication for Antares\' initial reactors has been underway at BWX Technologies since October 2025.'
		},
		{
			type: 'paragraph',
			html: 'Following the Mark-0 demonstration, Antares will use the same test facility and fuel for its Mark-1 electricity-producing reactor in 2027, with initial production deployments for defense and space customers targeted for 2028.'
		},
		{ type: 'heading', text: 'About Antares' },
		{
			type: 'paragraph',
			html: 'Antares is a nuclear fission energy company developing compact microreactors for defense and space applications, delivering safe, reliable power where traditional energy sources cannot. Founded in 2023 and backed by over $140 million in funding, Antares is on track to conduct a reactor demonstration in 2026, to test its first electricity-producing reactor in 2027, with initial production deployments beginning in 2028. Antares operates facilities in Torrance, California; Idaho Falls, Idaho; and Aiken, South Carolina.'
		}
	],
	'antares-receives-doe-documented-safety-analysis-approval-for-mark-0-demonstration-reactor': [
		{
			type: 'paragraph',
			html: 'The advanced nuclear energy company <a href="/">Antares</a> received U.S. Department of Energy (DOE) approval of the Documented Safety Analysis for its Mark-0 reactor under DOE standard 1271.'
		},
		{
			type: 'paragraph',
			html: 'This milestone reflects DOE\'s acceptance of the final design for the Mark-0 reactor and the safety case supporting it and follows Antares\' Preliminary Documented Safety Analysis approval in January 2026.'
		},
		{
			type: 'paragraph',
			html: 'Antares now enters the DOE Readiness Review process, the final phase before the DOE approves the startup of our reactor pilot. Antares remains on track to go critical ahead of July 4, 2026.'
		},
		{
			type: 'paragraph',
			html: '“We are entering the final innings, and that’s incredibly exciting,” said Jordan Bramble, CEO and founder of Antares. “Getting here was only possible with strong support from our partners at Idaho National Laboratory and BWXT, and leadership at DOE, along with relentless work from the Antares team.”'
		},
		{
			type: 'paragraph',
			html: '"We developed this timeline in 2023 and we have hit every milestone since," said Bramble. "This is a clear sign that we are proving our safety basis every step of the way, and I’m proud of the way this team has cleared key checkpoints, on schedule, again and again.”'
		},
		{
			type: 'paragraph',
			html: '“The Department of Energy is pleased to see Antares reach this important milestone,” said Rian Bahran, Deputy Assistant Secretary of Energy for Nuclear Reactors. “We remain committed to working with innovative companies like Antares to reach the President’s ambitious goal of ensuring at least three reactors reach criticality before July 4, 2026.”'
		},
		{
			type: 'paragraph',
			html: 'The Mark-0 demonstration will validate reactor physics, neutronics models, and the instrumentation and control system that will also be used in the Mark-1 electricity-producing reactor planned for 2027. Fuel fabrication for the company’s first reactors has been underway through BWX Technologies, since October 2025 using HALEU fuel secured through a DOE allocation.'
		},
		{
			type: 'paragraph',
			html: 'Following the Mark-0 demonstration, Antares will use the same test facility and fuel batch for its Mark-1 reactor in 2027, advancing toward initial deployments for defense and space customers in 2028.'
		}
	],
	'from-neutrons-to-electrons-our-path-to-power': [
		{
			type: 'paragraph',
			html: 'In conjunction with our Preliminary Documented Safety Analysis (PDSA) approval, we’ve announced our test facility. This is a good moment to highlight what we plan to achieve with our first criticality this summer, what our test is and isn’t, and how it fits into our broader tech maturation roadmap to enable commercialization.'
		},
		{
			type: 'figure',
			image: images.neutronsPit,
			ratio: '1200 / 1600'
		},
		{
			type: 'paragraph',
			html: 'The ultimate development milestone is a full-scale, commercially viable, electricity-producing reactor. We intend to produce electricity with a full-scale reactor, the Mark-1, within 2027, in the same test facility we have established for the Mark-0 pilot reactor. Everything we are doing with the pilot reactor is designed to accelerate our ability to produce electricity through an iterative, incremental development approach.'
		},
		{
			type: 'paragraph',
			html: 'There are many misconceptions about the value of full-thermal-power versus zero-power testing, which can confuse those outside the industry and lead to opaque assessments of technical progress. We believe it is best for Antares and the industry as a whole to be transparent about the milestones necessary to mature our product. We have built our program around that philosophy: <em>test subsystems early, integrate deliberately, ensure that each experiment is representative of the product we intend to deploy, and then incorporate experimental results to enhance the end-state product.</em>'
		},
		{
			type: 'paragraph',
			html: 'We have chosen a staged development path built around three validations:'
		},
		{
			type: 'list',
			ordered: true,
			items: [
				'<strong>Heat Transfer</strong> <br><br>Reactors must be able to transport heat from the fuel to a heat exchanger and exchange it with the power conversion system to accurately determine the thermal power at which the reactor can and should operate. This can be done in a nuclear demonstration, but given how short-lived demonstrations often are, irradiation-induced aging of components is negligible. Therefore, the performance of the primary coolant can be validated more quickly and cheaply using an electrically heated surrogate. Furthermore, this is a safe approach to development ahead of a nuclear demonstration.<br><br>We completed Milestone 1 through our electrically heated demonstration Unit (EDU) test at NASA Marshall in 2025. This is a milestone we intend to complete again in 2026, with a subsequent iteration of our heat pipe design and control system.',
				'<strong>Reactor physics</strong><br><br>Modern reactor design relies on high-fidelity simulation codes, but simulations must be anchored in real-world measurements. Zero-power critical testing enables us to ground our neutronics and reactor kinetics simulations in reality. This requires us to build a reactor that allows us to collect empirical measurements of reactivity, shutdown margin, kinetics parameters, and flux and power distributions. Collecting this data in a low-power reactor enables us to design and build high-power reactors with greater confidence that our simulations match reality. That is what the Mark-0 demonstration before July 4th is intended to do: validate the nuclear fundamentals of our system. Mark-0 will also be the first demonstration of our instrumentation and control system–the same system that will also be used in Mark-1 and subsequent reactors.<br><br><em>Note that this milestone can only be achieved if the fuel and core layout are sufficiently representative of the commercial product.</em>',
				'<strong>Full power operation with a Power Conversion System (PCS)</strong><br><br>The third stage of development is integrating heat generation and heat transfer into a true prototype power plant. Full-power operation validates the next set of temperature-dependent reactor effects, including reactivity feedback effects, kinetic and dynamic stability, xenon poisoning, and power and flux distributions. <br><br>The most important aspect of this milestone is validating the thermal efficiency of the power conversion technology and characterizing the coupled feedback between the reactor and power conversion system. This integrated testing is what Mark-1 is for.'
			]
		},
		{
			type: 'figure',
			image: images.neutronsEdu,
			ratio: '844 / 1196'
		},
		{
			type: 'figure',
			image: images.neutronsFacility,
			ratio: '1600 / 1200'
		},
		{
			type: 'figure',
			image: images.neutronsVessel,
			ratio: '1600 / 900'
		},
		{ type: 'heading', text: 'Why the sequence is deliberate' },
		{
			type: 'paragraph',
			html: 'While everything validated by these milestones is necessary, a company could choose to consolidate all milestones into a single test or shift the timing of which performance properties are validated. At Antares, we’ve aimed to achieve ZPC in 2026, since 2023. The reason for this approach is simple. First, using heat pipes as the primary coolant makes it straightforward to validate the performance of our primary coolant and primary heat exchanger through EDUs. Second, many reactor physics and control systems properties can be validated at low to zero power. Lastly, starting with zero power ensures low radiation-induced activation in the test facility and allows us to reuse the fuel, enabling us to proceed rapidly with our electricity-producing test. If we tested at full power without a power conversion system, as other companies intend, it could be as long as a year before we could safely work inside the test facility to enable a subsequent test, which risks delaying full completion of milestone three.'
		},
		{
			type: 'paragraph',
			html: 'These three milestones are not meant to be exhaustive. Even after an electricity-producing prototype is built, the work is just beginning. The next step is to iterate from First-of-a-Kind (FOAK) to true Nth-of-a-Kind (NOAK) performance with commercially viable economics. This will require component redesign, investments in materials irradiations to qualify for longer life, fuel performance advances, manufacturing scale-up, and supply chain consolidations.'
		},
		{ type: 'heading', text: 'Where to from here?' },
		{
			type: 'paragraph',
			html: 'We, as Americans, are closer than ever to a nuclear renaissance. The next four years will likely see more new reactors than the preceding forty. At the same time, we must maintain humility and acknowledge how far we still have to go for success to endure and scale. At Antares, our approach to testing involves subsystem testing followed by integrated effects testing that validates the milestones listed above. A heat pipe reactor design allows rapid iteration on EDUs, since iteration on heat pipes is faster than on turbopumps used in HTGRs. Under the Department of Energy’s Pilot Program, we will achieve zero to low power criticality with a full-scale reactor (Mark-0) and control system, satisfying milestone two. At this stage, we will still be on the “20-yard line”.'
		},
		{
			type: 'paragraph',
			html: 'True performance validation for any reactor design comes from graduation to a full-scale electricity-producing system. <em>Currently, none of the DOE-authorized reactor tests slated for 2026 will be electricity-producing systems.</em> It is important for all reactor developers to consider how they will transition from reactor tests in 2026 to electricity-producing systems as soon as possible. At Antares, we have a clear plan. In 2027, we will use the same test facility at INL and the same batch of HALEU TRISO fuel compacts to scale up to full power and produce electricity using our nitrogen-closed Brayton cycle. <strong>We have a very real chance to be the first new electricity-producing American advanced reactor of the 21st century!</strong>'
		},
		{
			type: 'paragraph',
			html: '2026 has already seen unprecedented acceleration in the development of privately built reactor prototypes. We at Antares are moving at a pace once considered preposterous. In just 2 years, we’ve tested an EDU, established a reactor test site, begun fabricating HALEU TRISO fuel for two reactors in partnership with BWXT, and received the first-ever approved PDSA for a reactor. As we accelerate, we must also ensure the industry does not lose sight of its long-term objectives – safe, reliable, economical power. Unrealistic short-term expectations will lead to disappointment, and customers, government partners, congressional offices, and investors may turn bearish on the nuclear renaissance. My hope is that, by accurately framing a simple set of preliminary technology maturation milestones, we can align interests for enduring, scalable success. Onward to criticality!'
		}
	],
	'antares-is-expanding-its-existing-headquarters-antares-prime-to-support-the-next-phase-of-reactor-development-and-manufacturing': [
		{
			type: 'paragraph',
			html: 'We are expanding Antares Prime from 145,000 square feet to 322,000 square feet, adding 187,000 square feet of adjacent, operable manufacturing and integration space, without constructing a new facility. Because this expansion uses existing operable space, we can execute quickly without disrupting ongoing work or relying on a multi-year construction effort.'
		},
		{
			type: 'paragraph',
			html: 'Antares Prime is designed to tightly integrate design, manufacturing, and testing. By co-locating these functions, we enable faster iteration, higher confidence in system performance, and a clearer path from early demonstrations to repeatable production.'
		},
		{
			type: 'paragraph',
			html: 'At steady state, the expanded facility is designed to support manufacturing our first 50 reactors, with a clear path to scale beyond that as demand grows. In addition, this expansion will enable continued research &amp; development for new programs and applications. This capacity is critical for delivering nuclear power systems intended to be deployed in fleets, not as one-off demonstrations.'
		},
		{
			type: 'paragraph',
			html: 'Antares Prime will produce the R1 microreactor and serve as the manufacturing foundation for future reactor variants and integrated energy systems across defense, space, and industrial applications.'
		}
	],
	'antares-receives-doe-approval-for-mark-0-reactor-preliminary-documented-safety-analysis-pdsa': [
		{
			type: 'paragraph',
			html: 'The <a href="https://www.linkedin.com/company/energy/" target="_blank" rel="noopener">U.S. Department of Energy (DOE)</a> has formally approved our Preliminary Documented Safety Analysis (PDSA) for the Mark-0 reactor—our first demonstration reactor, scheduled to go live before July 4, 2026. Mark-0 will validate fueling operations, reactor controls, and core physics.<br><br>This demonstration is a critical step toward generating electricity from advanced microreactors. Mark-0 uses a full-scale core and the same facility and fuel that will support our next reactor test in 2027.<br><br>The PDSA defines the preliminary safety basis for the reactor, facility, and planned operations, demonstrating that our approach meets DOE expectations at this stage. This approval validates our safety case and establishes a clear pathway to final acceptance as we prepare for fabrication, assembly, and installation.<br><br>Mark-0 will be tested at Idaho National Laboratory in Building 793—now the Reactors and Critical Experiments facility—a site with deep nuclear history. Decades ago, this building housed ML-1, the Army’s first mobile nuclear reactor. Today, it supports the next generation of deployable nuclear power. We find the historical relevance fitting and inspiring, as Antares develops a similar-scale microreactor to meet Army operational and installation needs.<br><br>Since 2024, we’ve worked to establish this facility as an enduring testbed, enabling rapid progress without the need for groundbreaking construction. We’re grateful for our partners at DOE and <a href="https://www.linkedin.com/company/idaho-national-laboratory/" target="_blank" rel="noopener">Idaho National Laboratory</a>, and for leaders like Congressman Mike Simpson who continue to support the American nuclear renaissance.'
		},
		{ type: 'video', youtube: 'iCkwFUJcvUE' }
	],
	'graphite-machining-for-mark-0-begins-at-antares-prime': [
		{
			type: 'paragraph',
			html: 'The Mark-0 build has officially begun. This graphite article will be a part of our bottom reflector. We’ve also now fabricated our vessel, and we began fabrication of our HALEU TRISO fuel back in October!<br><br>Look out for more updates to come on our fuel fabrication progress, our test facility, and our regulatory milestones.<br><br>We believe you must build a reactor to design a reactor - so that is exactly what we are doing.'
		},
		{ type: 'video', youtube: 'Q5QfM37q-jI' }
	],
	'heat-pipe-testing-at-antares-prime': [
		{
			type: 'paragraph',
			html: 'Heat pipes are how we cool our reactor. They rely on working fluid phase change to passively move heat from our core to our heat exchanger, without any moving parts, like pumps or rotating components.<br><br>Heat pipes were developed at <a href="https://www.linkedin.com/company/los-alamos-national-laboratory/" target="_blank" rel="noopener">Los Alamos National Laboratory</a> in 1963 for space nuclear power, and are now used in everyday applications like smart phones, laptops, and satellite radiators.<br><br>We believe the key to building many reactors is comprehensive testing of components and systems. A key advantage of using heat pipes is that we can iterate much faster on collecting test data compared to a turbopump for a gas coolant. We are building and testing heat pipes daily!'
		},
		{ type: 'video', youtube: 'dVt9ILnS9XA' }
	],
	'a-letter-from-our-ceo-antares-96m-series-b': [
		{
			type: 'paragraph',
			html: 'Today, I am excited to announce our <strong>$96 million Series B</strong>. This capital allows us to move with the speed and discipline required to deliver something America hasn’t done in a very long time: design, build, and test nuclear reactors within a few years—not decades.'
		},
		{
			type: 'paragraph',
			html: 'I want to share why we raised this capital, what it enables us to do next, and how it fits into the much larger mission we’re pursuing.'
		},
		{
			type: 'paragraph',
			html: 'When we founded Antares just over two years ago, our early team rallied around a few simple but urgent observations:'
		},
		{
			type: 'list',
			ordered: true,
			items: [
				'Energy scarcity is hindering deployment of America’s most critical national security systems. Simply put, paradigm shifts in warfighting have left the U.S. military lacking electrons where they are most needed.',
				'The U.S. had lost the ability to build nuclear hardware quickly and iteratively. For nearly half a century, nuclear engineering became dominated by paperwork and modeling—designs, analyses, and reviews—without the develop-build-test-iterate cycles required to mature real systems. Entire generations of engineers retired without ever building or operating the hardware they spent their careers designing.'
			]
		},
		{
			type: 'paragraph',
			html: 'We raised this round to change that trajectory.'
		},
		{
			type: 'paragraph',
			html: 'This capital will be deployed toward hardware, subsystem testing, fuel fabrication, manufacturing, and the infrastructure required to turn on a reactor and lay the foundation for even more progress to come. We believe that you cannot decouple the design and build phase into a linear process, they must be iterative.'
		},
		{ type: 'heading', text: 'Near-Term: Our First Reactor Demonstration' },
		{
			type: 'paragraph',
			html: 'In 2026, we will conduct a low-power reactor demonstration, the Mark-0 at Idaho National Laboratory. This demo, born out of the opportunity created by Executive Order 14301: Reforming Nuclear Reactor Testing at the Department of Energy will validate the reactor physics and reactivity controls of our R1 design and establish the facility, tooling, and operations required for sustained and enduring testing. Perhaps, most important of all, we will rapidly build institutional expertise with Department of Energy’s DOE-1271 standard for authorization, which will enable us to move faster with more schedule certainty on future test campaigns.'
		},
		{ type: 'heading', text: 'What Comes Next' },
		{
			type: 'paragraph',
			html: 'After we successfully complete Mark-0 operation, we will have a clear pathway to our next major milestone: building a full power, electricity-producing reactor as early as 2027,<strong> </strong>using the same facility in Idaho. In 2026, we will transition from reactor physics tests to qualifying the full suite of reactor subsystems and constructing our first commercial prototype microreactor—the Mark-1.'
		},
		{
			type: 'paragraph',
			html: 'This Mark-1 reactor represents the bridge between development and production. It will validate:'
		},
		{
			type: 'list',
			ordered: false,
			items: [
				'Our system performance in expected operating conditions at full power and temperature for at least 90 days.',
				'Our power conversion system and its ability to produce electricity for real-world applications. This closed Brayton cycle system will be the second unit we’ve tested, the first of which will turn on in 2026.',
				'Our safety case for all phases and operating states and the application of passive and inherently safe design characteristics.',
				'Our operations and procedures, including startup, shutdown, and decommissioning.'
			]
		},
		{ type: 'heading', text: 'Our Market is Clear' },
		{
			type: 'paragraph',
			html: 'The capital raised today positions us to compete in several sector-defining federal programs across the Department of the Army, NASA, and other federal agencies.'
		},
		{
			type: 'paragraph',
			html: 'In October, the Army announced the JANUS program, a microreactor-focused program designed to deliver resilient, secure, and assured energy to support Army bases and operational missions. JANUS represents a substantial investment in the transition from prototypes to commercially viable microreactor solutions for warfighters. We started Antares to provide the Pentagon with reliable power for mission assurance, readiness, and lethality.'
		},
		{
			type: 'paragraph',
			html: 'Through programs like Project JANUS, the Department has solidified themselves as the first moving customer in advanced nuclear. The first microreactors delivering power to customers in the U.S. will likely be on military installations.'
		},
		{
			type: 'paragraph',
			html: 'NASA has also announced its Fission Surface Power program, which aims to land a 100-kWe reactor on the lunar surface by 2030. This program’s requirements align with our manufacturing core competencies and design. We believe nuclear power is critical to enabling a space-based industrial economy.'
		},
		{
			type: 'paragraph',
			html: 'These initiatives demonstrate a clear reality: the United States requires safe, reliable, 24/7 energy across Earth, space, and underwater to assure national security and leadership on the global stage.'
		},
		{ type: 'heading', text: 'Our Long-Term Vision' },
		{
			type: 'paragraph',
			html: 'Over the long term, our goal is simple: abundant energy throughout the Solar System. We’re building the engineering prime of strategic energy, a firm capable of delivering complete fission-powered solutions to the military, NASA, and other federal, commercial, and allied partners. We\'re focused on enabling high-value mission capabilities, not just a “box of power” that replaces a diesel generator.'
		},
		{
			type: 'paragraph',
			html: 'With this fundraise, we move one step closer to that vision. We have the facilities, the fuel, and the team to execute one of the fastest and most consequential nuclear development timelines in modern history. The work ahead is hard, but we are clear-eyed and focused on the challenges.'
		},
		{
			type: 'paragraph',
			html: 'To everyone at Antares: thank you for your determination and hard work. Thank you for the engineering rigor and pride you bring to this effort.'
		},
		{
			type: 'paragraph',
			html: 'To our partners in government and the commercial sector: we look forward to listening to your needs and building systems that revitalize American industrial capacity and technological leadership.'
		},
		{
			type: 'paragraph',
			html: 'And to those who want to help build nuclear hardware, come build with us—we’re hiring.'
		},
		{
			type: 'paragraph',
			html: '-- Jordan'
		}
	]
};
