<!--
	@component
	A field of stars around Antares, filling its parent. Antares is a link
	home: hover it and the field turns into its system, every star swinging
	round it on its own orbit (the near ones faster, Kepler-style) and
	leaving a trail that fades out behind it, like a long exposure. Let go
	and they wind back into place, each drawing its trail in behind it. Click and the stars spiral in, Antares swells to fill the
	screen in white, and the home page opens behind it.

	At rest the whole field drifts a little against the pointer, but never
	as one: every star has its own depth (how far it shifts) and its own
	lag (how slowly it follows), so the sky separates into layers as you
	move and settles star by star. Up close, the pointer also bends the
	field round it, like gravitational lensing: stars near it lean away and
	brighten a touch. Each star rides its own soft spring, so they ease
	out of the way, pick up a little wake when the pointer moves fast, and
	settle back.

	The stars and Antares's glow are drawn in WebGL2 (StarSky): points of
	light with soft cores, faint colour, twinkle and, on the brightest,
	hairline spikes; Antares with layered bloom and diffraction spikes.
	Antares has to be found: its name only shows on hover, and its glow
	warms up as the pointer gets close. Without WebGL2, round dots, a CSS
	gradient and trails on a 2D canvas stand in. The field is drawn after mount, clear of
	anything in the parent marked `data-stars-avoid`. With reduced motion
	nothing moves and the link just navigates.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { gsap, prefersReducedMotion } from '$lib/scroll';
	import { StarSky } from '$lib/three/StarSky';

	let {
		name,
		label,
		distance,
		href,
		home,
		onwarp
	}: {
		/** The star's name, beside it. */
		name: string;
		/** Key and value on the line under the name: "DIST", "~550 LY". */
		label: string;
		distance: string;
		/** Where clicking the star goes. */
		href: string;
		/** What clicking it does, for screen readers: "Go to homepage". */
		home: string;
		/** Called as the click animation starts, so the page can clear away. */
		onwarp?: () => void;
	} = $props();

	/** A star: where it sits (0–1 of the field), how it looks, how near it seems. */
	type Star = {
		x: number;
		y: number;
		radius: number;
		brightness: number;
		seed: number;
		temp: number;
		depth: number;
	};
	/** A star placed on screen: its offset from Antares and how it orbits. */
	type Body = {
		/** The fallback's elements, without WebGL. */
		el?: HTMLElement;
		dot?: HTMLElement;
		r: number;
		a: number;
		twist: number;
		omega: number;
		depth: number;
		/** The star's look, for its trail: radius (CSS px), brightness, temperature. */
		radius: number;
		brightness: number;
		temp: number;
		/** The pointer's push: spring offset (px) and its velocity (px/s). */
		x: number;
		y: number;
		vx: number;
		vy: number;
		/** Parallax: how far this star shifts, its spring's stiffness, and that spring's offset and velocity. */
		par: number;
		soft: number;
		qx: number;
		qy: number;
		qvx: number;
		qvy: number;
		/** How close the pointer is, 0–1, eased. */
		near: number;
		/** Last written position and scale, to skip writes when at rest. */
		lx: number;
		ly: number;
		ls: number;
	};

	/** The push's spring: soft, and damped enough that it barely overshoots. */
	const STIFFNESS = 60;
	const DAMPING = 13;

	const TAU = Math.PI * 2;
	const clamp = (min: number, max: number, v: number) => Math.min(max, Math.max(min, v));

	let field: HTMLElement;
	let antares: HTMLAnchorElement;
	let core: HTMLElement;
	let halo: HTMLElement;
	let glow: HTMLElement;
	let canvas: HTMLCanvasElement;
	let sky: StarSky | undefined;
	let gl = $state(false);
	/** Each star's alpha, tweened: fading in on load, out on click. */
	let vis: { a: number }[] = [];
	/** x, y, alpha and nearness per star, handed to the GPU each frame. */
	let frame = new Float32Array(0);
	/** The glow's state, tweened: fading in on load, hovered, flaring on click. */
	const lux = { intro: 1, hover: 0, flare: 0 };
	/** How close the pointer is to Antares, 0–1, eased. */
	let warmth = 0;
	let tag: HTMLElement;
	let arrow: SVGElement;
	let stars = $state<Star[]>([]);
	const wraps: HTMLElement[] = $state([]);
	const dots: HTMLElement[] = $state([]);
	/** Trails, eight floats each, handed to the GPU each frame. */
	let arcs = new Float32Array(0);
	let trails = 0;
	/** Where trails fade out: the copy and the label, relative to the field. */
	let avoidRects: { left: number; top: number; right: number; bottom: number }[] = [];
	/** The fallback's trails, without WebGL. */
	let flat = $state<HTMLCanvasElement>();

	/** Hover (0–1), orbit clock (s), collapse (0–1), exposure (how much of each trail shows, 0–1). */
	const s = { h: 0, t: 0, c: 0, e: 0 };
	/**
	 * Where hover is heading, 0 or 1. Hover, exposure and the glow's hover
	 * follow it on critically damped springs rather than tweens: a spring
	 * keeps its velocity when the target flips, so going in and out quickly
	 * turns the stars round smoothly instead of restarting an ease.
	 */
	let aim = 0;
	const vel = { h: 0, e: 0, glow: 0 };
	/** A pending leave: brushing out past the edge and straight back in doesn't count. */
	let leaving: gsap.core.Tween | null = null;
	/** The pointer on the field (px) and its smoothed velocity (px/s). */
	const pointer = { x: 0, y: 0, vx: 0, vy: 0, on: false, at: 0 };
	/** How far the pointer's pull reaches, and how hard it pushes at the centre. */
	let reach = 200;
	let bodies: Body[] = [];
	let W = 0;
	let H = 0;
	let AX = 0;
	let AY = 0;
	let orbiting = false;
	let warping = false;
	let reduce = false;

	/**
	 * Scatters stars by area, about one per 40,000px², kept clear of the
	 * copy and of Antares and its label. A few are bright, most are middling,
	 * some faint; fainter stars sit further back (less parallax). Radii are
	 * in px at the 1440 design width.
	 */
	function scatter() {
		const f = field.getBoundingClientRect();
		const pad = 24;
		const avoid = [
			...(field.parentElement?.querySelectorAll<HTMLElement>('[data-stars-avoid]') ?? []),
			antares.querySelector<HTMLElement>('.hit'),
			tag
		]
			.filter((el): el is HTMLElement => !!el)
			.map((el) => el.getBoundingClientRect());
		const blocked = (x: number, y: number) =>
			avoid.some(
				(r) =>
					x > r.left - f.left - pad &&
					x < r.right - f.left + pad &&
					y > r.top - f.top - pad &&
					y < r.bottom - f.top + pad
			);

		const count = clamp(14, 60, Math.round((f.width * f.height) / 40000));
		const out: Star[] = [];
		for (let tries = 0; out.length < count && tries < count * 40; tries++) {
			const x = Math.random();
			const y = Math.random();
			if (blocked(x * f.width, y * f.height)) continue;
			const roll = Math.random();
			const [radius, brightness] =
				roll < 0.25 ? [0.8, 0.4] : roll < 0.7 ? [1.1, 0.75] : roll < 0.93 ? [1.4, 1.1] : [1.8, 1.6];
			out.push({
				x,
				y,
				radius,
				brightness,
				seed: Math.random(),
				temp: Math.random() * 2 - 1,
				depth: clamp(0.3, 1, brightness / 1.1)
			});
		}
		return out;
	}

	/** Works out every star's place relative to Antares, at the current size. */
	function measure() {
		const f = field.getBoundingClientRect();
		const a = core.getBoundingClientRect();
		W = f.width;
		H = f.height;
		// Radii are at the 1440 design width; the field's font size scales with it.
		const unit = parseFloat(getComputedStyle(field).fontSize) / 16;
		sky?.resize(W, H);
		sky?.setStars(stars.map((st) => ({ ...st, radius: st.radius * unit })));
		if (frame.length !== stars.length * 4) frame = new Float32Array(stars.length * 4);
		if (arcs.length !== stars.length * 8) arcs = new Float32Array(stars.length * 8);
		// Trails fade away from the copy and from Antares's label.
		const avoid = [...(field.parentElement?.querySelectorAll<HTMLElement>('[data-stars-avoid]') ?? []), tag];
		avoidRects = avoid.map((el) => {
			const r = el.getBoundingClientRect();
			return { left: r.left - f.left, top: r.top - f.top, right: r.right - f.left, bottom: r.bottom - f.top };
		});
		sky?.setAvoid(avoidRects);
		if (flat) {
			const dpr = Math.min(devicePixelRatio || 1, 2);
			flat.width = Math.round(W * dpr);
			flat.height = Math.round(H * dpr);
			flat.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
		}
		AX = a.left + a.width / 2 - f.left;
		AY = a.top + a.height / 2 - f.top;
		reach = clamp(110, 220, 0.18 * Math.min(W, H));
		// The radius that orbits at the base rate; nearer is faster.
		const R0 = 0.22 * Math.min(W, H);
		bodies = stars.map((star, i) => {
			const dx = star.x * W - AX;
			const dy = star.y * H - AY;
			const r = Math.hypot(dx, dy) || 1;
			const k = R0 / r;
			const a = Math.atan2(dy, dx);
			return {
				el: wraps[i],
				dot: dots[i],
				r,
				a,
				twist: clamp(0.06, 1.3, 1.1 * k ** 1.1),
				omega: clamp(0.01, 0.8, 0.3 * k ** 1.5),
				depth: star.depth,
				radius: star.radius * unit,
				brightness: star.brightness,
				temp: star.temp,
				x: 0,
				y: 0,
				vx: 0,
				vy: 0,
				// Brighter stars read as nearer, but each gets its own depth and
				// lag so no two drift together.
				par: star.depth * (0.35 + Math.random() * 0.65),
				soft: 5 + Math.random() * 16,
				qx: 0,
				qy: 0,
				qvx: 0,
				qvy: 0,
				near: 0,
				lx: Infinity,
				ly: Infinity,
				ls: 1
			};
		});
		render(0);
	}

	/**
	 * One frame: each star's place on its orbit, then the pointer's push on
	 * top, through its spring. The push fades out while Antares is hovered
	 * (the orbits take over) and during the collapse.
	 */
	function render(dt: number) {
		// Clamped, so a stalled tab doesn't fling the springs.
		const step = Math.min(dt, 50) / 1000;
		if (orbiting) s.t += step;
		if (!reduce && !warping) {
			s.h = spring(s.h, 'h', aim, 5, step);
			s.e = spring(s.e, 'e', aim, 9, step);
			lux.hover = spring(lux.hover, 'glow', aim, 9, step);
		}
		// The wake dies away once the pointer stops.
		const decay = Math.exp(-step * 6);
		pointer.vx *= decay;
		pointer.vy *= decay;
		const lens = reduce ? 0 : (1 - s.h) * (1 - s.c);
		const push = 0.12 * reach;
		// Parallax target, opposite the pointer, as a share of the field: at
		// most about 1.4% of the width for the nearest stars.
		const gx = pointer.on && W ? -(pointer.x / W - 0.5) * W * 0.028 * lens : 0;
		const gy = pointer.on && H ? -(pointer.y / H - 0.5) * W * 0.028 * lens : 0;
		const ease = 1 - Math.exp(-step * 10);
		let trailCount = 0;
		const trailAlpha = Math.sqrt(s.e) * (1 - s.c) * (1 - s.c);
		const shrink = (1 - 0.12 * s.h) * (1 - s.c);

		bodies.forEach((b, i) => {
			const phi = s.h * (b.twist + b.omega * s.t) + s.c * (b.twist + 2);
			const rr = b.r * shrink;
			const ang = b.a + phi;
			const ox = AX + rr * Math.cos(ang);
			const oy = AY + rr * Math.sin(ang);

			// Where the pointer wants the star: pushed straight away from it,
			// smoothly less with distance and nothing past `reach`, plus some
			// of the pointer's own motion. Fainter stars move less.
			let tx = 0;
			let ty = 0;
			let near = 0;
			if (pointer.on && lens > 0) {
				const dx = ox - pointer.x;
				const dy = oy - pointer.y;
				const d = Math.hypot(dx, dy);
				if (d < reach) {
					const f = 1 - d / reach;
					near = f * f * (3 - 2 * f) * lens;
					const k = (push * near * b.depth) / (d || 1);
					const w = 0.012 * near * b.depth;
					tx = dx * k + pointer.vx * w;
					ty = dy * k + pointer.vy * w;
				}
			}
			b.vx += ((tx - b.x) * STIFFNESS - b.vx * DAMPING) * step;
			b.vy += ((ty - b.y) * STIFFNESS - b.vy * DAMPING) * step;
			b.x += b.vx * step;
			b.y += b.vy * step;
			b.near += (near - b.near) * ease;

			// The drift, on a softer spring of the star's own.
			const damp = 1.8 * Math.sqrt(b.soft);
			b.qvx += ((gx * b.par - b.qx) * b.soft - b.qvx * damp) * step;
			b.qvy += ((gy * b.par - b.qy) * b.soft - b.qvy * damp) * step;
			b.qx += b.qvx * step;
			b.qy += b.qvy * step;

			const x = ox + b.x + b.qx;
			const y = oy + b.y + b.qy;
			const alpha = vis[i]?.a ?? 1;
			frame[i * 4] = x;
			frame[i * 4 + 1] = y;
			frame[i * 4 + 2] = alpha;
			frame[i * 4 + 3] = 0.5 * b.near;
			// Without WebGL, the fallback's elements; skipped when nothing moved.
			if (b.el && (Math.abs(x - b.lx) > 0.01 || Math.abs(y - b.ly) > 0.01)) {
				b.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
				b.lx = x;
				b.ly = y;
			}
			if (b.el) b.el.style.opacity = String(alpha);
			const scale = 1 + 0.3 * b.near;
			if (b.dot && Math.abs(scale - b.ls) > 0.002) {
				b.dot.style.scale = String(scale);
				b.ls = scale;
			}

			// The trail runs back from where the star is drawn, so the two never
			// part, towards where it started, fading out behind it; past most of
			// a lap, only the last of it shows. As the exposure ends it draws in
			// behind the star on its way home.
			let head = Math.atan2(y - AY, x - AX) - b.a;
			head -= TAU * Math.round((head - phi) / TAU);
			const span = Math.min(Math.max(head, 0), TAU * 0.85) * s.e;
			if (trailAlpha > 0.002 && span > 0.002) {
				const hr = Math.hypot(x - AX, y - AY);
				arcs.set([hr, b.a, b.a + head, span, b.radius, 0.6 * b.brightness, b.temp, trailAlpha], trailCount * 8);
				trailCount++;
			}
		});
		trails = trailCount;

		// Warmer as the pointer closes in on Antares, from twice the lensing reach.
		let warm = 0;
		if (pointer.on && !reduce) {
			const f = clamp(0, 1, 1 - Math.hypot(pointer.x - AX, pointer.y - AY) / (2 * reach));
			warm = f * f * (3 - 2 * f);
		}
		warmth += (warm - warmth) * ease;
		light();
	}

	/**
	 * Draws the sky. Antares grows by exposure, as a real star does: closing
	 * in, hovering and clicking turn up its brightness, and more of its
	 * falloff clears the threshold. Only the click's flare also spreads it.
	 */
	function light() {
		const power = lux.intro * (0.75 + 0.35 * warmth) * (1 + 1.1 * lux.hover) * (1 + 10 * lux.flare);
		const spread = (0.5 + 0.5 * lux.intro) * (1 + 2.5 * lux.flare);
		// The spikes stay short and faint at rest, and reach out once found.
		const spikes = lux.intro * (0.6 + 0.1 * warmth + 0.6 * lux.hover + 1.4 * lux.flare);
		const glint = 0.5 + 0.15 * warmth + 0.3 * lux.hover + 0.5 * lux.flare;
		if (gl && sky) {
			const unit = core.offsetWidth / 8;
			sky.draw({
				time: reduce ? 4 : gsap.ticker.time,
				stars: frame,
				trails: arcs,
				trailCount: trails,
				center: { x: AX, y: AY },
				glow: {
					x: AX,
					y: AY,
					core: 4 * unit,
					extent: 256 * unit * (1 + 2 * lux.flare),
					power,
					spread,
					spikes,
					glint
				}
			});
		} else {
			halo.style.opacity = String(Math.min(1, 0.3 * power));
			halo.style.scale = String(spread);
			drawFlatTrails();
		}
	}

	/**
	 * The trails without WebGL: the same arcs on a 2D canvas, in short
	 * segments so each can fade, brightest at the star, and clear of the
	 * copy and label.
	 */
	function drawFlatTrails() {
		const g = flat?.getContext('2d');
		if (!g) return;
		g.clearRect(0, 0, W, H);
		if (!trails) return;
		g.strokeStyle = getComputedStyle(field).getPropertyValue('--grey-0');
		g.lineCap = 'butt';
		for (let n = 0; n < trails; n++) {
			const [r, , head, span, radius, brightness, , alpha] = arcs.subarray(n * 8, n * 8 + 8);
			g.lineWidth = Math.max(1, radius * 1.4);
			const steps = clamp(4, 48, Math.ceil((span * r) / 16));
			for (let k = 0; k < steps; k++) {
				const from = head - span * (1 - k / steps);
				const to = head - span * (1 - (k + 1) / steps);
				const mid = (from + to) / 2;
				const x = AX + r * Math.cos(mid);
				const y = AY + r * Math.sin(mid);
				let clear = 1;
				for (const box of avoidRects) {
					const d = Math.hypot(
						Math.max(box.left - x, x - box.right, 0),
						Math.max(box.top - y, y - box.bottom, 0)
					);
					clear = Math.min(clear, clamp(0, 1, d / 40));
				}
				g.globalAlpha = Math.min(1, 0.6 * brightness * alpha * ((k + 0.5) / steps) ** 1.6 * clear);
				g.beginPath();
				g.arc(AX, AY, r, from, to);
				g.stroke();
			}
		}
		g.globalAlpha = 1;
	}

	const ticker = (_time: number, dt: number) => render(dt);

	/** One step of a critically damped spring towards `target`, kept within 0–1. */
	function spring(value: number, key: keyof typeof vel, target: number, stiffness: number, step: number) {
		vel[key] += ((target - value) * stiffness - vel[key] * 2 * Math.sqrt(stiffness)) * step;
		const next = value + vel[key] * step;
		if (next < 0 || next > 1) vel[key] = 0;
		return clamp(0, 1, next);
	}

	function enter() {
		if (warping) return;
		// Back before the leave took effect: carry on as if it never happened.
		leaving?.kill();
		leaving = null;
		gsap.to(arrow, { x: 0, autoAlpha: 1, duration: 0.6, ease: 'expo.out', overwrite: 'auto' });
		// The label rises in from below only if it had gone; otherwise it
		// carries on from wherever it is.
		const labels = [...tag.children] as HTMLElement[];
		if (!reduce && Number(gsap.getProperty(labels[0], 'opacity')) < 0.05) gsap.set(labels, { y: 10 });
		gsap.to(labels, { autoAlpha: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.07, overwrite: 'auto' });
		if (reduce) return;
		// Back from rest: start the clock over, so orbits pick up where the twist leaves them.
		if (s.h < 0.01) s.t = 0;
		orbiting = true;
		aim = 1;
		gsap.to(core, { scale: 1.35, duration: 0.6, ease: 'back.out(3)', overwrite: 'auto' });
	}

	function leave() {
		if (warping) return;
		leaving?.kill();
		leaving = gsap.delayedCall(0.15, settle);
	}

	/** The leave, once it's held: label out, stars home, each trail drawn in behind its star. */
	function settle() {
		leaving = null;
		gsap.to(arrow, { x: -6, autoAlpha: 0, duration: 0.4, ease: 'power2.inOut', overwrite: 'auto' });
		gsap.to(tag.children, {
			autoAlpha: 0,
			y: reduce ? 0 : -6,
			duration: 0.4,
			ease: 'power2.in',
			stagger: 0.04,
			overwrite: 'auto'
		});
		if (reduce) return;
		orbiting = false;
		aim = 0;
		gsap.to(core, { scale: 1, duration: 0.6, ease: 'power2.inOut', overwrite: 'auto' });
	}

	/**
	 * The way home: the stars spiral into Antares, then it grows past the
	 * edges of the screen in white and the home page takes over. Modified
	 * clicks (new tab, new window) are left to the browser.
	 */
	function warp(e: MouseEvent) {
		if (reduce || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
		e.preventDefault();
		if (warping) return;
		warping = true;
		orbiting = false;
		leaving?.kill();
		onwarp?.();
		gsap.killTweensOf(vis);
		// Large enough that the disc's solid middle covers the screen's farthest corner.
		const corner = Math.hypot(Math.max(AX, W - AX), Math.max(AY, H - AY));
		const cover = (2 * corner) / (0.5 * core.offsetWidth) + 2;
		gsap
			.timeline({ onComplete: () => goto(href) })
			.to(s, { c: 1, duration: 0.9, ease: 'power2.in' }, 0)
			.to(vis, { a: 0, duration: 0.25, ease: 'power2.in' }, 0.65)
			.to(tag, { autoAlpha: 0, duration: 0.3, ease: 'power2.in' }, 0)
			.to(lux, { flare: 1, duration: 0.9, ease: 'power2.in' }, 0)
			.to(core, { autoAlpha: 1, duration: 0.2, ease: 'power2.in' }, 0.5)
			.to(core, { scale: cover, duration: 0.6, ease: 'expo.in' }, 0.5);
	}

	onMount(() => {
		reduce = prefersReducedMotion();
		sky = new StarSky(canvas);
		gl = sky.ok;
		sky.tint(getComputedStyle(field).getPropertyValue('--accent-500'));
		stars = scatter();
		vis = stars.map(() => ({ a: 1 }));
		let observer: ResizeObserver | undefined;
		let ctx: gsap.Context | undefined;

		tick().then(() => {
			measure();
			observer = new ResizeObserver(measure);
			observer.observe(field);
			if (reduce) return;

			ctx = gsap.context(() => {
				gsap.ticker.add(ticker);
				gsap.set(arrow, { x: -6 });
				gsap.from(vis, {
					a: 0,
					duration: 1.2,
					ease: 'power2.out',
					delay: 0.2,
					stagger: { amount: 1.4, from: 'random' }
				});
				if (!gl) gsap.from(core, { scale: 0, duration: 0.9, ease: 'back.out(2)', delay: 0.4 });
				gsap.fromTo(lux, { intro: 0 }, { intro: 1, duration: 2.4, ease: 'expo.out', delay: 0.4 });
				// The CSS stand-in breathes; the shader flickers on its own.
				if (!gl) gsap.to(glow, { scale: 1.12, opacity: 0.7, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1 });
				// The shader twinkles its own; the fallback's dots get a tween.
				if (!gl) {
					for (const dot of dots) {
						if (Math.random() > 0.35) continue;
						gsap.to(dot, {
							opacity: gsap.utils.random(0.2, 0.55),
							duration: gsap.utils.random(1.2, 3.2),
							ease: 'sine.inOut',
							yoyo: true,
							repeat: -1,
							delay: gsap.utils.random(1, 4)
						});
					}
				}
			}, field);
		});

		// Mouse, pen or a dragged finger. Velocity is smoothed over a few
		// events, so one jittery sample doesn't kick the stars.
		const onpointermove = (e: PointerEvent) => {
			const f = field.getBoundingClientRect();
			const x = e.clientX - f.left;
			const y = e.clientY - f.top;
			const dt = (e.timeStamp - pointer.at) / 1000;
			if (pointer.on && dt > 0 && dt < 0.1) {
				pointer.vx += ((x - pointer.x) / dt - pointer.vx) * 0.35;
				pointer.vy += ((y - pointer.y) / dt - pointer.vy) * 0.35;
			}
			pointer.x = x;
			pointer.y = y;
			pointer.at = e.timeStamp;
			pointer.on = true;
		};
		const release = (e: PointerEvent) => {
			if (e.type === 'pointerleave' || e.pointerType !== 'mouse') pointer.on = false;
		};
		const root = document.documentElement;
		if (!reduce) {
			addEventListener('pointermove', onpointermove);
			addEventListener('pointerup', release);
			addEventListener('pointercancel', release);
			root.addEventListener('pointerleave', release);
		}

		return () => {
			removeEventListener('pointermove', onpointermove);
			removeEventListener('pointerup', release);
			removeEventListener('pointercancel', release);
			root.removeEventListener('pointerleave', release);
			observer?.disconnect();
			gsap.ticker.remove(ticker);
			leaving?.kill();
			gsap.killTweensOf([s, lux, ...vis]);
			ctx?.revert();
			sky?.destroy();
		};
	});
</script>

<div class="field" bind:this={field}>
	<canvas class="sky" class:gl bind:this={canvas} aria-hidden="true"></canvas>

	{#if !gl}
		<canvas class="flat" bind:this={flat} aria-hidden="true"></canvas>
		{#each stars as star, i (i)}
			<span class="star" bind:this={wraps[i]} aria-hidden="true">
				<span class="dot" bind:this={dots[i]} style:--d={star.radius / 5}></span>
			</span>
		{/each}
	{/if}

	<a
		class="antares"
		class:gl
		{href}
		aria-label="{name}: {home}"
		bind:this={antares}
		onmouseenter={enter}
		onmouseleave={leave}
		onfocus={enter}
		onblur={leave}
		onclick={warp}
	>
		<span class="halo" bind:this={halo}><span class="glow" bind:this={glow}></span></span>
		<span class="hit"></span>
		<span class="core" bind:this={core}></span>
		<span class="tag type-body-default" bind:this={tag} aria-hidden="true">
			<span class="name">
				{name}
				<svg bind:this={arrow} viewBox="0 0 16 16"><path d="M2 8h12M8.27 13.72 14 8 8.27 2.26" /></svg>
			</span>
			<span class="dist"><span>{label}</span><span class="type-tabular">{distance}</span></span>
		</span>
	</a>
</div>

<style>
	/* Antares's place on the field: right of centre, a little low. On mobile
	   it moves in, so its label still fits. */
	.field {
		--ax: 65%;
		--ay: 52%;
		position: absolute;
		inset: 0;
		overflow: hidden;
	}
	@media screen and (max-width: 767px) {
		.field {
			--ax: 48%;
			--ay: 64%;
		}
	}

	.star {
		position: absolute;
		top: 0;
		left: 0;
		will-change: transform;
	}
	.dot {
		position: absolute;
		width: calc(var(--size-font) * var(--d));
		height: calc(var(--size-font) * var(--d));
		translate: -50% -50%;
		border-radius: 50%;
		background: var(--grey-0);
	}

	/* The stars and Antares's glow. Screen-blended: its black is see-through. */
	.sky {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		mix-blend-mode: screen;
		pointer-events: none;
	}
	.flat {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
	.sky:not(.gl),
	.gl .halo {
		display: none;
	}

	.antares {
		position: absolute;
		top: var(--ay);
		left: var(--ax);
		color: var(--grey-0);
		text-decoration: none;
		outline: none;
	}
	.antares > span {
		position: absolute;
	}
	/* Everything is placed from Antares's centre. */
	.halo,
	.hit,
	.core {
		translate: -50% -50%;
	}

	.halo {
		width: calc(var(--size-font) * 7);
		height: calc(var(--size-font) * 7);
		opacity: 0.4;
		pointer-events: none;
	}
	.glow {
		display: block;
		width: 100%;
		height: 100%;
		border-radius: 50%;
		background: radial-gradient(closest-side, var(--accent-500), transparent);
	}

	/* A generous target round a small star. */
	.hit {
		width: calc(var(--size-font) * 4);
		height: calc(var(--size-font) * 4);
	}
	.antares:focus-visible .hit {
		outline: 1px solid var(--grey-400);
		outline-offset: 2px;
	}

	/* A soft white disc. With WebGL the shader draws the star, and this only
	   shows on click, growing to fill the screen. */
	.core {
		width: calc(var(--size-font) * 0.5);
		height: calc(var(--size-font) * 0.5);
		border-radius: 50%;
		background: radial-gradient(closest-side, var(--grey-0) 50%, transparent);
	}
	.gl .core {
		opacity: 0;
		visibility: hidden;
	}

	.tag {
		top: calc(var(--size-font) * -0.875);
		left: calc(var(--size-font) * 3.5);
		display: grid;
		white-space: nowrap;
	}
	.name {
		display: flex;
		gap: var(--space-8);
		align-items: center;
	}
	.name svg {
		width: calc(var(--size-font) * 0.875);
		height: calc(var(--size-font) * 0.875);
		fill: none;
		stroke: currentColor;
		opacity: 0;
		visibility: hidden;
		translate: 0 6%;
	}
	/* Hidden until Antares is found. */
	.tag > span {
		opacity: 0;
		visibility: hidden;
	}
	.dist {
		display: flex;
		gap: var(--space-24);
		color: var(--grey-400);
	}
	@media screen and (max-width: 767px) {
		.tag {
			left: calc(var(--size-font) * 2.25);
		}
	}
</style>
